// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ClosureMath} from "../src/libs/ClosureMath.sol";

contract MathHarness {
    function splitUp(
        uint256 pClose,
        uint256 pOpen,
        uint256 adj,
        uint256 kUp,
        uint256 kDn
    ) external pure returns (uint256) {
        return ClosureMath.splitUp(pClose, pOpen, adj, kUp, kDn);
    }
}

contract ClosureMathTest is Test {
    MathHarness internal harness = new MathHarness();
    uint256 internal constant WAD = 1e18;

    function test_noMoveSymmetric() public pure {
        uint256 sUp = ClosureMath.splitUp(100e18, 100e18, WAD, 1e17, 1e17);
        assertEq(sUp, 5e17);
    }

    function test_pinUp() public pure {
        assertEq(ClosureMath.splitUp(100e18, 110e18, WAD, 1e17, 1e17), WAD);
    }

    function test_pinDown() public pure {
        assertEq(ClosureMath.splitUp(100e18, 90e18, WAD, 1e17, 1e17), 0);
    }

    function test_halfCapUp() public pure {
        assertEq(ClosureMath.splitUp(100e18, 105e18, WAD, 1e17, 1e17), 75e16);
    }

    function test_asymmetricNoMove() public pure {
        assertEq(ClosureMath.splitUp(100e18, 100e18, WAD, 1e17, 2e17), 666_666_666_666_666_666);
        assertEq(ClosureMath.neutralSplit(1e17, 2e17), 666_666_666_666_666_666);
    }

    function test_revertZeroPrint() public {
        vm.expectRevert(ClosureMath.InvalidPrint.selector);
        harness.splitUp(0, 100e18, WAD, 1e17, 1e17);
    }

    function test_revertZeroAdj() public {
        vm.expectRevert(ClosureMath.InvalidPrint.selector);
        harness.splitUp(100e18, 100e18, 0, 1e17, 1e17);
    }

    function test_revertBadCap() public {
        vm.expectRevert(ClosureMath.InvalidCap.selector);
        harness.splitUp(100e18, 100e18, WAD, 0, 0);
    }

    function test_payoutsDoNotExceed() public pure {
        uint256 n = 1_000_000;
        uint256 sUp = 666_666_666_666_666_666;
        assertLe(ClosureMath.payoutUp(n, sUp) + ClosureMath.payoutDn(n, sUp), n);
    }

    function test_mintFeeOnTop() public pure {
        (uint256 requiredIn, uint256 backing) = ClosureMath.mintIn(1_000_000, 3);
        assertEq(backing, 1_000_000);
        assertEq(requiredIn, 1_000_300);
    }

    function testFuzz_splitBounded(
        uint256 pClose,
        uint256 pOpen,
        uint256 adj,
        uint256 kUp,
        uint256 kDn
    ) public {
        pClose = bound(pClose, 1, type(uint128).max);
        pOpen = bound(pOpen, 0, type(uint128).max);
        adj = bound(adj, 1, 100e18);
        kUp = bound(kUp, 0, ClosureMath.MAX_CAP);
        kDn = bound(kDn, 0, ClosureMath.MAX_CAP);
        vm.assume(kUp + kDn > 0);
        uint256 sUp = ClosureMath.splitUp(pClose, pOpen, adj, kUp, kDn);
        assertLe(sUp, ClosureMath.WAD);
        uint256 n = 1_000_000;
        assertLe(ClosureMath.payoutUp(n, sUp) + ClosureMath.payoutDn(n, sUp), n);
    }

    function test_adjSplitIsNoMove() public pure {
        assertEq(ClosureMath.splitUp(100e18, 50e18, 5e17, 1e17, 1e17), 5e17);
    }

    function test_beyondCapPins() public pure {
        assertEq(ClosureMath.splitUp(100e18, 200e18, 1e18, 1e17, 1e17), 1e18);
    }

    function test_oneSidedDnZero() public pure {
        assertEq(ClosureMath.splitUp(100e18, 100e18, 1e18, 1e17, 0), 0);
        assertEq(ClosureMath.neutralSplit(1e17, 0), 0);
    }

    function test_marketIdStable() public pure {
        bytes32 ticker = keccak256("NVDA");
        address token = address(1);
        bytes32 a = ClosureMath.marketId(ticker, 1, 1e17, 1e17, token);
        bytes32 b = ClosureMath.marketId(ticker, 1, 1e17, 1e17, token);
        assertEq(a, b);
        assertTrue(a != ClosureMath.marketId(ticker, 2, 1e17, 1e17, token));
    }
}
