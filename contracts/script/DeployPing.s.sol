// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Ping} from "../src/util/Ping.sol";

contract DeployPing is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        Ping ping = new Ping();
        vm.stopBroadcast();
        console2.log("Ping", address(ping));
    }
}
