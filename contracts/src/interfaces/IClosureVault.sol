// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IClosureVault {
    function registerMarket(
        bytes32 marketId,
        address noteUp,
        address noteDn,
        address collateral
    ) external;

    function cumulativeMinted(
        bytes32 marketId
    ) external view returns (uint256);
}
