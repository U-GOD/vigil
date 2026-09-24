// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ClosureMath} from "../src/libs/ClosureMath.sol";

/// @notice A DN hedge sized by (kUp + kDn)·V·coverage cancels the equity P&L inside the caps.
contract HedgeTest is Test {
    uint256 internal constant WAD = 1e18;

    function test_symmetricHedgeIsFlatInsideTheCap() public pure {
        uint256 inventory = 1_000_000_000;
        uint64 k = 1e17;
        uint256 q = _quantity(inventory, k, k, WAD);
        assertEq(q, 200_000_000);

        uint256 pClose = 100e18;
        uint256 pOpen = 105e18;
        int256 residual = _residual(inventory, q, pClose, pOpen, WAD, k, k);
        assertEq(residual, 0);
    }

    function test_asymmetricHedgeIsFlatInsideTheCap() public pure {
        uint256 inventory = 1_000_000_000;
        uint64 kUp = 25e16;
        uint64 kDn = 1e17;
        uint256 q = _quantity(inventory, kUp, kDn, WAD);
        uint256 pClose = 100e18;
        uint256 pOpen = 90e18;
        int256 residual = _residual(inventory, q, pClose, pOpen, WAD, kUp, kDn);
        assertLt(residual >= 0 ? residual : -residual, int256(2));
    }

    function test_halfCoverageLeavesHalfTheMove() public pure {
        uint256 inventory = 1_000_000_000;
        uint64 k = 1e17;
        uint256 q = _quantity(inventory, k, k, WAD / 2);
        int256 residual = _residual(inventory, q, 100e18, 105e18, WAD, k, k);
        assertEq(residual, 25_000_000);
    }

    function _quantity(
        uint256 inventory,
        uint64 kUp,
        uint64 kDn,
        uint256 coverage
    ) internal pure returns (uint256) {
        return inventory * (uint256(kUp) + uint256(kDn)) * coverage / WAD / WAD;
    }

    function _residual(
        uint256 inventory,
        uint256 quantity,
        uint256 pClose,
        uint256 pOpen,
        uint256 adj,
        uint64 kUp,
        uint64 kDn
    ) internal pure returns (int256) {
        uint256 sUp = ClosureMath.splitUp(pClose, pOpen, adj, kUp, kDn);
        uint256 s0 = ClosureMath.neutralSplit(kUp, kDn);
        int256 stock = int256(inventory) * _signedGap(pClose, pOpen, adj) / int256(WAD);
        int256 hedge;
        if (sUp > s0) hedge = -int256(quantity * (sUp - s0) / WAD);
        else hedge = int256(quantity * (s0 - sUp) / WAD);
        return stock + hedge;
    }

    function _signedGap(
        uint256 pClose,
        uint256 pOpen,
        uint256 adj
    ) internal pure returns (int256) {
        uint256 pOpenAdj = pOpen * WAD / adj;
        if (pOpenAdj >= pClose) return int256((pOpenAdj - pClose) * WAD / pClose);
        return -int256((pClose - pOpenAdj) * WAD / pClose);
    }
}
