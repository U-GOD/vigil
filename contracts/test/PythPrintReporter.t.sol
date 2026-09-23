// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SessionRegistry} from "../src/registry/SessionRegistry.sol";
import {PrintOracle} from "../src/oracle/PrintOracle.sol";
import {PythPrintReporter} from "../src/oracle/PythPrintReporter.sol";
import {MockPyth} from "./helpers/MockPyth.sol";
import {ISessionRegistry} from "../src/interfaces/ISessionRegistry.sol";
import {IPrintOracle} from "../src/interfaces/IPrintOracle.sol";

contract PythPrintReporterTest is Test {
    uint64 internal constant SESSION = 1;
    bytes32 internal constant TICKER = keccak256("NVDA");
    bytes32 internal constant FEED =
        0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593;

    SessionRegistry internal sessions;
    PrintOracle internal oracle;
    PythPrintReporter internal reporter;
    MockPyth internal pyth;
    uint64 internal closeTs;
    address internal r2 = makeAddr("r2");
    address internal r3 = makeAddr("r3");

    receive() external payable {}

    function setUp() public {
        closeTs = uint64(block.timestamp + 1 days);
        sessions = new SessionRegistry(address(this));
        oracle = new PrintOracle(
            address(this), makeAddr("council"), makeAddr("sink"), sessions, 500, 2000, 3, 1 ether
        );
        oracle.setDisputeWindow(keccak256("XNYS"), 100);
        pyth = new MockPyth();
        reporter = new PythPrintReporter(address(this), oracle, pyth, sessions);
        oracle.setPythReporter(address(reporter));
        oracle.addReporter(r2);
        oracle.addReporter(r3);
        reporter.setFeed(TICKER, FEED);
        sessions.createSession(
            SESSION,
            ISessionRegistry.Session({
                exchange: keccak256("XNYS"),
                closeTs: closeTs,
                openTs: closeTs + 2 days,
                fallbackDeadline: closeTs + 3 days,
                printBandSecs: 1800,
                active: true
            })
        );
    }

    function test_pythReporterIsSlotZero() public view {
        assertEq(oracle.reporterAt(0), address(reporter));
        assertEq(oracle.pythReporter(), address(reporter));
    }

    function test_inBandReportJoinsMedian() public {
        pyth.setPrice(10_000_000_000, -8, closeTs);
        bytes[] memory update = new bytes[](1);
        vm.deal(address(this), 150);
        reporter.report{value: 150}(TICKER, SESSION, IPrintOracle.PrintKind.Close, update);
        assertEq(address(this).balance, 50);
        vm.prank(r2);
        oracle.submit(TICKER, SESSION, IPrintOracle.PrintKind.Close, 100e18);
        vm.prank(r3);
        oracle.submit(TICKER, SESSION, IPrintOracle.PrintKind.Close, 100e18);
        (uint256 candidate, uint8 count,,,,) =
            oracle.statusOf(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        assertEq(count, 3);
        assertEq(candidate, 100e18);
    }

    function test_outOfBandReverts() public {
        pyth.setPrice(10_000_000_000, -8, uint256(closeTs) + 1801);
        bytes[] memory update = new bytes[](1);
        vm.deal(address(this), 100);
        vm.expectRevert(PythPrintReporter.OutOfBand.selector);
        reporter.report{value: 100}(TICKER, SESSION, IPrintOracle.PrintKind.Close, update);
        (, uint8 count,,,,) = oracle.statusOf(TICKER, SESSION, IPrintOracle.PrintKind.Close);
        assertEq(count, 0);
    }

    function test_bandEdges() public {
        bytes[] memory update = new bytes[](1);
        vm.deal(address(this), 200);
        pyth.setPrice(10_000_000_000, -8, uint256(closeTs) - 1800);
        reporter.report{value: 100}(TICKER, SESSION, IPrintOracle.PrintKind.Close, update);
        pyth.setPrice(10_000_000_000, -8, uint256(closeTs) + 2 days + 1800);
        reporter.report{value: 100}(TICKER, SESSION, IPrintOracle.PrintKind.Open, update);
    }

    function test_negativePriceAndBadExpo() public {
        bytes[] memory update = new bytes[](1);
        vm.deal(address(this), 100);
        pyth.setPrice(-1, -8, closeTs);
        vm.expectRevert(PythPrintReporter.InvalidPrice.selector);
        reporter.report{value: 100}(TICKER, SESSION, IPrintOracle.PrintKind.Close, update);
        pyth.setPrice(1, 13, closeTs);
        vm.expectRevert(PythPrintReporter.BadExpo.selector);
        reporter.report{value: 100}(TICKER, SESSION, IPrintOracle.PrintKind.Close, update);
    }

    function test_feeShortAndUnsetFeed() public {
        bytes[] memory update = new bytes[](1);
        vm.expectRevert(PythPrintReporter.FeeShort.selector);
        reporter.report{value: 1}(TICKER, SESSION, IPrintOracle.PrintKind.Close, update);
        PythPrintReporter other = new PythPrintReporter(address(this), oracle, pyth, sessions);
        vm.expectRevert(PythPrintReporter.FeedUnset.selector);
        other.report(TICKER, SESSION, IPrintOracle.PrintKind.Close, update);
    }
}
