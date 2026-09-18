// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Payeer} from "../src/Payeer.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract PayeerTest is Test {
    Payeer payeer;
    MockUSDC usdc;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        usdc = new MockUSDC();
        payeer = new Payeer(usdc);
        for (uint256 i; i < 3; ++i) {
            address a = [alice, bob, carol][i];
            usdc.mint(a, 1_000e6);
            vm.prank(a);
            usdc.approve(address(payeer), type(uint256).max);
        }
    }

    function test_fixedRequest_paidOnce() public {
        vm.prank(alice);
        uint256 id = payeer.createRequest(25e6, 0, false, "design work");

        vm.prank(bob);
        payeer.payRequest(id, 25e6);
        assertEq(usdc.balanceOf(alice), 1_025e6);
        (,,,, Payeer.Status status, uint32 payments,) = payeer.requests(id);
        assertEq(uint8(status), uint8(Payeer.Status.Paid));
        assertEq(payments, 1);

        vm.prank(carol);
        vm.expectRevert(Payeer.NotOpen.selector);
        payeer.payRequest(id, 25e6);
    }

    function test_memoAndIndexStored() public {
        vm.startPrank(alice);
        uint256 a = payeer.createRequest(1e6, 0, false, "first");
        uint256 b = payeer.createRequest(2e6, 0, false, "second");
        vm.stopPrank();
        assertEq(payeer.memoOf(b), "second");
        uint256[] memory ids = payeer.requestsBy(alice);
        assertEq(ids.length, 2);
        assertEq(ids[0], a);
        assertEq(ids[1], b);
    }

    function test_fixedRequest_wrongAmountReverts() public {
        vm.prank(alice);
        uint256 id = payeer.createRequest(25e6, 0, false, "");
        vm.prank(bob);
        vm.expectRevert(Payeer.InvalidAmount.selector);
        payeer.payRequest(id, 24e6);
    }

    function test_openReusableRequest() public {
        vm.prank(alice);
        uint256 id = payeer.createRequest(0, 0, true, "tips");
        vm.prank(bob);
        payeer.payRequest(id, 3e6);
        vm.prank(carol);
        payeer.payRequest(id, 7e6);
        (,,,, Payeer.Status status, uint32 payments, uint256 total) = payeer.requests(id);
        assertEq(uint8(status), uint8(Payeer.Status.Open));
        assertEq(payments, 2);
        assertEq(total, 10e6);

        vm.prank(bob);
        vm.expectRevert(Payeer.InvalidAmount.selector);
        payeer.payRequest(id, 0);
    }

    function test_expiry() public {
        vm.prank(alice);
        uint256 id = payeer.createRequest(5e6, uint40(block.timestamp + 1 days), false, "");
        vm.warp(block.timestamp + 1 days + 1);
        assertTrue(payeer.isExpired(id));
        vm.prank(bob);
        vm.expectRevert(Payeer.Expired.selector);
        payeer.payRequest(id, 5e6);
    }

    function test_pastExpiryRejected() public {
        vm.prank(alice);
        vm.expectRevert(Payeer.InvalidExpiry.selector);
        payeer.createRequest(5e6, uint40(block.timestamp), false, "");
    }

    function test_cancel() public {
        vm.prank(alice);
        uint256 id = payeer.createRequest(5e6, 0, false, "");
        vm.prank(bob);
        vm.expectRevert(Payeer.NotCreator.selector);
        payeer.cancelRequest(id);
        vm.prank(alice);
        payeer.cancelRequest(id);
        vm.prank(bob);
        vm.expectRevert(Payeer.NotOpen.selector);
        payeer.payRequest(id, 5e6);
    }

    function test_selfPaymentReverts() public {
        vm.prank(alice);
        uint256 id = payeer.createRequest(5e6, 0, false, "");
        vm.prank(alice);
        vm.expectRevert(Payeer.SelfPayment.selector);
        payeer.payRequest(id, 5e6);
    }

    function test_unknownRequestReverts() public {
        vm.prank(bob);
        vm.expectRevert(Payeer.NotOpen.selector);
        payeer.payRequest(42, 1e6);
    }

    function test_memoTooLong() public {
        vm.prank(alice);
        vm.expectRevert(Payeer.MemoTooLong.selector);
        payeer.createRequest(1e6, 0, false, string(new bytes(281)));
    }

    function test_send() public {
        vm.prank(alice);
        payeer.send(bob, 10e6, "dinner");
        assertEq(usdc.balanceOf(bob), 1_010e6);

        vm.prank(alice);
        vm.expectRevert(Payeer.InvalidRecipient.selector);
        payeer.send(alice, 1e6, "");
    }

    function test_batchPay() public {
        address[] memory to = new address[](2);
        to[0] = bob;
        to[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e6;
        amounts[1] = 50e6;

        vm.prank(alice);
        payeer.batchPay(to, amounts, "bounties");
        assertEq(usdc.balanceOf(alice), 850e6);
        assertEq(usdc.balanceOf(bob), 1_100e6);
        assertEq(usdc.balanceOf(carol), 1_050e6);
    }

    function test_feedRecordsBothSides() public {
        vm.prank(alice);
        uint256 id = payeer.createRequest(25e6, 0, false, "design work");
        vm.prank(bob);
        payeer.payRequest(id, 25e6);
        vm.prank(bob);
        payeer.send(carol, 4e6, "coffee");

        assertEq(payeer.feedLength(bob), 2);
        Payeer.Entry[] memory bobFeed = payeer.feed(bob, 0, 10);
        assertEq(uint8(bobFeed[0].kind), uint8(Payeer.Kind.SentOut)); // newest first
        assertEq(bobFeed[0].counterparty, carol);
        assertEq(bobFeed[0].amount, 4e6);
        assertEq(uint8(bobFeed[1].kind), uint8(Payeer.Kind.RequestPaidOut));
        assertEq(bobFeed[1].ref, uint40(id));

        Payeer.Entry[] memory aliceFeed = payeer.feed(alice, 0, 10);
        assertEq(aliceFeed.length, 1);
        assertEq(uint8(aliceFeed[0].kind), uint8(Payeer.Kind.RequestPaidIn));
        assertEq(aliceFeed[0].counterparty, bob);
    }

    function test_feedPagination() public {
        for (uint256 i; i < 5; ++i) {
            vm.prank(alice);
            payeer.send(bob, 1e6, "");
        }
        assertEq(payeer.feed(alice, 0, 2).length, 2);
        assertEq(payeer.feed(alice, 4, 10).length, 1);
        assertEq(payeer.feed(alice, 5, 10).length, 0);
        assertEq(payeer.feed(alice, 0, 10).length, 5);
    }

    function test_batchFeedIsOneLineForSender() public {
        address[] memory to = new address[](2);
        to[0] = bob;
        to[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10e6;
        amounts[1] = 20e6;
        vm.prank(alice);
        payeer.batchPay(to, amounts, "payroll");

        Payeer.Entry[] memory f = payeer.feed(alice, 0, 10);
        assertEq(f.length, 1);
        assertEq(uint8(f[0].kind), uint8(Payeer.Kind.BatchOut));
        assertEq(f[0].amount, 30e6);
        assertEq(f[0].ref, 2);
        assertEq(payeer.feed(carol, 0, 10)[0].amount, 20e6);
    }

    function test_batchTooLarge() public {
        address[] memory to = new address[](51);
        uint256[] memory amounts = new uint256[](51);
        vm.prank(alice);
        vm.expectRevert(Payeer.BatchTooLarge.selector);
        payeer.batchPay(to, amounts, "");
    }

    function test_batchPay_lengthMismatch() public {
        address[] memory to = new address[](2);
        uint256[] memory amounts = new uint256[](1);
        vm.prank(alice);
        vm.expectRevert(Payeer.LengthMismatch.selector);
        payeer.batchPay(to, amounts, "");
    }

    function test_batchPay_insufficientBalanceRevertsAll() public {
        address[] memory to = new address[](2);
        to[0] = bob;
        to[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 600e6;
        amounts[1] = 600e6;
        vm.prank(alice);
        vm.expectRevert();
        payeer.batchPay(to, amounts, "");
        assertEq(usdc.balanceOf(bob), 1_000e6);
    }
}
