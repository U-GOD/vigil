// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Application surface of a Kuru Spot V2 OrderBook proxy.
/// @dev ABI source: toxicflow-labs ts-sdk 0.1.1.
///      Native enum ordinals follow the SDK (BUY=0, GTC=0, NONE=0).
interface IKuruOrderBook {
    enum NativeSide {
        BUY,
        SELL
    }

    enum NativeTif {
        GTC,
        IOC,
        FOK
    }

    enum NativeExecInstruction {
        NONE,
        POST_ONLY
    }

    struct NativeOrder {
        NativeSide side;
        uint96 quantity;
        uint32 price;
        NativeTif tif;
        NativeExecInstruction executionInstruction;
        uint32 minSizeAfterBlock;
    }

    struct BuilderConfig {
        address builder;
        uint32 feePps;
    }

    struct SwapResult {
        uint256 amountInUsed;
        uint256 amountOut;
    }

    function batch(
        uint40 userId,
        NativeOrder[] calldata orders,
        uint8[] calldata cancelSlotIdxs,
        bytes32 clientOrderId,
        BuilderConfig calldata builderConfig
    ) external;

    function cancelAllOrders(
        uint40 userId
    ) external;

    function swap(
        uint40 userId,
        bool isBuy,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        BuilderConfig calldata builderConfig
    ) external returns (SwapResult memory);

    function mintPassiveLiquidity(
        uint40 userId,
        uint32 lowPrice,
        uint256 baseAmount,
        uint256 quoteAmount,
        uint256 minSharesOut,
        uint256 deadline
    ) external returns (uint256 positionId, uint256 sharesOut);

    function burnPassiveLiquidity(
        uint40 userId,
        uint256 positionId,
        uint256 sharesToBurn
    )
        external
        returns (
            uint256 basePrincipalOut,
            uint256 quotePrincipalOut,
            uint256 baseFeeOut,
            uint256 quoteFeeOut
        );

    function bestBidAsk() external view returns (uint32 bid, uint32 ask);

    function getL2Book(
        uint32 levels
    )
        external
        view
        returns (
            uint32[] memory bidPrices,
            uint96[] memory bidSizes,
            uint32[] memory askPrices,
            uint96[] memory askSizes
        );

    function getMarketParams()
        external
        view
        returns (
            uint32 pricePrecision,
            uint32 sizePrecision,
            uint32 tickSize,
            uint96 minQuoteNotional,
            uint96 maxQuoteNotional,
            uint256 takerFeePps,
            uint256 makerFeePps
        );

    function marketState() external view returns (uint8);

    function baseToken() external view returns (address);

    function quoteToken() external view returns (address);

    function getOrderId(uint40 userId, uint8 slotIdx) external view returns (uint64);

    function baseSizeMultiplier() external view returns (uint256);
}
