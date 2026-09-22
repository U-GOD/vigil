// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPrintOracle} from "../interfaces/IPrintOracle.sol";

/// @notice Phase-2 settlement path: the owner injects official prints.
/// Phase 3 replaces this with the multi-reporter PrintOracle.
contract InjectedPrintOracle is IPrintOracle, Ownable {
    error InvalidPrice();
    error AlreadyFinalized();

    struct Print {
        uint256 price;
        bool finalized;
    }

    mapping(bytes32 ticker => mapping(uint64 sessionId => mapping(PrintKind => Print))) private
        _prints;

    constructor(
        address owner_
    ) Ownable(owner_) {}

    function inject(
        bytes32 ticker,
        uint64 sessionId,
        PrintKind kind,
        uint256 price
    ) external onlyOwner {
        if (price == 0) revert InvalidPrice();
        Print storage print = _prints[ticker][sessionId][kind];
        if (print.finalized) revert AlreadyFinalized();
        print.price = price;
        print.finalized = true;
    }

    function printOf(
        bytes32 ticker,
        uint64 sessionId,
        PrintKind kind
    ) external view returns (uint256 price, bool finalized) {
        Print storage print = _prints[ticker][sessionId][kind];
        return (print.price, print.finalized);
    }
}
