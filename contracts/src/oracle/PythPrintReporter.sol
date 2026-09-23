// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPyth} from "../interfaces/IPyth.sol";
import {IPrintOracle} from "../interfaces/IPrintOracle.sol";
import {ISessionRegistry} from "../interfaces/ISessionRegistry.sol";
import {PrintOracle} from "./PrintOracle.sol";

/// @notice Permissionless path from a Pyth pull update into PrintOracle.
/// Publish time must sit inside the session's print band. The feed id is the
/// Equity.US session feed, not the 24/7 index feed.
contract PythPrintReporter is Ownable {
    error FeedUnset();
    error FeedAlreadySet();
    error FeeShort();
    error InvalidPrice();
    error BadExpo();
    error OutOfBand();
    error RefundFailed();
    error ZeroAddress();

    PrintOracle public immutable oracle;
    IPyth public immutable pyth;
    ISessionRegistry public immutable sessions;

    mapping(bytes32 ticker => bytes32 feed) public feedOf;

    event FeedSet(bytes32 indexed ticker, bytes32 feed);
    event Reported(
        bytes32 indexed ticker, uint64 sessionId, IPrintOracle.PrintKind kind, uint256 price
    );

    constructor(
        address owner_,
        PrintOracle oracle_,
        IPyth pyth_,
        ISessionRegistry sessions_
    ) Ownable(owner_) {
        if (
            address(oracle_) == address(0) || address(pyth_) == address(0)
                || address(sessions_) == address(0)
        ) {
            revert ZeroAddress();
        }
        oracle = oracle_;
        pyth = pyth_;
        sessions = sessions_;
    }

    function setFeed(bytes32 ticker, bytes32 feed) external onlyOwner {
        if (feed == bytes32(0) || feedOf[ticker] != bytes32(0)) revert FeedAlreadySet();
        feedOf[ticker] = feed;
        emit FeedSet(ticker, feed);
    }

    function report(
        bytes32 ticker,
        uint64 sessionId,
        IPrintOracle.PrintKind kind,
        bytes[] calldata updateData
    ) external payable {
        bytes32 feed = feedOf[ticker];
        if (feed == bytes32(0)) revert FeedUnset();

        uint256 fee = pyth.getUpdateFee(updateData);
        if (msg.value < fee) revert FeeShort();
        pyth.updatePriceFeeds{value: fee}(updateData);

        IPyth.Price memory got = pyth.getPriceUnsafe(feed);
        uint256 wad = _toWad(got.price, got.expo);
        _checkBand(sessionId, kind, got.publishTime);
        oracle.submit(ticker, sessionId, kind, wad);

        uint256 refund = msg.value - fee;
        if (refund != 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }
        emit Reported(ticker, sessionId, kind, wad);
    }

    function _checkBand(
        uint64 sessionId,
        IPrintOracle.PrintKind kind,
        uint256 publishTime
    ) internal view {
        ISessionRegistry.Session memory session = sessions.sessionOf(sessionId);
        uint256 center = kind == IPrintOracle.PrintKind.Close ? session.closeTs : session.openTs;
        uint256 band = session.printBandSecs;
        if (publishTime < center) {
            if (center - publishTime > band) revert OutOfBand();
        } else if (publishTime - center > band) {
            revert OutOfBand();
        }
    }

    function _toWad(int64 price, int32 expo) internal pure returns (uint256) {
        if (price <= 0) revert InvalidPrice();
        if (expo < -18 || expo > 12) revert BadExpo();
        uint256 scale = 10 ** uint256(int256(expo) + 18);
        return Math.mulDiv(uint256(uint64(price)), scale, 1);
    }
}
