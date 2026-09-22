// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISessionRegistry} from "../interfaces/ISessionRegistry.sol";

/// @notice Minimal session calendar. Holiday seeding and synthetic exchanges are Phase 3.
contract SessionRegistry is ISessionRegistry, Ownable {
    error SessionExists();
    error SessionMissing();
    error InvalidWindow();

    mapping(uint64 => Session) private _sessions;

    constructor(
        address owner_
    ) Ownable(owner_) {}

    function createSession(uint64 sessionId, Session calldata session) external onlyOwner {
        if (_sessions[sessionId].active || _sessions[sessionId].closeTs != 0) {
            revert SessionExists();
        }
        if (session.closeTs == 0 || session.closeTs >= session.openTs) revert InvalidWindow();
        if (session.openTs >= session.fallbackDeadline) revert InvalidWindow();
        if (!session.active) revert InvalidWindow();
        _sessions[sessionId] = session;
    }

    function sessionOf(
        uint64 sessionId
    ) external view returns (Session memory session) {
        session = _sessions[sessionId];
        if (session.closeTs == 0) revert SessionMissing();
    }

    function exists(
        uint64 sessionId
    ) external view returns (bool) {
        return _sessions[sessionId].closeTs != 0;
    }
}
