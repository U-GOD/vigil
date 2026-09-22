// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ClosureNote} from "./ClosureNote.sol";
import {ClosureMath} from "../libs/ClosureMath.sol";
import {ISettlement} from "../interfaces/ISettlement.sol";
import {IClosureVault} from "../interfaces/IClosureVault.sol";

contract ClosureVault is IClosureVault, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    error NotFactory();
    error MarketExists();
    error MarketMissing();
    error WrongDecimals();
    error NotTrading();
    error NotFinalized();
    error FeeOnTransfer();
    error DustRemaining();
    error ZeroAddress();
    error AlreadySet();

    struct Market {
        ClosureNote noteUp;
        ClosureNote noteDn;
        IERC20 collateral;
        uint256 collateralHeld;
        uint256 cumulativeMinted;
        bool registered;
    }

    ISettlement public immutable settlement;
    address public factory;
    address public feeSink;
    uint16 public mintFeeBps;

    mapping(bytes32 => Market) public markets;

    event FactorySet(address factory);
    event FeeSinkSet(address feeSink);
    event MintFeeSet(uint16 mintFeeBps);
    event MarketRegistered(
        bytes32 indexed marketId, address noteUp, address noteDn, address collateral
    );
    event Minted(
        bytes32 indexed marketId, address indexed to, uint256 pairs, uint256 paid, uint256 fee
    );
    event Burned(bytes32 indexed marketId, address indexed from, uint256 pairs);
    event Redeemed(
        bytes32 indexed marketId, address indexed to, uint256 upAmt, uint256 dnAmt, uint256 payout
    );
    event DustSwept(bytes32 indexed marketId, uint256 amount);

    constructor(
        address owner_,
        ISettlement settlement_,
        address feeSink_,
        uint16 mintFeeBps_
    ) Ownable(owner_) {
        if (address(settlement_) == address(0) || feeSink_ == address(0)) revert ZeroAddress();
        settlement = settlement_;
        feeSink = feeSink_;
        mintFeeBps = mintFeeBps_;
    }

    function setFactory(
        address factory_
    ) external onlyOwner {
        if (factory_ == address(0)) revert ZeroAddress();
        if (factory != address(0)) revert AlreadySet();
        factory = factory_;
        emit FactorySet(factory_);
    }

    function setFeeSink(
        address feeSink_
    ) external onlyOwner {
        if (feeSink_ == address(0)) revert ZeroAddress();
        feeSink = feeSink_;
        emit FeeSinkSet(feeSink_);
    }

    function registerMarket(
        bytes32 marketId,
        address noteUp,
        address noteDn,
        address collateral
    ) external {
        if (msg.sender != factory) revert NotFactory();
        Market storage m = markets[marketId];
        if (m.registered) revert MarketExists();
        if (IERC20Metadata(collateral).decimals() != ClosureMath.NOTE_DECIMALS) {
            revert WrongDecimals();
        }
        m.noteUp = ClosureNote(noteUp);
        m.noteDn = ClosureNote(noteDn);
        m.collateral = IERC20(collateral);
        m.registered = true;
        emit MarketRegistered(marketId, noteUp, noteDn, collateral);
    }

    function mintPair(bytes32 marketId, uint256 pairs, address to) external nonReentrant {
        Market storage m = _market(marketId);
        if (settlement.stateOf(marketId) != ISettlement.State.Trading) revert NotTrading();
        (uint256 requiredIn, uint256 backing) = ClosureMath.mintIn(pairs, mintFeeBps);

        uint256 before = m.collateral.balanceOf(address(this));
        m.collateral.safeTransferFrom(msg.sender, address(this), requiredIn);
        uint256 got = m.collateral.balanceOf(address(this)) - before;
        if (got != requiredIn) revert FeeOnTransfer();

        uint256 fee = requiredIn - backing;
        m.collateralHeld += backing;
        m.cumulativeMinted += pairs;
        if (fee != 0) m.collateral.safeTransfer(feeSink, fee);

        m.noteUp.mint(to, pairs);
        m.noteDn.mint(to, pairs);
        emit Minted(marketId, to, pairs, requiredIn, fee);
    }

    function burnPair(bytes32 marketId, uint256 pairs, address to) external nonReentrant {
        Market storage m = _market(marketId);
        if (pairs == 0) revert ClosureMath.InvalidAmount();
        m.noteUp.burn(msg.sender, pairs);
        m.noteDn.burn(msg.sender, pairs);
        m.collateralHeld -= pairs;
        m.collateral.safeTransfer(to, pairs);
        emit Burned(marketId, msg.sender, pairs);
    }

    function redeem(
        bytes32 marketId,
        uint256 upAmt,
        uint256 dnAmt,
        address to
    ) external nonReentrant {
        Market storage m = _market(marketId);
        (uint256 sUp, ISettlement.State state) = settlement.settlementOf(marketId);
        if (state != ISettlement.State.Finalized && state != ISettlement.State.FallbackFinalized) {
            revert NotFinalized();
        }
        if (upAmt == 0 && dnAmt == 0) revert ClosureMath.InvalidAmount();

        if (upAmt != 0) m.noteUp.burn(msg.sender, upAmt);
        if (dnAmt != 0) m.noteDn.burn(msg.sender, dnAmt);

        uint256 payout = ClosureMath.payoutUp(upAmt, sUp) + ClosureMath.payoutDn(dnAmt, sUp);
        m.collateralHeld -= payout;
        if (payout != 0) m.collateral.safeTransfer(to, payout);
        emit Redeemed(marketId, to, upAmt, dnAmt, payout);
    }

    function sweepDust(
        bytes32 marketId
    ) external nonReentrant {
        Market storage m = _market(marketId);
        (, ISettlement.State state) = settlement.settlementOf(marketId);
        if (state != ISettlement.State.Finalized && state != ISettlement.State.FallbackFinalized) {
            revert NotFinalized();
        }
        if (m.noteUp.totalSupply() != 0 || m.noteDn.totalSupply() != 0) revert DustRemaining();
        uint256 dust = m.collateralHeld;
        m.collateralHeld = 0;
        if (dust != 0) m.collateral.safeTransfer(feeSink, dust);
        emit DustSwept(marketId, dust);
    }

    function cumulativeMinted(
        bytes32 marketId
    ) external view returns (uint256) {
        return markets[marketId].cumulativeMinted;
    }

    function _market(
        bytes32 marketId
    ) internal view returns (Market storage m) {
        m = markets[marketId];
        if (!m.registered) revert MarketMissing();
    }
}
