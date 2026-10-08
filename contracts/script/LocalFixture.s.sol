// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";
import {Payeer} from "../src/Payeer.sol";
import {Pacts} from "../src/Pacts.sol";

/// Stands Payeer up on a local anvil with a mock USDC, and leaves two pacts behind for the UI to
/// be driven against: one already settled with winnings waiting for A, and one still being
/// decided. Arc's USDC calls native precompiles that can't run off-chain, so local work uses the
/// same mock the unit tests do.
///
/// A and B are anvil's second and third accounts, so this needs nothing but a running anvil:
///
///   anvil &
///   forge script script/LocalFixture.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
///     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
contract LocalFixture is Script {
    uint256 constant KEY_A = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 constant KEY_B = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;

    function run() external {
        address a = vm.addr(KEY_A);
        address b = vm.addr(KEY_B);

        vm.startBroadcast();
        MockUSDC usdc = new MockUSDC();
        address payeer = address(
            new ERC1967Proxy(address(new Payeer()), abi.encodeCall(Payeer.initialize, (IERC20(address(usdc)), msg.sender)))
        );
        address pacts = address(
            new ERC1967Proxy(address(new Pacts()), abi.encodeCall(Pacts.initialize, (IERC20(address(usdc)), msg.sender, msg.sender)))
        );
        usdc.mint(a, 1_000e6);
        usdc.mint(b, 1_000e6);
        vm.stopBroadcast();

        string[] memory options = new string[](2);
        options[0] = "Arsenal";
        options[1] = "Chelsea";

        // One both sides agree on, so it settles and leaves A with the pot to claim.
        uint256 settled = _make(pacts, usdc, "Arsenal beat Chelsea", options);
        vm.broadcast(KEY_A);
        Pacts(pacts).vote(settled, 1);
        vm.broadcast(KEY_B);
        Pacts(pacts).vote(settled, 1); // unanimous, so it pays out

        // And one still open, to settle from the test while the app is watching.
        uint256 open = _make(pacts, usdc, "Who wins the derby?", options);

        console.log("USDC:  ", address(usdc));
        console.log("Payeer:", payeer);
        console.log("Pacts: ", pacts);
        console.log("A (winner):", a);
        console.log("settled pact:", settled);
        console.log("open pact:   ", open);
    }

    function _make(address pacts, MockUSDC usdc, string memory terms, string[] memory options) internal returns (uint256 id) {
        Pacts.CreateParams memory p = Pacts.CreateParams({
            stake: 10e6,
            joinDeadline: uint40(block.timestamp + 1 hours),
            resolveBy: uint40(block.timestamp + 30 days),
            maxParticipants: 2,
            aiResolved: false,
            challengeWindow: 1 hours,
            pick: 1,
            terms: terms,
            options: options
        });

        vm.broadcast(KEY_A);
        usdc.approve(pacts, type(uint256).max);
        vm.broadcast(KEY_A);
        id = Pacts(pacts).createPact(p);

        vm.broadcast(KEY_B);
        usdc.approve(pacts, type(uint256).max);
        vm.broadcast(KEY_B);
        Pacts(pacts).join(id, 2); // B backs the other side, filling the pact and closing joining
    }
}
