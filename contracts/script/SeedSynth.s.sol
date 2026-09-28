// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SessionRegistry} from "../src/registry/SessionRegistry.sol";
import {ISessionRegistry} from "../src/interfaces/ISessionRegistry.sol";

/// @notice One compressed VIGIL_SYNTH session. Ids stay in the 90_000_000 range, away from yyyymmdd.
contract SeedSynth is Script {
    error InvalidWindow();

    function synthWindow(
        uint256 nowTs,
        uint256 closeDelay,
        uint256 window,
        uint256 fallbackDelay
    ) public pure returns (uint64 closeTs, uint64 openTs, uint64 fallbackDeadline) {
        closeTs = uint64(nowTs + closeDelay);
        openTs = uint64(uint256(closeTs) + window);
        fallbackDeadline = uint64(uint256(openTs) + fallbackDelay);
        if (closeDelay == 0 || window == 0 || fallbackDelay == 0) revert InvalidWindow();
        if (closeTs >= openTs || openTs >= fallbackDeadline) revert InvalidWindow();
    }

    function run() external {
        SessionRegistry sessions = SessionRegistry(vm.envAddress("SESSIONS"));
        uint64 sessionId = uint64(vm.envUint("SYNTH_SESSION_ID"));
        (uint64 closeTs, uint64 openTs, uint64 fallbackDeadline) = synthWindow(
            block.timestamp,
            vm.envOr("SYNTH_CLOSE_DELAY", uint256(300)),
            vm.envOr("SYNTH_WINDOW", uint256(600)),
            vm.envOr("SYNTH_FALLBACK", uint256(600))
        );

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        sessions.createSession(
            sessionId,
            ISessionRegistry.Session({
                exchange: keccak256("VIGIL_SYNTH"),
                closeTs: closeTs,
                openTs: openTs,
                fallbackDeadline: fallbackDeadline,
                printBandSecs: 60,
                active: true
            })
        );
        vm.stopBroadcast();
        console2.log("synth.sessionId", sessionId);
        console2.log("synth.closeTs", closeTs);
        console2.log("synth.openTs", openTs);
    }
}
