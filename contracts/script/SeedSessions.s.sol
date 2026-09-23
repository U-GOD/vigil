// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {SessionRegistry} from "../src/registry/SessionRegistry.sol";
import {ISessionRegistry} from "../src/interfaces/ISessionRegistry.sol";

/// @notice Seeds the NYSE cash calendar. Nasdaq cash equities use the same dates.
contract SeedSessions is Script {
    using stdJson for string;

    bytes32 internal constant XNYS = keccak256("XNYS");

    function run() external {
        SessionRegistry sessions = SessionRegistry(vm.envAddress("SESSIONS"));
        string memory raw = vm.readFile("script/data/xnys-sessions.json");
        uint256 n = raw.readUint(".count");
        uint64[] memory all = new uint64[](n);

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        uint256 offset;
        while (offset < n) {
            uint256 len = n - offset;
            if (len > 40) len = 40;
            uint64[] memory ids = new uint64[](len);
            ISessionRegistry.Session[] memory batch = new ISessionRegistry.Session[](len);
            for (uint256 j; j < len; ++j) {
                string memory base = string.concat(".sessions[", vm.toString(offset + j), "]");
                uint64 id = uint64(raw.readUint(string.concat(base, ".id")));
                ids[j] = id;
                all[offset + j] = id;
                batch[j] = ISessionRegistry.Session({
                    exchange: XNYS,
                    closeTs: uint64(raw.readUint(string.concat(base, ".closeTs"))),
                    openTs: uint64(raw.readUint(string.concat(base, ".openTs"))),
                    fallbackDeadline: uint64(raw.readUint(string.concat(base, ".fallbackDeadline"))),
                    printBandSecs: uint32(raw.readUint(string.concat(base, ".printBandSecs"))),
                    active: true
                });
            }
            sessions.createSessions(ids, batch);
            offset += len;
        }

        uint256 cursor;
        while (cursor + 1 < n) {
            uint256 len = n - cursor;
            if (len > 41) len = 41;
            uint64[] memory chunk = new uint64[](len);
            for (uint256 j; j < len; ++j) {
                chunk[j] = all[cursor + j];
            }
            sessions.setSuccessors(chunk);
            if (cursor + len >= n) break;
            cursor += len - 1;
        }
        vm.stopBroadcast();
        console2.log("seeded", n);
    }
}
