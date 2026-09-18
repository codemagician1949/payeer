// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Payeer} from "../src/Payeer.sol";
import {Pacts} from "../src/Pacts.sol";

/// Runs the real flows against Arc mainnet's own USDC contract, not a mock.
/// `forge test --match-path test/ArcFork.t.sol --fork-url arc`
contract ArcForkTest is Test {
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);
    address constant BLOCKLIST = 0x1800000000000000000000000000000000000001;
    address constant NATIVE_TRANSFER = 0x1800000000000000000000000000000000000000;

    Payeer payeer;
    Pacts pacts;
    address resolver = makeAddr("resolver");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        vm.skip(block.chainid != 5042);
        // Arc's USDC calls a native blocklist precompile on every transfer, which Foundry's EVM
        // cannot execute. Swap in a stub that answers "not blocklisted" so the real token logic runs.
        vm.etch(BLOCKLIST, address(new BlocklistStub()).code);
        vm.etch(NATIVE_TRANSFER, address(new NativeTransferStub()).code);
        vm.allowCheatcodes(NATIVE_TRANSFER);

        payeer = new Payeer(USDC);
        pacts = new Pacts(USDC, resolver, address(this));
        // On Arc the gas balance and the USDC balance are the same funds:
        // 18-decimal native, exposed as 6-decimal ERC-20.
        for (uint256 i; i < 3; ++i) {
            vm.deal([alice, bob, carol][i], 100 ether);
        }
    }

    function test_nativeBalanceIsErc20Balance() public view {
        assertEq(USDC.balanceOf(alice), 100e6, "100 native USDC should read as 100e6 through the ERC-20 interface");
        assertEq(alice.balance, 100 ether);
    }

    function test_requestPaidWithRealUsdc() public {
        vm.prank(alice);
        uint256 id = payeer.createRequest(25e6, 0, false, "design work");

        vm.prank(bob);
        USDC.approve(address(payeer), 25e6);
        uint256 aliceBefore = USDC.balanceOf(alice);

        vm.prank(bob);
        payeer.payRequest(id, 25e6);

        assertEq(USDC.balanceOf(alice), aliceBefore + 25e6);
        assertEq(payeer.feed(alice, 0, 1)[0].amount, 25e6);
    }

    function test_batchPayWithRealUsdc() public {
        address[] memory to = new address[](2);
        to[0] = bob;
        to[1] = carol;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 3e6;
        amounts[1] = 7e6;

        vm.startPrank(alice);
        USDC.approve(address(payeer), 10e6);
        uint256 bobBefore = USDC.balanceOf(bob);
        payeer.batchPay(to, amounts, "payroll");
        vm.stopPrank();

        assertEq(USDC.balanceOf(bob), bobBefore + 3e6);
        assertEq(USDC.balanceOf(carol), 107e6);
    }

    function test_fullPactLifecycleWithRealUsdc() public {
        string[] memory options = new string[](3);
        options[0] = "PSG";
        options[1] = "Man United";
        options[2] = "Draw";

        vm.startPrank(alice);
        USDC.approve(address(pacts), 10e6);
        uint256 id = pacts.createPact(
            Pacts.CreateParams({
                stake: 10e6,
                joinDeadline: uint40(block.timestamp + 1 days),
                resolveBy: uint40(block.timestamp + 10 days),
                maxParticipants: 2,
                aiResolved: true,
                challengeWindow: 1 days,
                pick: 1,
                terms: "PSG vs Man United",
                options: options
            })
        );
        vm.stopPrank();

        vm.startPrank(bob);
        USDC.approve(address(pacts), 10e6);
        pacts.join(id, 2);
        vm.stopPrank();

        assertEq(USDC.balanceOf(address(pacts)), 20e6, "escrow holds both stakes");

        vm.prank(resolver);
        pacts.proposeOutcome(id, 1, "PSG won 2-1 https://uefa.com");
        vm.warp(block.timestamp + 1 days + 1);
        pacts.finalize(id);

        uint256 aliceBefore = USDC.balanceOf(alice);
        vm.prank(alice);
        pacts.claim(id);
        assertEq(USDC.balanceOf(alice), aliceBefore + 20e6, "winner takes the pot");
        assertEq(USDC.balanceOf(address(pacts)), 0, "nothing stranded in escrow");
    }

    function test_gasCostOfCommonActions() public {
        vm.startPrank(alice);
        USDC.approve(address(payeer), type(uint256).max);
        uint256 g = gasleft();
        uint256 id = payeer.createRequest(5e6, 0, false, "coffee");
        console.log("createRequest gas", g - gasleft());
        vm.stopPrank();

        vm.startPrank(bob);
        USDC.approve(address(payeer), type(uint256).max);
        g = gasleft();
        payeer.payRequest(id, 5e6);
        console.log("payRequest gas  ", g - gasleft());
        vm.stopPrank();
    }
}

/// Stands in for Arc's native-transfer precompile: moves real balances so accounting stays honest.
contract NativeTransferStub {
    Vm constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    function transfer(address from, address to, uint256 amount) external returns (bool) {
        require(from.balance >= amount, "insufficient balance");
        vm.deal(from, from.balance - amount);
        vm.deal(to, to.balance + amount);
        return true;
    }
}

/// Stands in for Arc's blocklist precompile during fork tests.
contract BlocklistStub {
    function isBlocklisted(address) external pure returns (bool) {
        return false;
    }
}
