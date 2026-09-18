// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Payeer} from "../src/Payeer.sol";
import {Pacts} from "../src/Pacts.sol";

/// Usage:
///   RESOLVER=0x... forge script script/Deploy.s.sol --rpc-url arc_testnet --account <keystore> --broadcast
contract Deploy is Script {
    /// USDC ERC-20 interface on Arc (same address on mainnet and testnet).
    IERC20 constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    function run() external {
        address resolver = vm.envAddress("RESOLVER");

        vm.startBroadcast();
        // Each proxy is the permanent address; the implementation behind it can be replaced later.
        address payeerImpl = address(new Payeer());
        address payeer = address(new ERC1967Proxy(payeerImpl, abi.encodeCall(Payeer.initialize, (USDC, msg.sender))));

        address pactsImpl = address(new Pacts());
        address pacts = address(new ERC1967Proxy(pactsImpl, abi.encodeCall(Pacts.initialize, (USDC, resolver, msg.sender))));
        vm.stopBroadcast();

        console.log("Payeer (proxy):", payeer);
        console.log("Payeer impl:   ", payeerImpl);
        console.log("Pacts (proxy): ", pacts);
        console.log("Pacts impl:    ", pactsImpl);
        console.log("Owner:         ", msg.sender);
    }
}
