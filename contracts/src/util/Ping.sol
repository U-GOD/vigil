// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Scaffold contract used to prove the deploy + SDK address path.
contract Ping {
    string public constant VERSION = "phase-1";

    function ping() external pure returns (bytes32) {
        return keccak256("vigil");
    }
}
