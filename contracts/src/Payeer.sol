// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/// @title Payeer
/// @notice Payment requests (links / invoices), memo'd sends and batch payouts in USDC on Arc.
/// @dev Uses the USDC ERC-20 interface (6 decimals). Payers must approve this contract first.
///      Deployed behind a UUPS proxy so the app can gain features without changing its address
///      or losing history. Only the owner can upgrade.
contract Payeer is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Paid,
        Cancelled
    }

    struct Request {
        address creator;
        uint96 amount; // 0 = payer chooses the amount
        uint40 expiresAt; // 0 = never expires
        bool reusable; // true = stays open after payment (tip jar / checkout link)
        Status status;
        uint32 payments;
        uint256 totalReceived;
    }

    /// @notice One line in a user's activity feed. Two slots, written for payer and payee.
    /// @dev Arc RPCs cap `eth_getLogs` ranges, so the feed lives in storage rather than in events.
    struct Entry {
        address counterparty; // address(0) for a batch summary
        uint96 amount;
        uint40 at;
        Kind kind;
        uint40 ref; // request id where relevant
    }

    enum Kind {
        None,
        SentOut,
        ReceivedIn,
        RequestPaidOut,
        RequestPaidIn,
        BatchOut
    }

    uint256 public constant MAX_BATCH = 50;
    uint256 public constant MAX_MEMO = 280;

    IERC20 public usdc;
    uint256 public requestCount;
    mapping(uint256 => Request) public requests;
    mapping(uint256 => string) public memoOf;
    mapping(address => uint256[]) internal _requestsBy;
    mapping(address => Entry[]) internal _feed;

    event RequestCreated(
        uint256 indexed id, address indexed creator, uint256 amount, uint40 expiresAt, bool reusable, string memo
    );
    event RequestPaid(uint256 indexed id, address indexed payer, address indexed creator, uint256 amount);
    event RequestCancelled(uint256 indexed id);
    event Sent(address indexed from, address indexed to, uint256 amount, string memo);
    event BatchPaid(address indexed from, uint256 recipients, uint256 total, string memo);

    error InvalidAmount();
    error InvalidExpiry();
    error InvalidRecipient();
    error MemoTooLong();
    error NotOpen();
    error Expired();
    error NotCreator();
    error SelfPayment();
    error LengthMismatch();
    error BatchTooLarge();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(IERC20 _usdc, address owner) external initializer {
        __Ownable_init(owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        usdc = _usdc;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// @dev Reserved so later versions can add storage without disturbing existing layout.
    uint256[45] private __gap;

    // ---------------------------------------------------------------- requests

    function createRequest(uint96 amount, uint40 expiresAt, bool reusable, string calldata memo)
        external
        returns (uint256 id)
    {
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry();
        if (bytes(memo).length > MAX_MEMO) revert MemoTooLong();

        id = ++requestCount;
        requests[id] = Request({
            creator: msg.sender,
            amount: amount,
            expiresAt: expiresAt,
            reusable: reusable,
            status: Status.Open,
            payments: 0,
            totalReceived: 0
        });
        memoOf[id] = memo;
        _requestsBy[msg.sender].push(id);
        emit RequestCreated(id, msg.sender, amount, expiresAt, reusable, memo);
    }

    /// @param amount Must equal the request amount for fixed requests; any non-zero value for open ones.
    function payRequest(uint256 id, uint256 amount) external nonReentrant {
        Request storage r = requests[id];
        if (r.status != Status.Open) revert NotOpen();
        if (r.expiresAt != 0 && block.timestamp > r.expiresAt) revert Expired();
        if (msg.sender == r.creator) revert SelfPayment();
        if (amount == 0 || (r.amount != 0 && amount != r.amount)) revert InvalidAmount();

        r.payments += 1;
        r.totalReceived += amount;
        if (!r.reusable) r.status = Status.Paid;

        usdc.safeTransferFrom(msg.sender, r.creator, amount);
        _record(msg.sender, r.creator, amount, Kind.RequestPaidOut, Kind.RequestPaidIn, uint40(id));
        emit RequestPaid(id, msg.sender, r.creator, amount);
    }

    function cancelRequest(uint256 id) external {
        Request storage r = requests[id];
        if (r.creator != msg.sender) revert NotCreator();
        if (r.status != Status.Open) revert NotOpen();
        r.status = Status.Cancelled;
        emit RequestCancelled(id);
    }

    /// @notice Status as the UI should show it: an open request past its expiry reads as expired.
    function isExpired(uint256 id) external view returns (bool) {
        Request storage r = requests[id];
        return r.status == Status.Open && r.expiresAt != 0 && block.timestamp > r.expiresAt;
    }

    function requestsBy(address creator) external view returns (uint256[] memory) {
        return _requestsBy[creator];
    }

    // ---------------------------------------------------------------- activity

    function _record(address from, address to, uint256 amount, Kind outKind, Kind inKind, uint40 ref) internal {
        _push(from, to, amount, outKind, ref);
        _push(to, from, amount, inKind, ref);
    }

    function _push(address who, address counterparty, uint256 amount, Kind kind, uint40 ref) internal {
        // Feed entries pack the amount into 96 bits; reject anything that wouldn't fit rather than truncate.
        if (amount > type(uint96).max) revert InvalidAmount();
        _feed[who].push(
            Entry({
                counterparty: counterparty,
                amount: uint96(amount),
                at: uint40(block.timestamp),
                kind: kind,
                ref: ref
            })
        );
    }

    function feedLength(address who) external view returns (uint256) {
        return _feed[who].length;
    }

    /// @notice Newest-first page of `who`'s activity.
    function feed(address who, uint256 skip, uint256 limit) external view returns (Entry[] memory page) {
        uint256 len = _feed[who].length;
        if (skip >= len) return new Entry[](0);
        uint256 n = len - skip;
        if (n > limit) n = limit;
        page = new Entry[](n);
        for (uint256 i; i < n; ++i) {
            page[i] = _feed[who][len - 1 - skip - i];
        }
    }

    // ------------------------------------------------------------------ sends

    function send(address to, uint256 amount, string calldata memo) external nonReentrant {
        if (to == address(0) || to == msg.sender) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (bytes(memo).length > MAX_MEMO) revert MemoTooLong();

        usdc.safeTransferFrom(msg.sender, to, amount);
        _record(msg.sender, to, amount, Kind.SentOut, Kind.ReceivedIn, 0);
        emit Sent(msg.sender, to, amount, memo);
    }

    function batchPay(address[] calldata to, uint256[] calldata amounts, string calldata memo)
        external
        nonReentrant
    {
        uint256 n = to.length;
        if (n == 0 || n != amounts.length) revert LengthMismatch();
        if (n > MAX_BATCH) revert BatchTooLarge();
        if (bytes(memo).length > MAX_MEMO) revert MemoTooLong();

        uint256 total;
        for (uint256 i; i < n; ++i) {
            if (to[i] == address(0)) revert InvalidRecipient();
            if (amounts[i] == 0) revert InvalidAmount();
            total += amounts[i];
            usdc.safeTransferFrom(msg.sender, to[i], amounts[i]);
            _push(to[i], msg.sender, amounts[i], Kind.ReceivedIn, 0);
            emit Sent(msg.sender, to[i], amounts[i], memo);
        }
        // One summary line for the sender instead of one per recipient.
        _push(msg.sender, address(0), total, Kind.BatchOut, uint40(n));
        emit BatchPaid(msg.sender, n, total, memo);
    }
}
