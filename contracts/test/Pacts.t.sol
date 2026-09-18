// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Test} from "forge-std/Test.sol";
import {Pacts} from "../src/Pacts.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract PactsTest is Test {
    Pacts pacts;
    MockUSDC usdc;
    address owner = makeAddr("owner");
    address resolver = makeAddr("resolver");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");

    uint96 constant STAKE = 10e6;
    uint32 constant WINDOW = 1 days;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        pacts = Pacts(address(new ERC1967Proxy(address(new Pacts()), abi.encodeCall(Pacts.initialize, (usdc, resolver, owner)))));
        address[4] memory people = [alice, bob, carol, dave];
        for (uint256 i; i < people.length; ++i) {
            _fund(people[i]);
        }
    }

    function _fund(address a) internal {
        usdc.mint(a, 1_000e6);
        vm.prank(a);
        usdc.approve(address(pacts), type(uint256).max);
    }

    function _options() internal pure returns (string[] memory o) {
        o = new string[](3);
        o[0] = "PSG";
        o[1] = "Man United";
        o[2] = "Draw";
    }

    function _create(bool ai, uint8 maxP, uint8 pick) internal returns (uint256) {
        vm.prank(alice);
        return pacts.createPact(
            Pacts.CreateParams({
                stake: STAKE,
                joinDeadline: uint40(block.timestamp + 1 days),
                resolveBy: uint40(block.timestamp + 10 days),
                maxParticipants: maxP,
                aiResolved: ai,
                challengeWindow: ai ? WINDOW : 0,
                pick: pick,
                terms: "PSG vs Man United, UCL, 21 Oct",
                options: _options()
            })
        );
    }

    function _join(uint256 id, address who, uint8 option) internal {
        vm.prank(who);
        pacts.join(id, option);
    }

    function _claim(uint256 id, address who) internal returns (uint256 received) {
        uint256 before = usdc.balanceOf(who);
        vm.prank(who);
        pacts.claim(id);
        received = usdc.balanceOf(who) - before;
    }

    // ------------------------------------------------------------------ creation

    function test_createPullsStake() public {
        uint256 id = _create(false, 2, 1);
        assertEq(usdc.balanceOf(address(pacts)), STAKE);
        assertEq(pacts.pickOf(id, alice), 1);
        assertEq(pacts.getPact(id).participantCount, 1);
    }

    function test_termsOptionsAndIndexStored() public {
        uint256 id = _create(false, 2, 1);
        _join(id, bob, 2);
        assertEq(pacts.termsOf(id), "PSG vs Man United, UCL, 21 Oct");
        string[] memory opts = pacts.getOptions(id);
        assertEq(opts.length, 3);
        assertEq(opts[1], "Man United");
        assertEq(pacts.pactsOf(bob).length, 1);
        assertEq(pacts.pactsOf(bob)[0], id);
        assertEq(pacts.getParticipants(id)[1], bob);
    }

    function test_createValidation() public {
        Pacts.CreateParams memory p = Pacts.CreateParams({
            stake: STAKE,
            joinDeadline: uint40(block.timestamp + 1 days),
            resolveBy: uint40(block.timestamp + 10 days),
            maxParticipants: 2,
            aiResolved: true,
            challengeWindow: 10 minutes,
            pick: 1,
            terms: "x",
            options: _options()
        });
        vm.startPrank(alice);
        vm.expectRevert(Pacts.BadParams.selector); // window too short
        pacts.createPact(p);

        p.challengeWindow = WINDOW;
        p.maxParticipants = 1;
        vm.expectRevert(Pacts.BadParams.selector);
        pacts.createPact(p);

        p.maxParticipants = 2;
        p.resolveBy = p.joinDeadline - 1;
        vm.expectRevert(Pacts.BadParams.selector);
        pacts.createPact(p);

        p.resolveBy = uint40(block.timestamp + 10 days);
        p.pick = 4;
        vm.expectRevert(Pacts.BadOption.selector);
        pacts.createPact(p);

        p.pick = 1;
        p.terms = "";
        vm.expectRevert(Pacts.BadParams.selector);
        pacts.createPact(p);
        vm.stopPrank();
    }

    function test_joinRules() public {
        uint256 id = _create(false, 2, 1);
        vm.prank(alice);
        vm.expectRevert(Pacts.AlreadyJoined.selector);
        pacts.join(id, 2);

        vm.prank(bob);
        vm.expectRevert(Pacts.BadOption.selector);
        pacts.join(id, 0);

        _join(id, bob, 2);
        vm.prank(carol);
        vm.expectRevert(Pacts.PactFull.selector);
        pacts.join(id, 2);
    }

    function test_joinAfterDeadlineReverts() public {
        uint256 id = _create(false, 4, 1);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(bob);
        vm.expectRevert(Pacts.JoinClosed.selector);
        pacts.join(id, 2);
    }

    // ------------------------------------------------------------------ agreement

    function test_unanimousVotePaysWinner() public {
        uint256 id = _create(false, 2, 1);
        _join(id, bob, 2);

        vm.prank(alice);
        pacts.vote(id, 1);
        assertEq(uint8(pacts.getPact(id).phase), uint8(Pacts.Phase.Active));
        vm.prank(bob);
        pacts.vote(id, 1);
        assertEq(uint8(pacts.getPact(id).phase), uint8(Pacts.Phase.Settled));

        assertEq(pacts.claimable(id, alice), 2 * STAKE);
        assertEq(_claim(id, alice), 2 * STAKE);
        vm.prank(bob);
        vm.expectRevert(Pacts.NothingToClaim.selector);
        pacts.claim(id);
        vm.prank(alice);
        vm.expectRevert(Pacts.NothingToClaim.selector);
        pacts.claim(id);
    }

    function test_voteBeforeJoiningClosedReverts() public {
        uint256 id = _create(false, 3, 1);
        _join(id, bob, 2);
        vm.prank(alice);
        vm.expectRevert(Pacts.JoiningOpen.selector);
        pacts.vote(id, 1);
    }

    function test_changedVoteIsNotDoubleCounted() public {
        uint256 id = _create(false, 2, 1);
        _join(id, bob, 2);
        vm.prank(alice);
        pacts.vote(id, 1);
        vm.prank(alice);
        pacts.vote(id, 2);
        vm.prank(bob);
        pacts.vote(id, 1);
        assertEq(uint8(pacts.getPact(id).phase), uint8(Pacts.Phase.Active));
        vm.prank(alice);
        pacts.vote(id, 1);
        assertEq(uint8(pacts.getPact(id).phase), uint8(Pacts.Phase.Settled));
    }

    function test_unanimousVoidRefunds() public {
        uint256 id = _create(false, 2, 1);
        _join(id, bob, 2);
        vm.prank(alice);
        pacts.vote(id, 0);
        vm.prank(bob);
        pacts.vote(id, 0);
        assertEq(uint8(pacts.getPact(id).phase), uint8(Pacts.Phase.Refunded));
        assertEq(_claim(id, alice), STAKE);
        assertEq(_claim(id, bob), STAKE);
    }

    function test_outcomeNobodyBackedRefunds() public {
        uint256 id = _create(false, 2, 1);
        _join(id, bob, 2);
        vm.prank(alice);
        pacts.vote(id, 3); // draw
        vm.prank(bob);
        pacts.vote(id, 3);
        assertEq(uint8(pacts.getPact(id).phase), uint8(Pacts.Phase.Refunded));
    }

    function test_nonParticipantCannotVote() public {
        uint256 id = _create(false, 2, 1);
        _join(id, bob, 2);
        vm.prank(carol);
        vm.expectRevert(Pacts.NotParticipant.selector);
        pacts.vote(id, 1);
    }

    // ------------------------------------------------------------------ AI resolution

    function test_aiProposalFinalizesAfterWindow() public {
        uint256 id = _create(true, 2, 1);
        _join(id, bob, 2);

        vm.prank(resolver);
        pacts.proposeOutcome(id, 1, "https://www.uefa.com/match/123");
        assertEq(pacts.proposalSourceOf(id), "https://www.uefa.com/match/123");

        vm.expectRevert(Pacts.WindowOpen.selector);
        pacts.finalize(id);

        vm.warp(block.timestamp + WINDOW + 1);
        pacts.finalize(id); // anyone
        assertEq(_claim(id, alice), 2 * STAKE);
    }

    function test_onlyResolverProposes() public {
        uint256 id = _create(true, 2, 1);
        _join(id, bob, 2);
        vm.prank(alice);
        vm.expectRevert(Pacts.NotResolver.selector);
        pacts.proposeOutcome(id, 1, "");
    }

    function test_cannotProposeOnAgreementPact() public {
        uint256 id = _create(false, 2, 1);
        _join(id, bob, 2);
        vm.prank(resolver);
        vm.expectRevert(Pacts.NotAiPact.selector);
        pacts.proposeOutcome(id, 1, "");
    }

    function test_cannotProposeTwice() public {
        uint256 id = _create(true, 2, 1);
        _join(id, bob, 2);
        vm.startPrank(resolver);
        pacts.proposeOutcome(id, 1, "");
        vm.expectRevert(Pacts.AlreadyProposed.selector);
        pacts.proposeOutcome(id, 2, "");
        vm.stopPrank();
    }

    function test_disputeBlocksFinalizeAndFallsBackToVote() public {
        uint256 id = _create(true, 2, 1);
        _join(id, bob, 2);
        vm.prank(resolver);
        pacts.proposeOutcome(id, 1, "src");

        vm.prank(carol);
        vm.expectRevert(Pacts.NotParticipant.selector);
        pacts.dispute(id);

        vm.prank(bob);
        pacts.dispute(id);
        vm.warp(block.timestamp + WINDOW + 1);
        vm.expectRevert(Pacts.NoProposal.selector);
        pacts.finalize(id);

        vm.prank(alice);
        pacts.vote(id, 2);
        vm.prank(bob);
        pacts.vote(id, 2);
        assertEq(_claim(id, bob), 2 * STAKE);
    }

    function test_disputeAfterWindowReverts() public {
        uint256 id = _create(true, 2, 1);
        _join(id, bob, 2);
        vm.prank(resolver);
        pacts.proposeOutcome(id, 1, "src");
        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(bob);
        vm.expectRevert(Pacts.WindowClosed.selector);
        pacts.dispute(id);
    }

    function test_undisputedProposalStillFinalizesAfterResolveBy() public {
        uint256 id = _create(true, 2, 1);
        _join(id, bob, 2);
        vm.warp(block.timestamp + 10 days - 1 hours);
        vm.prank(resolver);
        pacts.proposeOutcome(id, 2, "src");
        vm.warp(block.timestamp + 2 hours); // past resolveBy, window still open
        vm.expectRevert(Pacts.TooEarly.selector);
        pacts.refund(id);
        vm.warp(block.timestamp + WINDOW);
        pacts.finalize(id);
        assertEq(_claim(id, bob), 2 * STAKE);
    }

    function test_proposeAfterResolveByReverts() public {
        uint256 id = _create(true, 2, 1);
        _join(id, bob, 2);
        vm.warp(block.timestamp + 10 days + 1);
        vm.prank(resolver);
        vm.expectRevert(Pacts.TooLate.selector);
        pacts.proposeOutcome(id, 1, "");
    }

    function test_setResolverOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        pacts.setResolver(alice);
        vm.prank(owner);
        pacts.setResolver(carol);
        assertEq(pacts.resolver(), carol);
    }

    // ------------------------------------------------------------------ refunds

    function test_refundWhenNobodyJoins() public {
        uint256 id = _create(false, 4, 1);
        vm.expectRevert(Pacts.TooEarly.selector);
        pacts.refund(id);
        vm.warp(block.timestamp + 1 days + 1);
        pacts.refund(id);
        assertEq(_claim(id, alice), STAKE);
    }

    function test_refundAfterDeadlockAndResolveBy() public {
        uint256 id = _create(false, 2, 1);
        _join(id, bob, 2);
        vm.prank(alice);
        pacts.vote(id, 1);
        vm.prank(bob);
        pacts.vote(id, 2);
        vm.warp(block.timestamp + 10 days + 1);
        pacts.refund(id);
        assertEq(_claim(id, alice), STAKE);
        assertEq(_claim(id, bob), STAKE);
        assertEq(usdc.balanceOf(address(pacts)), 0);

        vm.prank(alice);
        vm.expectRevert(Pacts.NotActive.selector);
        pacts.vote(id, 1);
    }

    function test_refundAfterDisputeAndResolveBy() public {
        uint256 id = _create(true, 2, 1);
        _join(id, bob, 2);
        vm.prank(resolver);
        pacts.proposeOutcome(id, 1, "src");
        vm.prank(bob);
        pacts.dispute(id);
        vm.warp(block.timestamp + 10 days + 1);
        pacts.refund(id);
        assertEq(_claim(id, bob), STAKE);
    }

    // ------------------------------------------------------------------ splits

    function test_groupSplitWithDust() public {
        // 3 winners share a pot of 4 * 10.000001 USDC; last claimer takes the dust.
        vm.prank(alice);
        uint256 id = pacts.createPact(
            Pacts.CreateParams({
                stake: 10_000_001,
                joinDeadline: uint40(block.timestamp + 1 days),
                resolveBy: uint40(block.timestamp + 10 days),
                maxParticipants: 4,
                aiResolved: false,
                challengeWindow: 0,
                pick: 1,
                terms: "split",
                options: _options()
            })
        );
        _join(id, bob, 1);
        _join(id, carol, 1);
        _join(id, dave, 2);

        address[4] memory people = [alice, bob, carol, dave];
        for (uint256 i; i < 4; ++i) {
            vm.prank(people[i]);
            pacts.vote(id, 1);
        }
        uint256 pot = 4 * 10_000_001;
        uint256 a = _claim(id, alice);
        uint256 b = _claim(id, bob);
        uint256 c = _claim(id, carol);
        assertEq(a, pot / 3);
        assertEq(b, pot / 3);
        assertEq(a + b + c, pot);
        assertEq(usdc.balanceOf(address(pacts)), 0);
    }

    /// @dev Whatever the picks and outcome, payouts sum exactly to the pot.
    function testFuzz_payoutsConserveFunds(uint8 nRaw, uint256 picksSeed, uint8 outcomeRaw, uint96 stakeRaw) public {
        uint8 n = uint8(bound(nRaw, 2, 20));
        uint96 stake = uint96(bound(stakeRaw, 1, 1_000e6));
        uint8 outcome = uint8(bound(outcomeRaw, 0, 3));

        address[] memory people = new address[](n);
        for (uint256 i; i < n; ++i) {
            people[i] = address(uint160(0x1000 + i));
            _fund(people[i]);
        }

        vm.prank(people[0]);
        uint256 id = pacts.createPact(
            Pacts.CreateParams({
                stake: stake,
                joinDeadline: uint40(block.timestamp + 1 days),
                resolveBy: uint40(block.timestamp + 10 days),
                maxParticipants: n,
                aiResolved: false,
                challengeWindow: 0,
                pick: uint8(picksSeed % 3) + 1,
                terms: "fuzz",
                options: _options()
            })
        );
        for (uint256 i = 1; i < n; ++i) {
            _join(id, people[i], uint8(uint256(keccak256(abi.encode(picksSeed, i))) % 3) + 1);
        }
        for (uint256 i; i < n; ++i) {
            vm.prank(people[i]);
            pacts.vote(id, outcome);
        }

        uint256 total;
        for (uint256 i; i < n; ++i) {
            uint256 expected = pacts.claimable(id, people[i]);
            if (expected == 0) continue;
            assertEq(_claim(id, people[i]), expected);
            total += expected;
        }
        assertEq(total, uint256(stake) * n);
        assertEq(usdc.balanceOf(address(pacts)), 0);
    }
}
