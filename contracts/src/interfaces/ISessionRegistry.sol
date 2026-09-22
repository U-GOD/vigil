// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISessionRegistry {
    struct Session {
        bytes32 exchange;
        uint64 closeTs;
        uint64 openTs;
        uint64 fallbackDeadline;
        uint32 printBandSecs;
        bool active;
    }

    function sessionOf(
        uint64 sessionId
    ) external view returns (Session memory);

    function exists(
        uint64 sessionId
    ) external view returns (bool);
}
