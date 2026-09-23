// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPyth} from "../../src/interfaces/IPyth.sol";

/// @notice Test double for the Pyth contract. Settlement still goes through PrintOracle.
contract MockPyth is IPyth {
    error FeeShort();

    uint256 public fee = 100;
    Price internal _price;

    function setPrice(int64 price, int32 expo, uint256 publishTime) external {
        _price = Price({price: price, conf: 0, expo: expo, publishTime: publishTime});
    }

    function getUpdateFee(
        bytes[] calldata
    ) external view returns (uint256) {
        return fee;
    }

    function updatePriceFeeds(
        bytes[] calldata
    ) external payable {
        if (msg.value < fee) revert FeeShort();
    }

    function getPriceUnsafe(
        bytes32
    ) external view returns (Price memory) {
        return _price;
    }

    function getPriceNoOlderThan(bytes32, uint256) external view returns (Price memory) {
        return _price;
    }
}
