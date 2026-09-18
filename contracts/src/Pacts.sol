// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/// @title Pacts
/// @notice Group escrow in USDC. Everyone stakes the same amount on one of several outcomes.
///         The pot goes to the backers of the winning outcome, split evenly.
///
///         Settlement paths:
///         1. Unanimous vote by every participant (always available once joining closes).
///         2. AI-assisted pacts: the resolver proposes an outcome with a source. Any participant can
///            dispute within the challenge window, which drops the pact back to path 1.
///         3. Nothing settled by `resolveBy` -> everyone can reclaim their stake.
///         Outcome 0 means "void" and refunds everyone. Funds are never stuck.
///      Deployed behind a UUPS proxy: upgradeable by the owner, keeping its address and history.
contract Pacts is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    enum Phase {
        None,
        Active,
        Settled,
        Refunded
    }

    struct Pact {
        address creator;
        uint96 stake;
        uint40 joinDeadline;
        uint40 resolveBy;
        uint32 challengeWindow;
        uint8 optionCount;
        uint8 maxParticipants;
        uint8 participantCount;
        bool aiResolved;
        Phase phase;
        // AI proposal
        bool proposed;
        bool disputed;
        uint8 proposedOption;
        uint40 proposedAt;
        // settlement
        uint8 winningOption;
        uint8 winnerCount;
        uint8 claimCount;
        uint256 paidOut;
    }

    uint8 public constant MAX_OPTIONS = 8;
    uint8 public constant MAX_PARTICIPANTS = 20;
    uint32 public constant MIN_CHALLENGE = 1 hours;
    uint32 public constant MAX_CHALLENGE = 7 days;
    uint256 public constant MAX_DURATION = 365 days;
    uint256 public constant MAX_TEXT = 500;

    IERC20 public usdc;
    address public resolver;
    uint256 public pactCount;

    mapping(uint256 => Pact) internal _pacts;
    mapping(uint256 => address[]) internal _participants;
    mapping(uint256 => mapping(address => uint8)) public pickOf; // 0 = not joined
    mapping(uint256 => mapping(address => uint8)) public voteOf; // 0 = no vote, else option + 1
    mapping(uint256 => mapping(uint8 => uint8)) public voteTally; // by option
    mapping(uint256 => mapping(uint8 => uint8)) public backers; // by option
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => string) public termsOf;
    mapping(uint256 => string) public proposalSourceOf;
    mapping(uint256 => string[]) internal _options;
    mapping(address => uint256[]) internal _pactsOf;

    event PactCreated(
        uint256 indexed id,
        address indexed creator,
        uint256 stake,
        uint40 joinDeadline,
        uint40 resolveBy,
        bool aiResolved,
        string terms
    );
    event Joined(uint256 indexed id, address indexed who, uint8 option);
    event Voted(uint256 indexed id, address indexed who, uint8 option);
    event OutcomeProposed(uint256 indexed id, uint8 option, string source, uint40 finalizableAt);
    event Disputed(uint256 indexed id, address indexed by);
    event Settled(uint256 indexed id, uint8 option, uint8 winners, uint256 pot);
    event Refunded(uint256 indexed id);
    event Claimed(uint256 indexed id, address indexed who, uint256 amount);
    event ResolverUpdated(address resolver);

    error BadParams();
    error NotActive();
    error JoinClosed();
    error JoiningOpen();
    error AlreadyJoined();
    error PactFull();
    error BadOption();
    error NotParticipant();
    error NotResolver();
    error NotAiPact();
    error AlreadyProposed();
    error NoProposal();
    error AlreadyDisputed();
    error WindowOpen();
    error WindowClosed();
    error TooLate();
    error TooEarly();
    error NothingToClaim();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(IERC20 _usdc, address _resolver, address _owner) external initializer {
        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        usdc = _usdc;
        resolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @dev Reserved so later versions can add storage without disturbing existing layout.
    uint256[45] private __gap;

    function setResolver(address _resolver) external onlyOwner {
        resolver = _resolver;
        emit ResolverUpdated(_resolver);
    }

    // ------------------------------------------------------------------ create / join

    struct CreateParams {
        uint96 stake;
        uint40 joinDeadline;
        uint40 resolveBy;
        uint8 maxParticipants;
        bool aiResolved;
        uint32 challengeWindow;
        uint8 pick; // creator's option, 1-based
        string terms;
        string[] options;
    }

    function createPact(CreateParams calldata p) external nonReentrant returns (uint256 id) {
        uint256 n = p.options.length;
        if (p.stake == 0 || n < 2 || n > MAX_OPTIONS) revert BadParams();
        if (p.maxParticipants < 2 || p.maxParticipants > MAX_PARTICIPANTS) revert BadParams();
        if (p.joinDeadline <= block.timestamp || p.resolveBy < p.joinDeadline) revert BadParams();
        if (p.resolveBy > block.timestamp + MAX_DURATION) revert BadParams();
        if (p.aiResolved && (p.challengeWindow < MIN_CHALLENGE || p.challengeWindow > MAX_CHALLENGE)) {
            revert BadParams();
        }
        uint256 textLen = bytes(p.terms).length;
        for (uint256 i; i < n; ++i) {
            textLen += bytes(p.options[i]).length;
        }
        if (bytes(p.terms).length == 0 || textLen > MAX_TEXT) revert BadParams();
        if (p.pick == 0 || p.pick > n) revert BadOption();

        id = ++pactCount;
        Pact storage pact = _pacts[id];
        pact.creator = msg.sender;
        pact.stake = p.stake;
        pact.joinDeadline = p.joinDeadline;
        pact.resolveBy = p.resolveBy;
        pact.challengeWindow = p.aiResolved ? p.challengeWindow : 0;
        pact.optionCount = uint8(n);
        pact.maxParticipants = p.maxParticipants;
        pact.aiResolved = p.aiResolved;
        pact.phase = Phase.Active;

        termsOf[id] = p.terms;
        for (uint256 i; i < n; ++i) {
            _options[id].push(p.options[i]);
        }
        emit PactCreated(id, msg.sender, p.stake, p.joinDeadline, p.resolveBy, p.aiResolved, p.terms);
        _join(id, pact, p.pick);
    }

    function join(uint256 id, uint8 option) external nonReentrant {
        Pact storage pact = _active(id);
        if (block.timestamp > pact.joinDeadline) revert JoinClosed();
        if (pickOf[id][msg.sender] != 0) revert AlreadyJoined();
        if (pact.participantCount >= pact.maxParticipants) revert PactFull();
        if (option == 0 || option > pact.optionCount) revert BadOption();
        _join(id, pact, option);
    }

    function _join(uint256 id, Pact storage pact, uint8 option) internal {
        pickOf[id][msg.sender] = option;
        _participants[id].push(msg.sender);
        _pactsOf[msg.sender].push(id);
        pact.participantCount += 1;
        backers[id][option] += 1;
        usdc.safeTransferFrom(msg.sender, address(this), pact.stake);
        emit Joined(id, msg.sender, option);
    }

    // ------------------------------------------------------------------ settle

    /// @notice Vote for an outcome (0 = void). Settles once every participant agrees.
    function vote(uint256 id, uint8 option) external {
        Pact storage pact = _active(id);
        if (pickOf[id][msg.sender] == 0) revert NotParticipant();
        if (!_joiningClosed(pact)) revert JoiningOpen();
        if (option > pact.optionCount) revert BadOption();

        uint8 prev = voteOf[id][msg.sender];
        if (prev != 0) voteTally[id][prev - 1] -= 1;
        voteOf[id][msg.sender] = option + 1;
        uint8 tally = ++voteTally[id][option];
        emit Voted(id, msg.sender, option);

        if (tally == pact.participantCount) _settle(id, pact, option);
    }

    function proposeOutcome(uint256 id, uint8 option, string calldata source) external {
        if (msg.sender != resolver) revert NotResolver();
        Pact storage pact = _active(id);
        if (!pact.aiResolved) revert NotAiPact();
        if (pact.proposed) revert AlreadyProposed();
        if (!_joiningClosed(pact)) revert JoiningOpen();
        if (block.timestamp > pact.resolveBy) revert TooLate();
        if (option > pact.optionCount) revert BadOption();
        if (bytes(source).length > MAX_TEXT) revert BadParams();

        pact.proposed = true;
        pact.proposedOption = option;
        pact.proposedAt = uint40(block.timestamp);
        proposalSourceOf[id] = source;
        emit OutcomeProposed(id, option, source, uint40(block.timestamp) + pact.challengeWindow);
    }

    function dispute(uint256 id) external {
        Pact storage pact = _active(id);
        if (pickOf[id][msg.sender] == 0) revert NotParticipant();
        if (!pact.proposed) revert NoProposal();
        if (pact.disputed) revert AlreadyDisputed();
        if (block.timestamp > uint256(pact.proposedAt) + pact.challengeWindow) revert WindowClosed();
        pact.disputed = true;
        emit Disputed(id, msg.sender);
    }

    /// @notice Anyone can finalize an undisputed proposal after its challenge window.
    function finalize(uint256 id) external {
        Pact storage pact = _active(id);
        if (!pact.proposed || pact.disputed) revert NoProposal();
        if (block.timestamp <= uint256(pact.proposedAt) + pact.challengeWindow) revert WindowOpen();
        _settle(id, pact, pact.proposedOption);
    }

    /// @notice Refund everyone when the pact can no longer settle: fewer than two people joined,
    ///         or `resolveBy` passed without an undisputed proposal.
    function refund(uint256 id) external {
        Pact storage pact = _active(id);
        bool underfilled = block.timestamp > pact.joinDeadline && pact.participantCount < 2;
        bool expired = block.timestamp > pact.resolveBy && !(pact.proposed && !pact.disputed);
        if (!underfilled && !expired) revert TooEarly();
        pact.phase = Phase.Refunded;
        emit Refunded(id);
    }

    function _settle(uint256 id, Pact storage pact, uint8 option) internal {
        uint8 winners = option == 0 ? 0 : backers[id][option];
        if (winners == 0) {
            pact.phase = Phase.Refunded;
            emit Refunded(id);
            return;
        }
        pact.phase = Phase.Settled;
        pact.winningOption = option;
        pact.winnerCount = winners;
        emit Settled(id, option, winners, _pot(pact));
    }

    // ------------------------------------------------------------------ claim

    function claim(uint256 id) external nonReentrant {
        Pact storage pact = _pacts[id];
        uint8 pick = pickOf[id][msg.sender];
        if (pick == 0 || claimed[id][msg.sender]) revert NothingToClaim();

        uint256 amount;
        if (pact.phase == Phase.Refunded) {
            amount = pact.stake;
        } else if (pact.phase == Phase.Settled && pick == pact.winningOption) {
            uint256 pot = _pot(pact);
            pact.claimCount += 1;
            // Last winner takes any rounding dust so the contract never keeps funds.
            amount = pact.claimCount == pact.winnerCount ? pot - pact.paidOut : pot / pact.winnerCount;
            pact.paidOut += amount;
        } else {
            revert NothingToClaim();
        }

        claimed[id][msg.sender] = true;
        usdc.safeTransfer(msg.sender, amount);
        emit Claimed(id, msg.sender, amount);
    }

    // ------------------------------------------------------------------ views

    function getPact(uint256 id) external view returns (Pact memory) {
        return _pacts[id];
    }

    function getParticipants(uint256 id) external view returns (address[] memory) {
        return _participants[id];
    }

    function getOptions(uint256 id) external view returns (string[] memory) {
        return _options[id];
    }

    function pactsOf(address who) external view returns (uint256[] memory) {
        return _pactsOf[who];
    }

    /// @notice What `who` could claim right now.
    function claimable(uint256 id, address who) external view returns (uint256) {
        Pact storage pact = _pacts[id];
        uint8 pick = pickOf[id][who];
        if (pick == 0 || claimed[id][who]) return 0;
        if (pact.phase == Phase.Refunded) return pact.stake;
        if (pact.phase == Phase.Settled && pick == pact.winningOption) {
            uint256 pot = _pot(pact);
            return pact.claimCount + 1 == pact.winnerCount ? pot - pact.paidOut : pot / pact.winnerCount;
        }
        return 0;
    }

    function _pot(Pact storage pact) internal view returns (uint256) {
        return uint256(pact.stake) * pact.participantCount;
    }

    function _joiningClosed(Pact storage pact) internal view returns (bool) {
        return block.timestamp > pact.joinDeadline || pact.participantCount == pact.maxParticipants;
    }

    function _active(uint256 id) internal view returns (Pact storage pact) {
        pact = _pacts[id];
        if (pact.phase != Phase.Active) revert NotActive();
    }
}
