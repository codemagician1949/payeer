// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Payeer} from "../src/Payeer.sol";
import {Pacts} from "../src/Pacts.sol";

/// Whoever signs this becomes the owner, which is who may upgrade either contract afterwards.
/// Three ways to say who that is, in order of preference:
///
///   DEPLOYER_PRIVATE_KEY in contracts/.env   (gitignored; never passed on the command line,
///                                             so it doesn't land in shell history or `ps`)
///   --account <keystore>                     (an encrypted key, unlocked by password)
///   --interactive 1                          (pasted at the prompt, never written to disk)
///
///   RESOLVER=0x... forge script script/Deploy.s.sol --rpc-url arc --broadcast
contract Deploy is Script {
    /// USDC ERC-20 interface on Arc (same address on mainnet and testnet).
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    function run() external {
        address resolver = vm.envAddress("RESOLVER");
        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));

        // Who ends up owning this is worth being explicit about rather than inferring from
        // msg.sender, which means different things inside and outside a broadcast.
        address owner;
        if (deployerKey != 0) {
            owner = vm.addr(deployerKey);
            vm.startBroadcast(deployerKey);
        } else {
            vm.startBroadcast();
            owner = msg.sender;
        }

        // Each proxy is the permanent address; the implementation behind it can be replaced later.
        address payeerImpl = address(new Payeer());
        address payeer = address(new ERC1967Proxy(payeerImpl, abi.encodeCall(Payeer.initialize, (USDC, owner))));

        address pactsImpl = address(new Pacts());
        address pacts = address(new ERC1967Proxy(pactsImpl, abi.encodeCall(Pacts.initialize, (USDC, resolver, owner))));
        vm.stopBroadcast();

        require(Payeer(payeer).owner() == owner, "Payeer owner is not the deployer");
        require(Pacts(pacts).owner() == owner, "Pacts owner is not the deployer");

        console.log("Payeer (proxy):", payeer);
        console.log("Payeer impl:   ", payeerImpl);
        console.log("Pacts (proxy): ", pacts);
        console.log("Pacts impl:    ", pactsImpl);
        console.log("Resolver:      ", resolver);
        console.log("Owner:         ", owner);
    }
}
