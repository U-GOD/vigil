// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPrintOracle} from "../interfaces/IPrintOracle.sol";
import {ISessionRegistry} from "../interfaces/ISessionRegistry.sol";
import {PrintMedian} from "../libs/PrintMedian.sol";

/// @notice Multi-reporter prints. The owner can whitelist reporters and set parameters.
/// No admin function writes a price. A dispute can only void a print.
contract PrintOracle is IPrintOracle, Ownable, ReentrancyGuard {
    error NotReporter();
    error InvalidPrice();
    error Deviation();
    error Duplicate();
    error Closed();
    error DisputeWindow();
    error DisputeOpen();
    error AlreadyDisputed();
    error WrongBond();
    error NoDispute();
    error NotCouncil();
    error Full();
    error Locked();
    error BadQuorum();
    error AlreadySet();
    error ZeroAddress();
    error UnknownSession();
    error WindowUnset();
    error BondTransfer();

    uint8 public constant MAX_REPORTERS = 5;

    struct Print {
        uint256[5] prices;
        address[5] who;
        uint8 count;
        uint256 candidate;
        uint64 disputeDeadline;
        address disputer;
        uint96 bond;
        bool disputed;
        bool finalized;
        bool voided;
    }

    struct Tier {
        uint8 quorum;
        bool locked;
    }

    ISessionRegistry public immutable sessions;
    address public immutable council;
    address public immutable feeSink;
    uint16 public immutable deviationBps;
    uint16 public immutable firstBandBps;
    uint8 public immutable defaultQuorum;
    uint96 public immutable disputeBond;

    address public pythReporter;
    bool public reportersFrozen;

    address[] private _reporters;
    mapping(address => bool) public isReporter;
    mapping(bytes32 exchange => uint64 window) public disputeWindowOf;
    mapping(bytes32 exchange => bool set) private _windowSet;
    mapping(bytes32 ticker => Tier) private _tier;
    mapping(bytes32 ticker => mapping(PrintKind => uint256)) public lastFinal;
    mapping(bytes32 ticker => mapping(uint64 sessionId => mapping(PrintKind => Print))) private
        _prints;

    event ReporterAdded(address indexed reporter);
    event DisputeWindowSet(bytes32 indexed exchange, uint64 window);
    event QuorumSet(bytes32 indexed ticker, uint8 quorum);
    event Submitted(
        bytes32 indexed ticker, uint64 sessionId, PrintKind kind, address reporter, uint256 price
    );
    event QuorumReached(
        bytes32 indexed ticker, uint64 sessionId, PrintKind kind, uint256 candidate, uint64 deadline
    );
    event Disputed(bytes32 indexed ticker, uint64 sessionId, PrintKind kind, address disputer);
    event DisputeResolved(bytes32 indexed ticker, uint64 sessionId, PrintKind kind, bool upheld);
    event PrintFinalized(bytes32 indexed ticker, uint64 sessionId, PrintKind kind, uint256 price);

    constructor(
        address owner_,
        address council_,
        address feeSink_,
        ISessionRegistry sessions_,
        uint16 deviationBps_,
        uint16 firstBandBps_,
        uint8 defaultQuorum_,
        uint96 disputeBond_
    ) Ownable(owner_) {
        if (
            council_ == address(0) || feeSink_ == address(0) || address(sessions_) == address(0)
                || disputeBond_ == 0 || defaultQuorum_ == 0 || defaultQuorum_ > MAX_REPORTERS
        ) revert ZeroAddress();
        council = council_;
        feeSink = feeSink_;
        sessions = sessions_;
        deviationBps = deviationBps_;
        firstBandBps = firstBandBps_;
        defaultQuorum = defaultQuorum_;
        disputeBond = disputeBond_;
    }

    function setPythReporter(
        address reporter
    ) external onlyOwner {
        if (pythReporter != address(0) || _reporters.length != 0) revert AlreadySet();
        _addReporter(reporter);
        pythReporter = reporter;
    }

    function addReporter(
        address reporter
    ) external onlyOwner {
        _addReporter(reporter);
    }

    function setDisputeWindow(bytes32 exchange, uint64 window) external onlyOwner {
        if (_windowSet[exchange] || window == 0) revert AlreadySet();
        _windowSet[exchange] = true;
        disputeWindowOf[exchange] = window;
        emit DisputeWindowSet(exchange, window);
    }

    function setQuorum(bytes32 ticker, uint8 quorum_) external onlyOwner {
        Tier storage tier = _tier[ticker];
        if (tier.locked) revert Locked();
        if (quorum_ == 0 || quorum_ > MAX_REPORTERS) revert BadQuorum();
        tier.quorum = quorum_;
        emit QuorumSet(ticker, quorum_);
    }

    function submit(bytes32 ticker, uint64 sessionId, PrintKind kind, uint256 price) external {
        if (!isReporter[msg.sender]) revert NotReporter();
        if (price == 0) revert InvalidPrice();
        if (!sessions.exists(sessionId)) revert UnknownSession();

        Print storage print = _prints[ticker][sessionId][kind];
        if (print.finalized || print.voided || print.disputeDeadline != 0) revert Closed();

        uint8 n = print.count;
        for (uint8 i; i < n; ++i) {
            if (print.who[i] == msg.sender) revert Duplicate();
        }
        _checkDeviation(ticker, kind, print, n, price);

        print.prices[n] = price;
        print.who[n] = msg.sender;
        print.count = n + 1;
        emit Submitted(ticker, sessionId, kind, msg.sender, price);
        _maybeQuorum(ticker, sessionId, kind, print);
    }

    function dispute(
        bytes32 ticker,
        uint64 sessionId,
        PrintKind kind
    ) external payable nonReentrant {
        Print storage print = _prints[ticker][sessionId][kind];
        if (print.disputeDeadline == 0 || block.timestamp >= print.disputeDeadline) {
            revert DisputeWindow();
        }
        if (print.disputed || print.finalized || print.voided) revert AlreadyDisputed();
        if (msg.value != disputeBond) revert WrongBond();
        print.disputed = true;
        print.disputer = msg.sender;
        print.bond = uint96(msg.value);
        emit Disputed(ticker, sessionId, kind, msg.sender);
    }

    /// @notice Council may uphold a dispute, which voids the print, or reject it.
    /// It cannot supply a replacement price.
    function resolveDispute(
        bytes32 ticker,
        uint64 sessionId,
        PrintKind kind,
        bool uphold
    ) external nonReentrant {
        if (msg.sender != council) revert NotCouncil();
        Print storage print = _prints[ticker][sessionId][kind];
        if (!print.disputed) revert NoDispute();

        address to = uphold ? print.disputer : feeSink;
        uint256 bond = print.bond;
        print.disputed = false;
        print.disputer = address(0);
        print.bond = 0;
        if (uphold) print.voided = true;

        (bool ok,) = to.call{value: bond}("");
        if (!ok) revert BondTransfer();
        emit DisputeResolved(ticker, sessionId, kind, uphold);
    }

    function finalizePrint(bytes32 ticker, uint64 sessionId, PrintKind kind) external {
        Print storage print = _prints[ticker][sessionId][kind];
        if (print.finalized || print.voided) revert Closed();
        if (print.disputed) revert DisputeOpen();
        if (print.disputeDeadline == 0 || block.timestamp < print.disputeDeadline) {
            revert DisputeWindow();
        }
        print.finalized = true;
        lastFinal[ticker][kind] = print.candidate;
        emit PrintFinalized(ticker, sessionId, kind, print.candidate);
    }

    function printOf(
        bytes32 ticker,
        uint64 sessionId,
        PrintKind kind
    ) external view returns (uint256 price, bool finalized) {
        Print storage print = _prints[ticker][sessionId][kind];
        if (print.finalized && !print.voided) return (print.candidate, true);
        return (0, false);
    }

    function statusOf(
        bytes32 ticker,
        uint64 sessionId,
        PrintKind kind
    )
        external
        view
        returns (
            uint256 candidate,
            uint8 count,
            uint64 disputeDeadline,
            bool disputed,
            bool finalized,
            bool voided
        )
    {
        Print storage print = _prints[ticker][sessionId][kind];
        return (
            print.candidate,
            print.count,
            print.disputeDeadline,
            print.disputed,
            print.finalized,
            print.voided
        );
    }

    function reporterAt(
        uint256 index
    ) external view returns (address) {
        return _reporters[index];
    }

    function reporterCount() external view returns (uint256) {
        return _reporters.length;
    }

    function _addReporter(
        address reporter
    ) internal {
        if (reportersFrozen) revert Locked();
        if (reporter == address(0) || isReporter[reporter]) revert AlreadySet();
        if (_reporters.length == MAX_REPORTERS) revert Full();
        isReporter[reporter] = true;
        _reporters.push(reporter);
        emit ReporterAdded(reporter);
    }

    function _checkDeviation(
        bytes32 ticker,
        PrintKind kind,
        Print storage print,
        uint8 n,
        uint256 price
    ) internal view {
        if (n == 0) {
            uint256 prev = lastFinal[ticker][kind];
            if (prev != 0 && !_within(price, prev, firstBandBps)) revert Deviation();
            return;
        }
        uint256[5] memory prices = print.prices;
        uint256 mid = PrintMedian.median(prices, n);
        if (!_within(price, mid, deviationBps)) revert Deviation();
    }

    function _maybeQuorum(
        bytes32 ticker,
        uint64 sessionId,
        PrintKind kind,
        Print storage print
    ) internal {
        Tier storage tier = _tier[ticker];
        if (!tier.locked) {
            reportersFrozen = true;
            tier.locked = true;
            if (tier.quorum == 0) tier.quorum = defaultQuorum;
            if (tier.quorum > _reporters.length) revert BadQuorum();
        }
        if (print.count < tier.quorum) return;

        ISessionRegistry.Session memory session = sessions.sessionOf(sessionId);
        uint64 window = disputeWindowOf[session.exchange];
        if (window == 0) revert WindowUnset();
        uint256[5] memory prices = print.prices;
        print.candidate = PrintMedian.median(prices, print.count);
        print.disputeDeadline = uint64(block.timestamp) + window;
        emit QuorumReached(ticker, sessionId, kind, print.candidate, print.disputeDeadline);
    }

    function _within(uint256 price, uint256 anchor, uint256 bps) internal pure returns (bool) {
        uint256 diff = price > anchor ? price - anchor : anchor - price;
        return Math.mulDiv(diff, 10_000, anchor) <= bps;
    }
}
