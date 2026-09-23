// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ICorporateActionRegistry {
    function adjOf(bytes32 ticker, uint64 sessionId) external view returns (uint256);

    function delisted(bytes32 ticker, uint64 sessionId) external view returns (bool);
}
