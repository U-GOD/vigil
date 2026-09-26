// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ClosureMath} from "../libs/ClosureMath.sol";
import {ClosureNote} from "../core/ClosureNote.sol";
import {ClosureVault} from "../core/ClosureVault.sol";

/// @notice Allowlisted entry the Agent Wallet plugin calls for issuance and redemption.
/// @dev Per-session and per-account notional caps are enforced here. Kuru orders stay on
///      the user's AccountCore; this contract does not place them and does not grant
///      withdraw rights. Note transfers revert while a market is halted, so burn and
///      redeem through this adapter are only possible when the notes can move.
contract PolicyAdapter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error Amount();
    error MarketNotAllowed();
    error MarketMissing();
    error Cap();
    error FeeOnTransfer();

    struct Listing {
        bool allowed;
        uint64 sessionId;
    }

    ClosureVault public immutable vault;

    uint256 public windowNotionalCap;
    uint256 public accountNotionalCap;

    mapping(bytes32 => Listing) public listings;
    mapping(uint64 => uint256) public windowUsed;
    mapping(address => mapping(uint64 => uint256)) public accountUsed;

    event MarketAllowed(bytes32 indexed marketId, uint64 sessionId, bool allowed);
    event CapsSet(uint256 windowNotionalCap, uint256 accountNotionalCap);
    event NotionalReserved(
        address indexed account, bytes32 indexed marketId, uint64 sessionId, uint256 notional
    );
    event ProtectionAuthorized(address indexed account, bytes32 indexed marketId, uint256 notional);

    constructor(
        ClosureVault vault_,
        address owner_,
        uint256 windowNotionalCap_,
        uint256 accountNotionalCap_
    ) Ownable(owner_) {
        if (address(vault_) == address(0) || owner_ == address(0)) revert ZeroAddress();
        vault = vault_;
        windowNotionalCap = windowNotionalCap_;
        accountNotionalCap = accountNotionalCap_;
    }

    function setCaps(uint256 windowNotionalCap_, uint256 accountNotionalCap_) external onlyOwner {
        windowNotionalCap = windowNotionalCap_;
        accountNotionalCap = accountNotionalCap_;
        emit CapsSet(windowNotionalCap_, accountNotionalCap_);
    }

    function allowMarket(bytes32 marketId, uint64 sessionId, bool on) external onlyOwner {
        if (on && sessionId == 0) revert Amount();
        listings[marketId] =
            Listing({allowed: on, sessionId: on ? sessionId : listings[marketId].sessionId});
        emit MarketAllowed(marketId, listings[marketId].sessionId, on);
    }

    /// @notice Pull collateral, reserve notional, and mint both legs to `to`.
    function mintPair(bytes32 marketId, uint256 pairs, address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint64 sessionId = _reserve(marketId, pairs);
        (,, IERC20 collateral) = _legs(marketId);
        (uint256 requiredIn,) = ClosureMath.mintIn(pairs, vault.mintFeeBps());
        _pull(collateral, requiredIn);
        collateral.forceApprove(address(vault), requiredIn);
        vault.mintPair(marketId, pairs, to);
        emit NotionalReserved(msg.sender, marketId, sessionId, pairs);
    }

    /// @notice Reserve the quote notional of a protection buy. The order itself is separate.
    function buyProtection(bytes32 marketId, uint256 notional) external nonReentrant {
        uint64 sessionId = _reserve(marketId, notional);
        emit NotionalReserved(msg.sender, marketId, sessionId, notional);
        emit ProtectionAuthorized(msg.sender, marketId, notional);
    }

    function burnPair(bytes32 marketId, uint256 pairs, address to) external nonReentrant {
        if (to == address(0) || pairs == 0) revert Amount();
        (ClosureNote noteUp, ClosureNote noteDn,) = _legs(marketId);
        _pull(noteUp, pairs);
        _pull(noteDn, pairs);
        vault.burnPair(marketId, pairs, to);
    }

    function redeem(
        bytes32 marketId,
        uint256 upAmt,
        uint256 dnAmt,
        address to
    ) external nonReentrant {
        if (to == address(0) || (upAmt == 0 && dnAmt == 0)) revert Amount();
        (ClosureNote noteUp, ClosureNote noteDn,) = _legs(marketId);
        if (upAmt != 0) _pull(noteUp, upAmt);
        if (dnAmt != 0) _pull(noteDn, dnAmt);
        vault.redeem(marketId, upAmt, dnAmt, to);
    }

    function _reserve(bytes32 marketId, uint256 notional) internal returns (uint64 sessionId) {
        Listing memory listing = listings[marketId];
        if (!listing.allowed) revert MarketNotAllowed();
        if (notional == 0) revert Amount();
        sessionId = listing.sessionId;
        uint256 nextWindow = windowUsed[sessionId] + notional;
        uint256 nextAccount = accountUsed[msg.sender][sessionId] + notional;
        if (nextWindow > windowNotionalCap || nextAccount > accountNotionalCap) revert Cap();
        windowUsed[sessionId] = nextWindow;
        accountUsed[msg.sender][sessionId] = nextAccount;
    }

    function _legs(
        bytes32 marketId
    ) internal view returns (ClosureNote noteUp, ClosureNote noteDn, IERC20 collateral) {
        (noteUp, noteDn, collateral,,,) = vault.markets(marketId);
        if (address(noteUp) == address(0) || address(collateral) == address(0)) {
            revert MarketMissing();
        }
    }

    function _pull(IERC20 token, uint256 amount) internal {
        uint256 beforeBal = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        if (token.balanceOf(address(this)) - beforeBal != amount) revert FeeOnTransfer();
    }
}
