// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ICorporateActionRegistry} from "../interfaces/ICorporateActionRegistry.sol";
import {ISessionRegistry} from "../interfaces/ISessionRegistry.sol";
import {ClosureMath} from "../libs/ClosureMath.sol";

contract CorporateActionRegistry is ICorporateActionRegistry, Ownable {
    error SessionClosed();
    error InvalidAdj();

    ISessionRegistry public immutable sessions;
    mapping(bytes32 ticker => mapping(uint64 sessionId => uint256 adj)) private _adj;

    constructor(address owner_, ISessionRegistry sessions_) Ownable(owner_) {
        sessions = sessions_;
    }

    function setAdj(bytes32 ticker, uint64 sessionId, uint256 adj) external onlyOwner {
        if (adj == 0 || adj > ClosureMath.WAD * 100) revert InvalidAdj();
        ISessionRegistry.Session memory session = sessions.sessionOf(sessionId);
        if (block.timestamp >= session.closeTs) revert SessionClosed();
        _adj[ticker][sessionId] = adj;
    }

    function adjOf(bytes32 ticker, uint64 sessionId) external view returns (uint256) {
        uint256 adj = _adj[ticker][sessionId];
        return adj == 0 ? ClosureMath.WAD : adj;
    }
}
