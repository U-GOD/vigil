// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Pure settlement math. No storage, no external calls.
library ClosureMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant MAX_CAP = 1e18;
    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint8 internal constant NOTE_DECIMALS = 6;

    error InvalidPrint();
    error InvalidCap();
    error InvalidAmount();

    function marketId(
        bytes32 ticker,
        uint64 sessionId,
        uint64 kUp,
        uint64 kDn,
        address collateral
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(ticker, sessionId, kUp, kDn, collateral));
    }

    /// @notice Split factor for the UP leg, in WAD, in [0, WAD].
    function splitUp(
        uint256 pClose,
        uint256 pOpen,
        uint256 adj,
        uint256 kUp,
        uint256 kDn
    ) internal pure returns (uint256) {
        if (pClose == 0 || adj == 0) revert InvalidPrint();
        if (kUp > MAX_CAP || kDn > MAX_CAP || kUp + kDn == 0) revert InvalidCap();

        uint256 pOpenAdj = Math.mulDiv(pOpen, WAD, adj);
        uint256 range = kUp + kDn;
        uint256 sUp;

        if (pOpenAdj >= pClose) {
            uint256 r = Math.mulDiv(pOpenAdj - pClose, WAD, pClose);
            uint256 g = r > kUp ? kUp : r;
            sUp = Math.mulDiv(g + kDn, WAD, range);
        } else {
            uint256 r = Math.mulDiv(pClose - pOpenAdj, WAD, pClose);
            uint256 g = r > kDn ? kDn : r;
            sUp = Math.mulDiv(kDn - g, WAD, range);
        }

        if (sUp > WAD) sUp = WAD;
        return sUp;
    }

    /// @notice Neutral split used when the oracle fails: g = 0.
    function neutralSplit(uint256 kUp, uint256 kDn) internal pure returns (uint256) {
        if (kUp > MAX_CAP || kDn > MAX_CAP || kUp + kDn == 0) revert InvalidCap();
        return Math.mulDiv(kDn, WAD, kUp + kDn);
    }

    function payoutUp(uint256 amount, uint256 sUp) internal pure returns (uint256) {
        if (sUp > WAD) revert InvalidAmount();
        return Math.mulDiv(amount, sUp, WAD);
    }

    function payoutDn(uint256 amount, uint256 sUp) internal pure returns (uint256) {
        if (sUp > WAD) revert InvalidAmount();
        return Math.mulDiv(amount, WAD - sUp, WAD);
    }

    function mintIn(
        uint256 pairs,
        uint16 mintFeeBps
    ) internal pure returns (uint256 requiredIn, uint256 backing) {
        if (pairs == 0) revert InvalidAmount();
        backing = pairs;
        requiredIn = Math.mulDiv(pairs, BPS_DENOMINATOR + mintFeeBps, BPS_DENOMINATOR);
    }
}
