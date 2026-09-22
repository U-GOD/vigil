// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ISettlement} from "../interfaces/ISettlement.sol";

contract ClosureNote is ERC20 {
    error NotVault();
    error Halted();

    address public immutable vault;
    ISettlement public immutable settlement;
    bytes32 public immutable marketId;

    constructor(
        string memory name_,
        string memory symbol_,
        address vault_,
        address settlement_,
        bytes32 marketId_
    ) ERC20(name_, symbol_) {
        vault = vault_;
        settlement = ISettlement(settlement_);
        marketId = marketId_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != vault) revert NotVault();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != vault) revert NotVault();
        _burn(from, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            if (settlement.isHalted(marketId)) revert Halted();
        }
        super._update(from, to, value);
    }
}
