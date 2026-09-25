// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ClosureVault} from "../core/ClosureVault.sol";

/// @notice ERC-4626 over Closure Note collateral. The keeper mints pairs and sells the protection leg.
/// @dev NAV for the caps is idle cash plus pair cost. A name that gaps to the cap loses
///      `allocated - premium` on that name. The per-ticker cap bounds that loss.
contract UnderwritingVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error NotKeeper();
    error Excluded();
    error Cap();
    error Amount();

    uint16 public constant DEFAULT_TICKER_CAP_BPS = 250;
    uint16 public constant BPS = 10_000;

    ClosureVault public immutable closureVault;
    address public keeper;
    uint16 public tickerCapBps;
    uint16 public aggregateCapBps;

    mapping(bytes32 ticker => bool) public excluded;
    mapping(bytes32 ticker => uint256) public allocated;
    mapping(bytes32 ticker => uint256) public premium;
    uint256 public allocatedTotal;

    event KeeperSet(address keeper);
    event ExcludedSet(bytes32 indexed ticker, bool excluded);
    event Allocated(bytes32 indexed marketId, bytes32 indexed ticker, uint256 pairs, uint256 paid);
    event PremiumRecorded(bytes32 indexed ticker, uint256 amount);

    constructor(
        IERC20 asset_,
        ClosureVault closureVault_,
        address owner_
    ) ERC20("Vigil Underwriting", "vUW") ERC4626(asset_) Ownable(owner_) {
        if (address(asset_) == address(0) || address(closureVault_) == address(0)) {
            revert ZeroAddress();
        }
        closureVault = closureVault_;
        tickerCapBps = DEFAULT_TICKER_CAP_BPS;
        aggregateCapBps = 2000;
    }

    function setKeeper(
        address keeper_
    ) external onlyOwner {
        if (keeper_ == address(0)) revert ZeroAddress();
        keeper = keeper_;
        emit KeeperSet(keeper_);
    }

    function setTickerCapBps(
        uint16 bps
    ) external onlyOwner {
        if (bps == 0 || bps > BPS) revert Cap();
        tickerCapBps = bps;
    }

    function setAggregateCapBps(
        uint16 bps
    ) external onlyOwner {
        if (bps == 0 || bps > BPS) revert Cap();
        aggregateCapBps = bps;
    }

    function setExcluded(bytes32 ticker, bool on) external onlyOwner {
        excluded[ticker] = on;
        emit ExcludedSet(ticker, on);
    }

    /// @notice Mint `pairs` through the closure vault. Both notes stay here until the keeper sells one.
    function allocate(
        bytes32 marketId,
        bytes32 ticker,
        uint256 pairs
    ) external returns (uint256 paid) {
        if (msg.sender != keeper) revert NotKeeper();
        if (pairs == 0) revert Amount();
        if (excluded[ticker]) revert Excluded();

        uint256 nav = totalAssets();
        uint256 nextTicker = allocated[ticker] + pairs;
        uint256 nextTotal = allocatedTotal + pairs;
        if (nextTicker > (nav * tickerCapBps) / BPS) revert Cap();
        if (nextTotal > (nav * aggregateCapBps) / BPS) revert Cap();

        IERC20 token = IERC20(asset());
        token.forceApprove(address(closureVault), type(uint256).max);
        uint256 before = token.balanceOf(address(this));
        closureVault.mintPair(marketId, pairs, address(this));
        paid = before - token.balanceOf(address(this));

        allocated[ticker] = nextTicker;
        allocatedTotal = nextTotal;
        emit Allocated(marketId, ticker, pairs, paid);
    }

    /// @notice Premium is collateral already received from a sale of the protection leg.
    function recordPremium(bytes32 ticker, uint256 amount) external {
        if (msg.sender != keeper) revert NotKeeper();
        if (amount == 0 || excluded[ticker]) revert Amount();
        premium[ticker] += amount;
        emit PremiumRecorded(ticker, amount);
    }

    /// @notice Loss if the retained leg pays nothing. Premium already collected reduces it.
    function worstCaseLoss(
        bytes32 ticker
    ) public view returns (uint256) {
        uint256 locked = allocated[ticker];
        uint256 collected = premium[ticker];
        if (collected >= locked) return 0;
        return locked - collected;
    }

    function totalAssets() public view override returns (uint256) {
        return super.totalAssets() + allocatedTotal;
    }
}
