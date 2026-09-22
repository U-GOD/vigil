// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ClosureNote} from "./ClosureNote.sol";
import {ClosureMath} from "../libs/ClosureMath.sol";
import {ISessionRegistry} from "../interfaces/ISessionRegistry.sol";
import {IClosureVault} from "../interfaces/IClosureVault.sol";
import {IBondRefund} from "../interfaces/IBondRefund.sol";

interface ISettlementRegistrar {
    function registerMarket(
        bytes32 marketId,
        bytes32 ticker,
        uint64 sessionId,
        uint64 kUp,
        uint64 kDn
    ) external;
}

contract ClosureMarketFactory is Ownable, IBondRefund {
    error SessionNotOpen();
    error TierDenied();
    error WrongBond();
    error MarketExists();
    error NotSettlement();
    error BondMissing();
    error StillLive();
    error MarketTraded();
    error ZeroAddress();
    error WrongDecimals();

    struct Bond {
        address creator;
        uint64 sessionId;
        uint96 amount;
        bool refunded;
    }

    ISessionRegistry public immutable sessions;
    IClosureVault public immutable vault;
    ISettlementRegistrar public immutable settlement;
    address public feeSink;
    uint96 public creationBond;

    mapping(uint64 kUp => mapping(uint64 kDn => bool allowed)) public tierAllowed;
    mapping(bytes32 => address) public noteUpOf;
    mapping(bytes32 => address) public noteDnOf;
    mapping(bytes32 => Bond) public bonds;

    event TierSet(uint64 kUp, uint64 kDn, bool allowed);
    event CreationBondSet(uint96 amount);
    event MarketCreated(
        bytes32 indexed marketId,
        bytes32 ticker,
        uint64 sessionId,
        uint64 kUp,
        uint64 kDn,
        address collateral,
        address noteUp,
        address noteDn,
        address creator
    );
    event BondRefunded(bytes32 indexed marketId, address creator, uint96 amount);
    event BondForfeited(bytes32 indexed marketId, address creator, uint96 amount);

    constructor(
        address owner_,
        ISessionRegistry sessions_,
        IClosureVault vault_,
        ISettlementRegistrar settlement_,
        address feeSink_,
        uint96 creationBond_
    ) Ownable(owner_) {
        if (
            address(sessions_) == address(0) || address(vault_) == address(0)
                || address(settlement_) == address(0) || feeSink_ == address(0)
        ) revert ZeroAddress();
        sessions = sessions_;
        vault = vault_;
        settlement = settlement_;
        feeSink = feeSink_;
        creationBond = creationBond_;
    }

    function setTier(uint64 kUp, uint64 kDn, bool allowed) external onlyOwner {
        if (kUp > ClosureMath.MAX_CAP || kDn > ClosureMath.MAX_CAP || kUp + kDn == 0) {
            revert ClosureMath.InvalidCap();
        }
        tierAllowed[kUp][kDn] = allowed;
        emit TierSet(kUp, kDn, allowed);
    }

    function setCreationBond(
        uint96 amount
    ) external onlyOwner {
        creationBond = amount;
        emit CreationBondSet(amount);
    }

    function createMarket(
        bytes32 ticker,
        uint64 sessionId,
        uint64 kUp,
        uint64 kDn,
        address collateral
    ) external payable returns (bytes32 id, address noteUp, address noteDn) {
        if (msg.value != creationBond) revert WrongBond();
        if (!tierAllowed[kUp][kDn]) revert TierDenied();
        if (!sessions.exists(sessionId)) revert SessionNotOpen();
        ISessionRegistry.Session memory session = sessions.sessionOf(sessionId);
        if (!session.active || block.timestamp >= session.closeTs) revert SessionNotOpen();
        if (IERC20Metadata(collateral).decimals() != ClosureMath.NOTE_DECIMALS) {
            revert WrongDecimals();
        }

        id = ClosureMath.marketId(ticker, sessionId, kUp, kDn, collateral);
        if (noteUpOf[id] != address(0)) revert MarketExists();

        noteUp = _deployNote(id, true);
        noteDn = _deployNote(id, false);
        noteUpOf[id] = noteUp;
        noteDnOf[id] = noteDn;
        if (creationBond != 0) {
            bonds[id] = Bond({
                creator: msg.sender,
                sessionId: sessionId,
                amount: creationBond,
                refunded: false
            });
        }

        vault.registerMarket(id, noteUp, noteDn, collateral);
        settlement.registerMarket(id, ticker, sessionId, kUp, kDn);
        emit MarketCreated(id, ticker, sessionId, kUp, kDn, collateral, noteUp, noteDn, msg.sender);
    }

    function predictNotes(
        bytes32 ticker,
        uint64 sessionId,
        uint64 kUp,
        uint64 kDn,
        address collateral
    ) external view returns (bytes32 id, address noteUp, address noteDn) {
        id = ClosureMath.marketId(ticker, sessionId, kUp, kDn, collateral);
        noteUp = _predictNote(id, true);
        noteDn = _predictNote(id, false);
    }

    function onSettled(
        bytes32 marketId
    ) external {
        if (msg.sender != address(settlement)) revert NotSettlement();
        Bond storage b = bonds[marketId];
        if (b.amount == 0 || b.refunded) return;
        b.refunded = true;
        (bool ok,) = b.creator.call{value: b.amount}("");
        if (!ok) revert WrongBond();
        emit BondRefunded(marketId, b.creator, b.amount);
    }

    function forfeitBond(
        bytes32 marketId
    ) external {
        Bond storage b = bonds[marketId];
        if (b.amount == 0 || b.refunded) revert BondMissing();
        if (vault.cumulativeMinted(marketId) != 0) revert MarketTraded();
        ISessionRegistry.Session memory session = sessions.sessionOf(b.sessionId);
        if (block.timestamp < session.fallbackDeadline) revert StillLive();
        b.refunded = true;
        (bool ok,) = feeSink.call{value: b.amount}("");
        if (!ok) revert WrongBond();
        emit BondForfeited(marketId, b.creator, b.amount);
    }

    function _deployNote(bytes32 id, bool up) internal returns (address note) {
        bytes32 salt = keccak256(abi.encode(id, up));
        note = address(
            new ClosureNote{salt: salt}(
                up ? "Vigil Closure UP" : "Vigil Closure DN",
                up ? "CN-UP" : "CN-DN",
                address(vault),
                address(settlement),
                id
            )
        );
    }

    function _predictNote(bytes32 id, bool up) internal view returns (address) {
        bytes32 salt = keccak256(abi.encode(id, up));
        bytes memory init = abi.encodePacked(
            type(ClosureNote).creationCode,
            abi.encode(
                up ? "Vigil Closure UP" : "Vigil Closure DN",
                up ? "CN-UP" : "CN-DN",
                address(vault),
                address(settlement),
                id
            )
        );
        return address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(init)))
                )
            )
        );
    }
}
