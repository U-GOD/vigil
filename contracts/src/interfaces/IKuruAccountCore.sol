// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Application surface of Kuru AccountCore (Spot V2).
/// @dev ABI source: toxicflow-labs ts-sdk 0.3.0,
///      proxy 0xe08573a1Ecc4aa507c9626071fA0c4513caf7906.
interface IKuruAccountCore {
    /// @dev Credits the owner's root account and creates it on first deposit.
    function deposit(address rootOwner, address token, uint256 amount) external payable;

    function withdraw(
        uint40 rootAccountId,
        address token,
        uint256 amount,
        address recipient
    ) external;

    function rootAccountIdOf(
        address owner
    ) external view returns (uint40 id);

    function getBalance(uint40 accountId, address token) external view returns (uint256);

    function getSpotReservedBalance(
        uint40 accountId,
        address token
    ) external view returns (uint256);

    function spotTokenEnabled(
        address token
    ) external view returns (bool);

    function isAssetEnabledForSpot(
        address token
    ) external view returns (bool);

    function verifiedSpotOrderBook(
        address market
    ) external view returns (bool);

    function spotRouterAddress() external view returns (address);

    function protocolPaused() external view returns (bool);

    function authorizeAccountSigner(
        address account,
        address signer,
        uint32 permissions,
        uint64 expiry
    ) external;

    function revokeAccountSigner(address account, address signer) external;

    function isAuthorizedAccountSigner(
        address account,
        address signer,
        uint32 permission
    ) external view returns (bool);
}
