// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Application surface of Kuru SpotRouter (Spot V2).
/// @dev Market creation is permissioned and omitted. ABI source:
///      toxicflow-labs ts-sdk 0.1.1, proxy 0xba24a1042701f06e8F7edCF04389260D1Fa4c697.
interface IKuruSpotRouter {
    function verifiedSpotMarket(
        address market
    ) external view returns (bool);

    function whitelistedSpotTokens(
        address token
    ) external view returns (bool);

    function spotBalanceAccountAddress() external view returns (address);

    function spotOrderBookImplementation() external view returns (address);

    function authority() external view returns (address);

    function computeAddress(
        address baseToken,
        address quoteToken,
        uint96 sizePrecision,
        uint32 pricePrecision,
        uint32 tickSize,
        uint32 passiveSpreadTicks,
        uint96 minQuoteNotional,
        uint96 maxQuoteNotional,
        uint256 takerFeePps,
        uint256 makerFeePps
    ) external view returns (address);
}
