// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Fixture} from "./helpers/Fixture.sol";
import {ClosureNote} from "../src/core/ClosureNote.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";
import {IPrintOracle} from "../src/interfaces/IPrintOracle.sol";
import {ClosureMath} from "../src/libs/ClosureMath.sol";
import {ClosureVault} from "../src/core/ClosureVault.sol";
import {ClosureMarketFactory} from "../src/core/ClosureMarketFactory.sol";
import {SettlementEngine} from "../src/core/SettlementEngine.sol";

contract CoreTest is Fixture {
    function test_createMintBurn() public {
        (bytes32 id, address up, address dn) = _createDefault();
        (, address predUp, address predDn) =
            factory.predictNotes(TICKER, SESSION, K10, K10, address(usdc));
        assertEq(up, predUp);
        assertEq(dn, predDn);

        usdc.mint(address(this), 2_000_000);
        usdc.approve(address(vault), type(uint256).max);
        vault.mintPair(id, 1_000_000, address(this));
        assertEq(ClosureNote(up).balanceOf(address(this)), 1_000_000);
        assertEq(ClosureNote(dn).balanceOf(address(this)), 1_000_000);
        assertEq(usdc.balanceOf(feeSink), 300);
        assertEq(_heldOf(id), 1_000_000);

        vault.burnPair(id, 400_000, address(this));
        assertEq(ClosureNote(up).balanceOf(address(this)), 600_000);
        assertEq(usdc.balanceOf(address(this)), 2_000_000 - 1_000_300 + 400_000);
    }

    function test_revertMintAfterHalt() public {
        (bytes32 id,,) = _createDefault();
        vm.warp(block.timestamp + 3 days);
        settlement.halt(id);
        usdc.mint(address(this), 1_000_000);
        usdc.approve(address(vault), type(uint256).max);
        vm.expectRevert(ClosureVault.NotTrading.selector);
        vault.mintPair(id, 1_000_000, address(this));
    }

    function test_transferBlockedWhileHalted() public {
        (bytes32 id, address up,) = _createDefault();
        usdc.mint(address(this), 1_000_300);
        usdc.approve(address(vault), type(uint256).max);
        vault.mintPair(id, 1_000_000, address(this));
        vm.warp(block.timestamp + 3 days);
        settlement.halt(id);
        vm.expectRevert(ClosureNote.Halted.selector);
        ClosureNote(up).transfer(makeAddr("other"), 1);
        vault.burnPair(id, 1_000_000, address(this));
    }

    function test_lifecycleRedeem() public {
        (bytes32 id, address up, address dn) = _createDefault();
        usdc.mint(address(this), 1_000_300);
        usdc.approve(address(vault), type(uint256).max);
        vault.mintPair(id, 1_000_000, address(this));

        vm.warp(block.timestamp + 3 days);
        settlement.halt(id);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Close, PRICE);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Open, 105e18);
        settlement.finalize(id);

        (uint256 sUp,) = settlement.settlementOf(id);
        assertEq(sUp, 75e16);

        uint256 before = usdc.balanceOf(address(this));
        vault.redeem(id, 1_000_000, 1_000_000, address(this));
        assertEq(usdc.balanceOf(address(this)) - before, 1_000_000);
        assertEq(ClosureNote(up).totalSupply(), 0);
        assertEq(ClosureNote(dn).totalSupply(), 0);
    }

    function test_fallbackNeutral() public {
        (bytes32 id,,) = _createDefault();
        usdc.mint(address(this), 1_000_300);
        usdc.approve(address(vault), type(uint256).max);
        vault.mintPair(id, 1_000_000, address(this));
        vm.warp(block.timestamp + 4 days);
        settlement.fallbackFinalize(id);
        (uint256 sUp, ISettlement.State state) = settlement.settlementOf(id);
        assertEq(uint256(state), uint256(ISettlement.State.FallbackFinalized));
        assertEq(sUp, 5e17);
        vault.redeem(id, 1_000_000, 0, address(this));
        vault.redeem(id, 0, 1_000_000, address(this));
    }

    function test_roundingAdversary() public {
        (bytes32 id,,) = _createDefault();
        uint256 pairs = 1_000_000;
        usdc.mint(address(this), 2_000_000);
        usdc.approve(address(vault), type(uint256).max);
        vault.mintPair(id, pairs, address(this));
        vm.warp(block.timestamp + 3 days);
        settlement.halt(id);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Close, PRICE);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Open, 103e18);
        settlement.finalize(id);

        (uint256 sUp,) = settlement.settlementOf(id);
        for (uint256 i = 0; i < 1000; ++i) {
            vault.redeem(id, 1, 0, address(this));
            vault.redeem(id, 0, 1, address(this));
        }
        uint256 held = _heldOf(id);
        uint256 remainingUp = pairs - 1000;
        uint256 remainingDn = pairs - 1000;
        uint256 stillOwed =
            ClosureMath.payoutUp(remainingUp, sUp) + ClosureMath.payoutDn(remainingDn, sUp);
        assertGe(held, stillOwed);
    }

    function test_revertCreateUnknownTier() public {
        vm.expectRevert(ClosureMarketFactory.TierDenied.selector);
        factory.createMarket(TICKER, SESSION, 1, 1, address(usdc));
    }

    function test_revertCreateAfterClose() public {
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(ClosureMarketFactory.SessionNotOpen.selector);
        factory.createMarket(TICKER, SESSION, K10, K10, address(usdc));
    }

    function test_revertHaltEarly() public {
        (bytes32 id,,) = _createDefault();
        vm.expectRevert(SettlementEngine.TooEarly.selector);
        settlement.halt(id);
    }

    function test_revertRedeemBeforeFinalize() public {
        (bytes32 id,,) = _createDefault();
        usdc.mint(address(this), 1_000_300);
        usdc.approve(address(vault), type(uint256).max);
        vault.mintPair(id, 1_000_000, address(this));
        vm.expectRevert(ClosureVault.NotFinalized.selector);
        vault.redeem(id, 1, 0, address(this));
    }
}
