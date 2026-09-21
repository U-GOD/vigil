// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Application surface of Kuru AccountCore (Spot V2).
/// @dev ABI source: toxicflow-labs ts-sdk 0.1.1,
///      proxy 0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22.
interface IKuruAccountCore {
    function deposit(address token, uint256 amount) external payable;

    function depositForAccount(address account, address token, uint256 amount) external payable;

    function withdraw(address token, uint256 amount) external;

    function withdrawFromAccount(address account, address token, uint256 amount) external;

    function userRegistry(
        address user
    ) external view returns (uint40 id);

    function getBalance(address user, address token) external view returns (uint256);

    function getSpotReservedBalance(address user, address token) external view returns (uint256);

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
        uint256 expiry
    ) external;

    function revokeAccountSigner(address account, address signer) external;

    function isAuthorizedAccountSigner(
        address account,
        address signer,
        uint32 permission
    ) external view returns (bool);
}
