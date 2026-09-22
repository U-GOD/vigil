// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPrintOracle {
    enum PrintKind {
        Close,
        Open
    }

    function printOf(
        bytes32 ticker,
        uint64 sessionId,
        PrintKind kind
    ) external view returns (uint256 price, bool finalized);
}
