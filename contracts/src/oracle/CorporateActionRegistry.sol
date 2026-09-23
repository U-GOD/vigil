// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICorporateActionRegistry} from "../interfaces/ICorporateActionRegistry.sol";
import {ISessionRegistry} from "../interfaces/ISessionRegistry.sol";
import {ClosureMath} from "../libs/ClosureMath.sol";

/// @notice Adjustment and delist flags. Both are timelocked.
/// `adj` can execute only before `closeTs`. A delist can execute only during the window.
contract CorporateActionRegistry is ICorporateActionRegistry, Ownable {
    error SessionClosed();
    error InvalidAdj();
    error NotReady();
    error NoProposal();
    error AlreadyPending();
    error OutsideWindow();

    struct PendingAdj {
        uint256 value;
        uint64 readyAt;
        bool exists;
    }

    struct PendingFlag {
        uint64 readyAt;
        bool exists;
    }

    ISessionRegistry public immutable sessions;
    uint64 public immutable adjDelay;

    mapping(bytes32 ticker => mapping(uint64 sessionId => uint256 adj)) private _adj;
    mapping(bytes32 ticker => mapping(uint64 sessionId => bool)) public delisted;
    mapping(bytes32 ticker => mapping(uint64 sessionId => PendingAdj)) private _pendingAdj;
    mapping(bytes32 ticker => mapping(uint64 sessionId => PendingFlag)) private _pendingDelist;

    event AdjScheduled(bytes32 indexed ticker, uint64 sessionId, uint256 adj, uint64 readyAt);
    event AdjExecuted(bytes32 indexed ticker, uint64 sessionId, uint256 adj);
    event AdjCancelled(bytes32 indexed ticker, uint64 sessionId);
    event DelistScheduled(bytes32 indexed ticker, uint64 sessionId, uint64 readyAt);
    event DelistExecuted(bytes32 indexed ticker, uint64 sessionId);
    event DelistCancelled(bytes32 indexed ticker, uint64 sessionId);

    constructor(address owner_, ISessionRegistry sessions_, uint64 adjDelay_) Ownable(owner_) {
        sessions = sessions_;
        adjDelay = adjDelay_;
    }

    function scheduleAdj(bytes32 ticker, uint64 sessionId, uint256 adj) external onlyOwner {
        if (adj == 0 || adj > ClosureMath.WAD * 100) revert InvalidAdj();
        ISessionRegistry.Session memory session = sessions.sessionOf(sessionId);
        if (block.timestamp >= session.closeTs) revert SessionClosed();
        if (_pendingAdj[ticker][sessionId].exists) revert AlreadyPending();
        uint64 readyAt = uint64(block.timestamp) + adjDelay;
        _pendingAdj[ticker][sessionId] = PendingAdj({value: adj, readyAt: readyAt, exists: true});
        emit AdjScheduled(ticker, sessionId, adj, readyAt);
    }

    function executeAdj(bytes32 ticker, uint64 sessionId) external {
        PendingAdj memory pending = _pendingAdj[ticker][sessionId];
        if (!pending.exists) revert NoProposal();
        if (block.timestamp < pending.readyAt) revert NotReady();
        ISessionRegistry.Session memory session = sessions.sessionOf(sessionId);
        if (block.timestamp >= session.closeTs) revert SessionClosed();
        delete _pendingAdj[ticker][sessionId];
        _adj[ticker][sessionId] = pending.value;
        emit AdjExecuted(ticker, sessionId, pending.value);
    }

    function cancelAdj(bytes32 ticker, uint64 sessionId) external onlyOwner {
        if (!_pendingAdj[ticker][sessionId].exists) revert NoProposal();
        delete _pendingAdj[ticker][sessionId];
        emit AdjCancelled(ticker, sessionId);
    }

    function scheduleDelist(bytes32 ticker, uint64 sessionId) external onlyOwner {
        ISessionRegistry.Session memory session = sessions.sessionOf(sessionId);
        if (block.timestamp < session.closeTs || block.timestamp >= session.openTs) {
            revert OutsideWindow();
        }
        if (delisted[ticker][sessionId] || _pendingDelist[ticker][sessionId].exists) {
            revert AlreadyPending();
        }
        uint64 readyAt = uint64(block.timestamp) + adjDelay;
        _pendingDelist[ticker][sessionId] = PendingFlag({readyAt: readyAt, exists: true});
        emit DelistScheduled(ticker, sessionId, readyAt);
    }

    function executeDelist(bytes32 ticker, uint64 sessionId) external {
        PendingFlag memory pending = _pendingDelist[ticker][sessionId];
        if (!pending.exists) revert NoProposal();
        if (block.timestamp < pending.readyAt) revert NotReady();
        ISessionRegistry.Session memory session = sessions.sessionOf(sessionId);
        if (block.timestamp >= session.openTs) revert OutsideWindow();
        delete _pendingDelist[ticker][sessionId];
        delisted[ticker][sessionId] = true;
        emit DelistExecuted(ticker, sessionId);
    }

    function cancelDelist(bytes32 ticker, uint64 sessionId) external onlyOwner {
        if (!_pendingDelist[ticker][sessionId].exists) revert NoProposal();
        delete _pendingDelist[ticker][sessionId];
        emit DelistCancelled(ticker, sessionId);
    }

    function adjOf(bytes32 ticker, uint64 sessionId) external view returns (uint256) {
        uint256 adj = _adj[ticker][sessionId];
        return adj == 0 ? ClosureMath.WAD : adj;
    }
}
