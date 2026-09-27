// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISessionRegistry} from "../interfaces/ISessionRegistry.sol";

/// @notice Exchange calendar. Real and synthetic sessions share this path.
/// A missing open walks `successorOf` only after `noAuction` is declared.
contract SessionRegistry is ISessionRegistry, Ownable {
    error SessionExists();
    error SessionMissing();
    error InvalidWindow();
    error AlreadySet();
    error TooEarly();

    uint256 public constant MAX_BATCH = 40;

    mapping(uint64 => Session) private _sessions;
    mapping(uint64 => uint64) public successorOf;
    mapping(uint64 => bool) public noAuction;

    event SessionStored(
        uint64 indexed sessionId,
        bytes32 exchange,
        uint64 closeTs,
        uint64 openTs,
        uint64 fallbackDeadline,
        uint32 printBandSecs
    );
    event NoAuctionDeclared(uint64 indexed sessionId);
    event SuccessorSet(uint64 indexed sessionId, uint64 successorId);

    constructor(
        address owner_
    ) Ownable(owner_) {}

    function createSession(uint64 sessionId, Session calldata session) external onlyOwner {
        _store(sessionId, session);
    }

    function createSessions(uint64[] calldata ids, Session[] calldata batch) external onlyOwner {
        uint256 n = ids.length;
        if (n == 0 || n != batch.length || n > MAX_BATCH) revert InvalidWindow();
        for (uint256 i; i < n; ++i) {
            _store(ids[i], batch[i]);
        }
    }

    function setSuccessor(uint64 sessionId, uint64 nextId) external onlyOwner {
        _link(sessionId, nextId);
    }

    function setSuccessors(
        uint64[] calldata ids
    ) external onlyOwner {
        uint256 n = ids.length;
        if (n < 2 || n > MAX_BATCH + 1) revert InvalidWindow();
        for (uint256 i; i + 1 < n; ++i) {
            _link(ids[i], ids[i + 1]);
        }
    }

    /// @notice The opening auction did not happen. Fixed successor, if any, supplies the open.
    function declareNoAuction(
        uint64 sessionId
    ) external onlyOwner {
        Session storage session = _sessions[sessionId];
        if (session.closeTs == 0) revert SessionMissing();
        if (block.timestamp < session.openTs) revert TooEarly();
        if (noAuction[sessionId]) revert AlreadySet();
        noAuction[sessionId] = true;
        emit NoAuctionDeclared(sessionId);
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

    function _store(uint64 sessionId, Session calldata session) internal {
        if (_sessions[sessionId].active || _sessions[sessionId].closeTs != 0) {
            revert SessionExists();
        }
        if (session.closeTs == 0 || session.closeTs >= session.openTs) revert InvalidWindow();
        if (session.openTs >= session.fallbackDeadline) revert InvalidWindow();
        if (!session.active) revert InvalidWindow();
        _sessions[sessionId] = session;
        emit SessionStored(
            sessionId,
            session.exchange,
            session.closeTs,
            session.openTs,
            session.fallbackDeadline,
            session.printBandSecs
        );
    }

    function _link(uint64 sessionId, uint64 nextId) internal {
        if (_sessions[sessionId].closeTs == 0 || _sessions[nextId].closeTs == 0) {
            revert SessionMissing();
        }
        if (successorOf[sessionId] != 0) revert AlreadySet();
        if (_sessions[nextId].openTs < _sessions[sessionId].openTs) revert InvalidWindow();
        successorOf[sessionId] = nextId;
        emit SuccessorSet(sessionId, nextId);
    }
}
