// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISettlement} from "../interfaces/ISettlement.sol";
import {ISessionRegistry} from "../interfaces/ISessionRegistry.sol";
import {IPrintOracle} from "../interfaces/IPrintOracle.sol";
import {ICorporateActionRegistry} from "../interfaces/ICorporateActionRegistry.sol";
import {IBondRefund} from "../interfaces/IBondRefund.sol";
import {ClosureMath} from "../libs/ClosureMath.sol";

contract SettlementEngine is ISettlement, Ownable {
    error NotFactory();
    error MarketExists();
    error MarketMissing();
    error TooEarly();
    error WrongState();
    error PrintsMissing();
    error ZeroAddress();
    error AlreadySet();

    struct Market {
        bytes32 ticker;
        uint64 sessionId;
        uint64 kUp;
        uint64 kDn;
        uint256 sUp;
        State state;
    }

    ISessionRegistry public immutable sessions;
    IPrintOracle public immutable oracle;
    ICorporateActionRegistry public immutable corpActions;
    address public factory;
    IBondRefund public bondRefund;

    mapping(bytes32 => Market) private _markets;

    event FactorySet(address factory);
    event MarketRegistered(
        bytes32 indexed marketId, bytes32 ticker, uint64 sessionId, uint64 kUp, uint64 kDn
    );
    event Halted(bytes32 indexed marketId);
    event Finalized(bytes32 indexed marketId, uint256 sUp, bool fallbackSettle);

    constructor(
        address owner_,
        ISessionRegistry sessions_,
        IPrintOracle oracle_,
        ICorporateActionRegistry corpActions_
    ) Ownable(owner_) {
        if (
            address(sessions_) == address(0) || address(oracle_) == address(0)
                || address(corpActions_) == address(0)
        ) {
            revert ZeroAddress();
        }
        sessions = sessions_;
        oracle = oracle_;
        corpActions = corpActions_;
    }

    function setFactory(address factory_, IBondRefund bondRefund_) external onlyOwner {
        if (factory_ == address(0)) revert ZeroAddress();
        if (factory != address(0)) revert AlreadySet();
        factory = factory_;
        bondRefund = bondRefund_;
        emit FactorySet(factory_);
    }

    function registerMarket(
        bytes32 marketId,
        bytes32 ticker,
        uint64 sessionId,
        uint64 kUp,
        uint64 kDn
    ) external {
        if (msg.sender != factory) revert NotFactory();
        Market storage m = _markets[marketId];
        if (m.state != State.Unset) revert MarketExists();
        m.ticker = ticker;
        m.sessionId = sessionId;
        m.kUp = kUp;
        m.kDn = kDn;
        m.state = State.Trading;
        emit MarketRegistered(marketId, ticker, sessionId, kUp, kDn);
    }

    function halt(
        bytes32 marketId
    ) external {
        Market storage m = _market(marketId);
        if (m.state != State.Trading) revert WrongState();
        ISessionRegistry.Session memory session = sessions.sessionOf(m.sessionId);
        if (block.timestamp < session.openTs) revert TooEarly();
        m.state = State.Halted;
        emit Halted(marketId);
    }

    function finalize(
        bytes32 marketId
    ) external {
        _finalize(marketId);
    }

    function fallbackFinalize(
        bytes32 marketId
    ) external {
        Market storage m = _market(marketId);
        if (m.state != State.Halted && m.state != State.Trading) revert WrongState();
        ISessionRegistry.Session memory session = sessions.sessionOf(m.sessionId);
        if (block.timestamp < session.fallbackDeadline) revert TooEarly();
        m.sUp = ClosureMath.neutralSplit(m.kUp, m.kDn);
        m.state = State.FallbackFinalized;
        if (address(bondRefund) != address(0)) bondRefund.onSettled(marketId);
        emit Finalized(marketId, m.sUp, true);
    }

    function finalizeBatch(
        bytes32[] calldata marketIds
    ) external {
        uint256 n = marketIds.length;
        for (uint256 i = 0; i < n; ++i) {
            _finalize(marketIds[i]);
        }
    }

    function _finalize(
        bytes32 marketId
    ) internal {
        Market storage m = _market(marketId);
        if (m.state != State.Halted) revert WrongState();

        (uint256 pClose, bool closeOk) =
            oracle.printOf(m.ticker, m.sessionId, IPrintOracle.PrintKind.Close);
        (uint256 pOpen, bool openOk) =
            oracle.printOf(m.ticker, m.sessionId, IPrintOracle.PrintKind.Open);
        if (!closeOk || !openOk) revert PrintsMissing();

        uint256 adj = corpActions.adjOf(m.ticker, m.sessionId);
        m.sUp = ClosureMath.splitUp(pClose, pOpen, adj, m.kUp, m.kDn);
        m.state = State.Finalized;
        if (address(bondRefund) != address(0)) bondRefund.onSettled(marketId);
        emit Finalized(marketId, m.sUp, false);
    }

    function isHalted(
        bytes32 marketId
    ) external view returns (bool) {
        return _markets[marketId].state == State.Halted;
    }

    function stateOf(
        bytes32 marketId
    ) external view returns (State) {
        return _markets[marketId].state;
    }

    function settlementOf(
        bytes32 marketId
    ) external view returns (uint256 sUp, State state) {
        Market storage m = _markets[marketId];
        if (m.state == State.Unset) revert MarketMissing();
        return (m.sUp, m.state);
    }

    function termsOf(
        bytes32 marketId
    )
        external
        view
        returns (bytes32 ticker, uint64 sessionId, uint64 kUp, uint64 kDn, State state)
    {
        Market storage m = _markets[marketId];
        if (m.state == State.Unset) revert MarketMissing();
        return (m.ticker, m.sessionId, m.kUp, m.kDn, m.state);
    }

    function _market(
        bytes32 marketId
    ) internal view returns (Market storage m) {
        m = _markets[marketId];
        if (m.state == State.Unset) revert MarketMissing();
    }
}
