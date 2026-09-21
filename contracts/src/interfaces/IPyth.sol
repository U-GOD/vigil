// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// @notice Application surface of the Pyth pull oracle on Monad.
/// @dev Function set matches IPyth as deployed at
///      0x2880aB155794e7179c9eE2e38200202908C17B43 (testnet).
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    function getUpdateFee(
        bytes[] calldata updateData
    ) external view returns (uint256 fee);

    function updatePriceFeeds(
        bytes[] calldata updateData
    ) external payable;

    function getPriceUnsafe(
        bytes32 id
    ) external view returns (Price memory price);

    function getPriceNoOlderThan(
        bytes32 id,
        uint256 age
    ) external view returns (Price memory price);
}
