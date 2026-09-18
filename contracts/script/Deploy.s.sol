// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
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
        Payeer payeer = new Payeer(USDC);
        Pacts pacts = new Pacts(USDC, resolver, msg.sender);
        vm.stopBroadcast();

        console.log("Payeer:", address(payeer));
        console.log("Pacts: ", address(pacts));
        console.log("Owner: ", msg.sender);
    }
}
