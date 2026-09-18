// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";
import {Payeer} from "../src/Payeer.sol";
import {Pacts} from "../src/Pacts.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// A later version: adds a function and new storage after the existing layout.
contract PayeerV2 is Payeer {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() Payeer() {}

    function version() external pure returns (string memory) {
        return "v2";
    }
}

contract PactsV2 is Pacts {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() Pacts() {}

    function version() external pure returns (string memory) {
        return "v2";
    }
}

contract UpgradeTest is Test {
    MockUSDC usdc;
    Payeer payeer;
    Pacts pacts;
    address owner = makeAddr("owner");
    address resolver = makeAddr("resolver");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        payeer = Payeer(address(new ERC1967Proxy(address(new Payeer()), abi.encodeCall(Payeer.initialize, (usdc, owner)))));
        pacts = Pacts(address(new ERC1967Proxy(address(new Pacts()), abi.encodeCall(Pacts.initialize, (usdc, resolver, owner)))));

        for (uint256 i; i < 2; ++i) {
            address who = [alice, bob][i];
            usdc.mint(who, 1_000e6);
            vm.startPrank(who);
            usdc.approve(address(payeer), type(uint256).max);
            usdc.approve(address(pacts), type(uint256).max);
            vm.stopPrank();
        }
    }

    function test_initializerCannotRunTwice() public {
        vm.expectRevert();
        payeer.initialize(usdc, alice);
    }

    function test_implementationCannotBeInitialized() public {
        Payeer implementation = new Payeer();
        vm.expectRevert();
        implementation.initialize(usdc, alice);
    }

    function test_onlyOwnerCanUpgrade() public {
        address v2 = address(new PayeerV2());
        vm.prank(alice);
        vm.expectRevert();
        payeer.upgradeToAndCall(v2, "");

        vm.prank(owner);
        payeer.upgradeToAndCall(v2, "");
        assertEq(PayeerV2(address(payeer)).version(), "v2");
    }

    function test_upgradeKeepsRequestsAndFeed() public {
        vm.prank(alice);
        uint256 id = payeer.createRequest(25e6, 0, false, "design work");
        vm.prank(bob);
        payeer.payRequest(id, 25e6);

        // Deploy first: the `new` would otherwise consume the prank.
        address v2 = address(new PayeerV2());
        vm.prank(owner);
        payeer.upgradeToAndCall(v2, "");

        // Same address, same history.
        assertEq(payeer.memoOf(id), "design work");
        assertEq(payeer.requestCount(), 1);
        assertEq(payeer.requestsBy(alice)[0], id);
        assertEq(payeer.feed(alice, 0, 1)[0].amount, 25e6);
        assertEq(address(payeer.usdc()), address(usdc));
        assertEq(payeer.owner(), owner);

        // And it still works afterwards.
        vm.prank(alice);
        uint256 next = payeer.createRequest(5e6, 0, false, "after upgrade");
        vm.prank(bob);
        payeer.payRequest(next, 5e6);
        assertEq(usdc.balanceOf(alice), 1_030e6);
    }

    function test_upgradeKeepsEscrowedStakesClaimable() public {
        string[] memory options = new string[](2);
        options[0] = "Me";
        options[1] = "You";

        vm.prank(alice);
        uint256 id = pacts.createPact(
            Pacts.CreateParams({
                stake: 40e6,
                joinDeadline: uint40(block.timestamp + 1 days),
                resolveBy: uint40(block.timestamp + 10 days),
                maxParticipants: 2,
                aiResolved: false,
                challengeWindow: 0,
                pick: 1,
                terms: "mid-upgrade pact",
                options: options
            })
        );
        vm.prank(bob);
        pacts.join(id, 2);
        assertEq(usdc.balanceOf(address(pacts)), 80e6);

        address v2 = address(new PactsV2());
        vm.prank(owner);
        pacts.upgradeToAndCall(v2, "");

        // The pot is still there and still settles to the right person.
        assertEq(usdc.balanceOf(address(pacts)), 80e6);
        assertEq(pacts.termsOf(id), "mid-upgrade pact");
        assertEq(pacts.getParticipants(id).length, 2);

        vm.prank(alice);
        pacts.vote(id, 1);
        vm.prank(bob);
        pacts.vote(id, 1);
        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        pacts.claim(id);
        assertEq(usdc.balanceOf(alice), before + 80e6);
        assertEq(usdc.balanceOf(address(pacts)), 0);
    }

    function test_ownershipTransferMovesUpgradeRights() public {
        address safe = makeAddr("safe");
        vm.prank(owner);
        pacts.transferOwnership(safe);
        assertEq(pacts.owner(), safe);

        address v2 = address(new PactsV2());
        vm.prank(owner);
        vm.expectRevert();
        pacts.upgradeToAndCall(v2, "");

        vm.prank(safe);
        pacts.upgradeToAndCall(v2, "");
        assertEq(PactsV2(address(pacts)).version(), "v2");
    }
}
