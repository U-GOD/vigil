// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Fixture} from "./helpers/Fixture.sol";
import {SessionRegistry} from "../src/registry/SessionRegistry.sol";
import {CorporateActionRegistry} from "../src/oracle/CorporateActionRegistry.sol";
import {InjectedPrintOracle} from "../src/oracle/InjectedPrintOracle.sol";
import {ISessionRegistry} from "../src/interfaces/ISessionRegistry.sol";
import {IPrintOracle} from "../src/interfaces/IPrintOracle.sol";
import {ClosureMath} from "../src/libs/ClosureMath.sol";

contract RegistryTest is Fixture {
    function test_sessionRejectsBadWindow() public {
        ISessionRegistry.Session memory s = ISessionRegistry.Session({
            exchange: keccak256("XNYS"),
            closeTs: 100,
            openTs: 90,
            fallbackDeadline: 200,
            printBandSecs: 1,
            active: true
        });
        vm.expectRevert(SessionRegistry.InvalidWindow.selector);
        sessions.createSession(2, s);
    }

    function test_emitsSessionStored() public {
        ISessionRegistry.Session memory s = ISessionRegistry.Session({
            exchange: keccak256("XNYS"),
            closeTs: uint64(block.timestamp + 10),
            openTs: uint64(block.timestamp + 20),
            fallbackDeadline: uint64(block.timestamp + 30),
            printBandSecs: 60,
            active: true
        });
        vm.expectEmit(true, false, false, true, address(sessions));
        emit SessionRegistry.SessionStored(
            77, s.exchange, s.closeTs, s.openTs, s.fallbackDeadline, s.printBandSecs
        );
        sessions.createSession(77, s);
    }

    function test_sessionExistsOnce() public {
        assertTrue(sessions.exists(SESSION));
        vm.expectRevert(SessionRegistry.SessionExists.selector);
        sessions.createSession(
            SESSION,
            ISessionRegistry.Session({
                exchange: keccak256("XNYS"),
                closeTs: uint64(block.timestamp + 10),
                openTs: uint64(block.timestamp + 20),
                fallbackDeadline: uint64(block.timestamp + 30),
                printBandSecs: 1,
                active: true
            })
        );
        vm.expectRevert(SessionRegistry.SessionMissing.selector);
        sessions.sessionOf(99);
    }

    function test_adjDefaultAndPreClose() public {
        assertEq(corp.adjOf(TICKER, SESSION), ClosureMath.WAD);
        _applyAdj(5e17);
        assertEq(corp.adjOf(TICKER, SESSION), 5e17);
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(CorporateActionRegistry.SessionClosed.selector);
        corp.scheduleAdj(TICKER, SESSION, ClosureMath.WAD);
    }

    function test_adjRejectsZero() public {
        vm.expectRevert(CorporateActionRegistry.InvalidAdj.selector);
        corp.scheduleAdj(TICKER, SESSION, 0);
    }

    function test_adjCannotExecuteBeforeDelay() public {
        corp.scheduleAdj(TICKER, SESSION, 5e17);
        vm.expectRevert(CorporateActionRegistry.NotReady.selector);
        corp.executeAdj(TICKER, SESSION);
    }

    function test_adjChangesSplit() public {
        _applyAdj(5e17);
        (bytes32 id,,) = _createDefault();
        _fund(address(this), 1_000_000);
        vault.mintPair(id, 1_000_000, address(this));
        _finalizeAt(id, 50e18);
        (uint256 sUp,) = settlement.settlementOf(id);
        assertEq(sUp, 5e17);
    }

    function test_injectOnceAndNonZero() public {
        vm.expectRevert(InjectedPrintOracle.InvalidPrice.selector);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Close, 0);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Close, PRICE);
        vm.expectRevert(InjectedPrintOracle.AlreadyFinalized.selector);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Close, PRICE);
        (uint256 price, bool ok) = oracle.printOf(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        assertEq(price, PRICE);
        assertTrue(ok);
    }

    function _applyAdj(
        uint256 adj
    ) internal {
        corp.scheduleAdj(TICKER, SESSION, adj);
        vm.warp(block.timestamp + 1);
        corp.executeAdj(TICKER, SESSION);
    }
}
