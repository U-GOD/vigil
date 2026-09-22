// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value != 0) {
            super._update(from, to, value - 1);
            return;
        }
        super._update(from, to, value);
    }
}

contract Dec18Token is ERC20 {
    constructor() ERC20("Eighteen", "E18") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
