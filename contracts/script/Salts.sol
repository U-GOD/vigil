// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice CREATE2 salts for the testnet stack. Broadcast receipts, not these salts, fill the address book.
library Salts {
    bytes32 internal constant SESSIONS = bytes32(uint256(1));
    bytes32 internal constant CORP = bytes32(uint256(2));
    bytes32 internal constant ORACLE = bytes32(uint256(3));
    bytes32 internal constant REPORTER = bytes32(uint256(4));
    bytes32 internal constant SETTLEMENT = bytes32(uint256(5));
    bytes32 internal constant VAULT = bytes32(uint256(6));
    bytes32 internal constant FACTORY = bytes32(uint256(7));
    bytes32 internal constant COLLATERAL = bytes32(uint256(8));
    bytes32 internal constant LISTING = bytes32(uint256(9));
    bytes32 internal constant POLICY = bytes32(uint256(10));
    bytes32 internal constant UNDERWRITING = bytes32(uint256(11));
}
