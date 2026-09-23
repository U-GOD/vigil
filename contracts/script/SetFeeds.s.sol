// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {PythPrintReporter} from "../src/oracle/PythPrintReporter.sol";

/// @notice Binds Equity.US Pyth feed ids. Ids are the session feeds, not the 24/7 index feeds.
contract SetFeeds is Script {
    using stdJson for string;

    function run() external {
        PythPrintReporter reporter = PythPrintReporter(vm.envAddress("PYTH_REPORTER"));
        string memory raw = vm.readFile("script/data/pyth-equities.json");
        uint256 n = 6;

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        for (uint256 i; i < n; ++i) {
            string memory base = string.concat(".feeds[", vm.toString(i), "]");
            string memory ticker = raw.readString(string.concat(base, ".ticker"));
            bytes32 feed = raw.readBytes32(string.concat(base, ".id"));
            reporter.setFeed(keccak256(bytes(ticker)), feed);
            console2.log("feed", ticker);
        }
        vm.stopBroadcast();
    }
}
