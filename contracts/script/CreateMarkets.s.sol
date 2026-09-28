// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ClosureMarketFactory} from "../src/core/ClosureMarketFactory.sol";
import {PolicyAdapter} from "../src/access/PolicyAdapter.sol";
import {TickerSet} from "./TickerSet.sol";

/// @notice Opens the five-name cap ladder on one session that is still before close.
contract CreateMarkets is Script {
    function run() external {
        ClosureMarketFactory factory = ClosureMarketFactory(vm.envAddress("FACTORY"));
        PolicyAdapter policy = PolicyAdapter(vm.envAddress("POLICY"));
        address collateral = vm.envAddress("COLLATERAL");
        uint64 sessionId = uint64(vm.envUint("SESSION_ID"));

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        uint256 opened = TickerSet.openMarkets(factory, policy, collateral, sessionId);
        vm.stopBroadcast();
        console2.log("markets", opened);
    }
}
