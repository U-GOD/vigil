// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SessionRegistry} from "../src/registry/SessionRegistry.sol";
import {CorporateActionRegistry} from "../src/oracle/CorporateActionRegistry.sol";
import {PrintOracle} from "../src/oracle/PrintOracle.sol";
import {SettlementEngine} from "../src/core/SettlementEngine.sol";
import {ClosureVault} from "../src/core/ClosureVault.sol";
import {ClosureMarketFactory, ISettlementRegistrar} from "../src/core/ClosureMarketFactory.sol";
import {TestCollateral} from "../src/util/TestCollateral.sol";
import {ISessionRegistry} from "../src/interfaces/ISessionRegistry.sol";
import {IPrintOracle} from "../src/interfaces/IPrintOracle.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";

contract PrintOracleTest is Test {
    uint64 internal constant SESSION = 1;
    uint64 internal constant NEXT = 2;
    uint64 internal constant K10 = 1e17;
    bytes32 internal constant TICKER = keccak256("NVDA");
    bytes32 internal constant XNYS = keccak256("XNYS");
    uint256 internal constant BOND = 1 ether;

    SessionRegistry internal sessions;
    CorporateActionRegistry internal corp;
    PrintOracle internal oracle;
    SettlementEngine internal settlement;
    ClosureVault internal vault;
    ClosureMarketFactory internal factory;
    TestCollateral internal usdc;
    address internal council = makeAddr("council");
    address internal feeSink = makeAddr("feeSink");
    address internal r1 = makeAddr("r1");
    address internal r2 = makeAddr("r2");
    address internal r3 = makeAddr("r3");

    function setUp() public {
        sessions = new SessionRegistry(address(this));
        corp = new CorporateActionRegistry(address(this), sessions, 1);
        oracle =
            new PrintOracle(address(this), council, feeSink, sessions, 500, 2000, 3, uint96(BOND));
        oracle.setDisputeWindow(XNYS, 100);
        oracle.addReporter(r1);
        oracle.addReporter(r2);
        oracle.addReporter(r3);
        settlement = new SettlementEngine(address(this), sessions, oracle, corp);
        vault = new ClosureVault(address(this), settlement, feeSink, 3);
        factory = new ClosureMarketFactory(
            address(this), sessions, vault, ISettlementRegistrar(address(settlement)), feeSink, 0
        );
        vault.setFactory(address(factory));
        settlement.setFactory(address(factory), factory);
        factory.setTier(K10, K10, true);
        usdc = new TestCollateral();
        _session(SESSION, uint64(block.timestamp + 1 days), uint64(block.timestamp + 3 days));
        vm.deal(address(this), 10 ether);
    }

    receive() external payable {}

    function test_quorumMedianAndFinalize() public {
        _submit(r1, IPrintOracle.PrintKind.Close, 100e18);
        _submit(r2, IPrintOracle.PrintKind.Close, 101e18);
        vm.expectRevert(PrintOracle.DisputeWindow.selector);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        _submit(r3, IPrintOracle.PrintKind.Close, 104e18);
        (uint256 candidate, uint8 count,,, bool finalized,) =
            oracle.statusOf(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        assertEq(count, 3);
        assertEq(candidate, 101e18);
        assertFalse(finalized);
        vm.warp(block.timestamp + 100);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        (uint256 price, bool ok) = oracle.printOf(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        assertTrue(ok);
        assertEq(price, 101e18);
    }

    function test_evenCountTakesLowerMiddle() public {
        oracle.setQuorum(TICKER, 2);
        _submit(r1, IPrintOracle.PrintKind.Close, 100e18);
        _submit(r2, IPrintOracle.PrintKind.Close, 104e18);
        (uint256 candidate,,,,,) = oracle.statusOf(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        assertEq(candidate, 100e18);
    }

    function test_deviationRejectsOutlier() public {
        _submit(r1, IPrintOracle.PrintKind.Close, 100e18);
        vm.prank(r2);
        vm.expectRevert(PrintOracle.Deviation.selector);
        oracle.submit(TICKER, SESSION, IPrintOracle.PrintKind.Close, 110e18);
    }

    function test_duplicateAndOutsiderAndZero() public {
        _submit(r1, IPrintOracle.PrintKind.Close, 100e18);
        vm.prank(r1);
        vm.expectRevert(PrintOracle.Duplicate.selector);
        oracle.submit(TICKER, SESSION, IPrintOracle.PrintKind.Close, 100e18);
        vm.expectRevert(PrintOracle.NotReporter.selector);
        oracle.submit(TICKER, SESSION, IPrintOracle.PrintKind.Close, 100e18);
        vm.prank(r2);
        vm.expectRevert(PrintOracle.InvalidPrice.selector);
        oracle.submit(TICKER, SESSION, IPrintOracle.PrintKind.Close, 0);
    }

    function test_submitAfterFinalizeReverts() public {
        _arm(IPrintOracle.PrintKind.Close, 100e18);
        vm.warp(block.timestamp + 100);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        vm.prank(r1);
        vm.expectRevert(PrintOracle.Closed.selector);
        oracle.submit(TICKER, SESSION, IPrintOracle.PrintKind.Close, 100e18);
    }

    function test_firstBandUsesPreviousPrint() public {
        _arm(IPrintOracle.PrintKind.Close, 100e18);
        vm.warp(block.timestamp + 100);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        _session(NEXT, uint64(block.timestamp + 1 days), uint64(block.timestamp + 2 days));
        vm.prank(r1);
        vm.expectRevert(PrintOracle.Deviation.selector);
        oracle.submit(TICKER, NEXT, IPrintOracle.PrintKind.Close, 130e18);
        vm.prank(r1);
        oracle.submit(TICKER, NEXT, IPrintOracle.PrintKind.Close, 120e18);
    }

    function test_disputeUpheldVoidsAndRefunds() public {
        _arm(IPrintOracle.PrintKind.Close, 120e18);
        uint256 before = address(this).balance;
        oracle.dispute{value: BOND}(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        vm.prank(address(this));
        vm.expectRevert(PrintOracle.NotCouncil.selector);
        oracle.resolveDispute(TICKER, SESSION, IPrintOracle.PrintKind.Close, true);
        vm.prank(council);
        oracle.resolveDispute(TICKER, SESSION, IPrintOracle.PrintKind.Close, true);
        assertEq(address(this).balance, before);
        (, bool ok) = oracle.printOf(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        assertFalse(ok);
        vm.warp(block.timestamp + 100);
        vm.expectRevert(PrintOracle.Closed.selector);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Close);
    }

    function test_failedDisputeSlashesBond() public {
        _arm(IPrintOracle.PrintKind.Open, 100e18);
        oracle.dispute{value: BOND}(TICKER, SESSION, IPrintOracle.PrintKind.Open);
        vm.expectRevert(PrintOracle.AlreadyDisputed.selector);
        oracle.dispute{value: BOND}(TICKER, SESSION, IPrintOracle.PrintKind.Open);
        uint256 sinkBefore = feeSink.balance;
        vm.prank(council);
        oracle.resolveDispute(TICKER, SESSION, IPrintOracle.PrintKind.Open, false);
        assertEq(feeSink.balance - sinkBefore, BOND);
        vm.warp(block.timestamp + 100);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Open);
        (uint256 price, bool ok) = oracle.printOf(TICKER, SESSION, IPrintOracle.PrintKind.Open);
        assertTrue(ok);
        assertEq(price, 100e18);
    }

    function test_abandonedDisputeBlocksFinalize() public {
        (bytes32 id,,) = factory.createMarket(TICKER, SESSION, K10, K10, address(usdc));
        _arm(IPrintOracle.PrintKind.Close, 100e18);
        _arm(IPrintOracle.PrintKind.Open, 100e18);
        oracle.dispute{value: BOND}(TICKER, SESSION, IPrintOracle.PrintKind.Open);
        vm.warp(block.timestamp + 3 days);
        settlement.halt(id);
        vm.expectRevert(PrintOracle.DisputeOpen.selector);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Open);
        vm.expectRevert(SettlementEngine.PrintsMissing.selector);
        settlement.finalize(id);
        vm.warp(block.timestamp + 1 days);
        settlement.fallbackFinalize(id);
        (uint256 sUp, ISettlement.State state) = settlement.settlementOf(id);
        assertEq(uint256(state), uint256(ISettlement.State.FallbackFinalized));
        assertEq(sUp, 5e17);
    }

    function test_delistForcesNeutralDespitePrints() public {
        (bytes32 id,,) = factory.createMarket(TICKER, SESSION, K10, K10, address(usdc));
        vm.warp(block.timestamp + 1 days);
        corp.scheduleDelist(TICKER, SESSION);
        vm.warp(block.timestamp + 1);
        corp.executeDelist(TICKER, SESSION);
        _arm(IPrintOracle.PrintKind.Close, 100e18);
        _arm(IPrintOracle.PrintKind.Open, 110e18);
        vm.warp(block.timestamp + 100);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Open);
        vm.warp(block.timestamp + 2 days);
        settlement.halt(id);
        settlement.finalize(id);
        (uint256 sUp, ISettlement.State state) = settlement.settlementOf(id);
        assertEq(uint256(state), uint256(ISettlement.State.FallbackFinalized));
        assertEq(sUp, 5e17);
    }

    function test_noAuctionUsesSuccessorOpen() public {
        uint64 closeTs = uint64(block.timestamp + 1 days);
        uint64 openTs = uint64(block.timestamp + 3 days);
        _session(NEXT, openTs, uint64(block.timestamp + 5 days));
        sessions.setSuccessor(SESSION, NEXT);
        (bytes32 id,,) = factory.createMarket(TICKER, SESSION, K10, K10, address(usdc));
        _arm(IPrintOracle.PrintKind.Close, 100e18);
        _submitTo(NEXT, r1, IPrintOracle.PrintKind.Open, 110e18);
        _submitTo(NEXT, r2, IPrintOracle.PrintKind.Open, 110e18);
        _submitTo(NEXT, r3, IPrintOracle.PrintKind.Open, 110e18);
        vm.warp(block.timestamp + 100);
        oracle.finalizePrint(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        oracle.finalizePrint(TICKER, NEXT, IPrintOracle.PrintKind.Open);
        vm.warp(openTs);
        sessions.declareNoAuction(SESSION);
        settlement.halt(id);
        settlement.finalize(id);
        (uint256 sUp,) = settlement.settlementOf(id);
        assertEq(sUp, 1e18);
        assertTrue(closeTs < openTs);
    }

    function test_reportersFreezeOnFirstSubmit() public {
        _submit(r1, IPrintOracle.PrintKind.Close, 100e18);
        vm.expectRevert(PrintOracle.Locked.selector);
        oracle.addReporter(makeAddr("r4"));
    }

    function _session(uint64 id, uint64 closeTs, uint64 openTs) internal {
        sessions.createSession(
            id,
            ISessionRegistry.Session({
                exchange: XNYS,
                closeTs: closeTs,
                openTs: openTs,
                fallbackDeadline: openTs + 1 days,
                printBandSecs: 1800,
                active: true
            })
        );
    }

    function _submit(address reporter, IPrintOracle.PrintKind kind, uint256 price) internal {
        _submitTo(SESSION, reporter, kind, price);
    }

    function _submitTo(
        uint64 sessionId,
        address reporter,
        IPrintOracle.PrintKind kind,
        uint256 price
    ) internal {
        vm.prank(reporter);
        oracle.submit(TICKER, sessionId, kind, price);
    }

    function _arm(IPrintOracle.PrintKind kind, uint256 price) internal {
        _submit(r1, kind, price);
        _submit(r2, kind, price);
        _submit(r3, kind, price);
    }
}
