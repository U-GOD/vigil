// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Fixture} from "./helpers/Fixture.sol";
import {SettlementEngine} from "../src/core/SettlementEngine.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";
import {IPrintOracle} from "../src/interfaces/IPrintOracle.sol";

contract SettlementEngineTest is Fixture {
    function test_haltRequiresOpen() public {
        (bytes32 id,,) = _createDefault();
        vm.expectRevert(SettlementEngine.TooEarly.selector);
        settlement.halt(id);
        _warpOpen();
        settlement.halt(id);
        assertTrue(settlement.isHalted(id));
        vm.expectRevert(SettlementEngine.WrongState.selector);
        settlement.halt(id);
    }

    function test_finalizeRequiresHaltAndPrints() public {
        (bytes32 id,,) = _createDefault();
        vm.expectRevert(SettlementEngine.WrongState.selector);
        settlement.finalize(id);
        _warpOpen();
        settlement.halt(id);
        vm.expectRevert(SettlementEngine.PrintsMissing.selector);
        settlement.finalize(id);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Close, PRICE);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Open, 110e18);
        settlement.finalize(id);
        (uint256 sUp, ISettlement.State state) = settlement.settlementOf(id);
        assertEq(sUp, 1e18);
        assertEq(uint256(state), uint256(ISettlement.State.Finalized));
        vm.expectRevert(SettlementEngine.WrongState.selector);
        settlement.finalize(id);
    }

    function test_fallbackFromTrading() public {
        (bytes32 id,,) = _createDefault();
        vm.expectRevert(SettlementEngine.TooEarly.selector);
        settlement.fallbackFinalize(id);
        _warpFallback();
        settlement.fallbackFinalize(id);
        (uint256 sUp, ISettlement.State state) = settlement.settlementOf(id);
        assertEq(sUp, 5e17);
        assertEq(uint256(state), uint256(ISettlement.State.FallbackFinalized));
        assertFalse(settlement.isHalted(id));
    }

    function test_fallbackFromHalted() public {
        (bytes32 id,,) = _createDefault();
        _warpOpen();
        settlement.halt(id);
        _warpFallback();
        settlement.fallbackFinalize(id);
        (, ISettlement.State state) = settlement.settlementOf(id);
        assertEq(uint256(state), uint256(ISettlement.State.FallbackFinalized));
    }

    function test_cannotFinalizeAfterFallback() public {
        (bytes32 id,,) = _createDefault();
        _warpFallback();
        settlement.fallbackFinalize(id);
        vm.expectRevert(SettlementEngine.WrongState.selector);
        settlement.finalize(id);
    }

    function test_finalizeBatch() public {
        (bytes32 id,,) = _createDefault();
        (bytes32 id2,,) = factory.createMarket(keccak256("AAPL"), SESSION, K10, K10, address(usdc));
        _warpOpen();
        settlement.halt(id);
        settlement.halt(id2);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Close, PRICE);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Open, PRICE);
        oracle.inject(keccak256("AAPL"), SESSION, IPrintOracle.PrintKind.Close, PRICE);
        oracle.inject(keccak256("AAPL"), SESSION, IPrintOracle.PrintKind.Open, PRICE);
        bytes32[] memory ids = new bytes32[](2);
        ids[0] = id;
        ids[1] = id2;
        settlement.finalizeBatch(ids);
        (, ISettlement.State s1) = settlement.settlementOf(id);
        (, ISettlement.State s2) = settlement.settlementOf(id2);
        assertEq(uint256(s1), uint256(ISettlement.State.Finalized));
        assertEq(uint256(s2), uint256(ISettlement.State.Finalized));
    }

    function test_termsImmutable() public {
        (bytes32 id,,) = _createDefault();
        (bytes32 ticker, uint64 sessionId, uint64 kUp, uint64 kDn, ISettlement.State state) =
            settlement.termsOf(id);
        assertEq(ticker, TICKER);
        assertEq(sessionId, SESSION);
        assertEq(kUp, K10);
        assertEq(kDn, K10);
        assertEq(uint256(state), uint256(ISettlement.State.Trading));
        _finalizeAt(id, 90e18);
        (bytes32 ticker2, uint64 sessionId2, uint64 kUp2, uint64 kDn2,) = settlement.termsOf(id);
        assertEq(ticker2, ticker);
        assertEq(sessionId2, sessionId);
        assertEq(kUp2, kUp);
        assertEq(kDn2, kDn);
    }

    function test_missingMarket() public {
        vm.expectRevert(SettlementEngine.MarketMissing.selector);
        settlement.settlementOf(bytes32(uint256(123)));
    }

    function test_setFactoryOnce() public {
        SettlementEngine other = new SettlementEngine(address(this), sessions, oracle, corp);
        other.setFactory(address(factory), factory);
        vm.expectRevert(SettlementEngine.AlreadySet.selector);
        other.setFactory(address(factory), factory);
    }
}
