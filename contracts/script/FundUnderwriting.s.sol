// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {TestCollateral} from "../src/util/TestCollateral.sol";
import {UnderwritingVault} from "../src/vault/UnderwritingVault.sol";

/// @notice Mints testnet VUSD and deposits it into the underwriting vault. VUSD is not a production stablecoin.
contract FundUnderwriting is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.addr(pk);
        TestCollateral token = TestCollateral(vm.envAddress("COLLATERAL"));
        UnderwritingVault vault = UnderwritingVault(vm.envAddress("UNDERWRITING"));
        uint256 amount = vm.envUint("FUND_AMOUNT");

        vm.startBroadcast(pk);
        token.mint(owner, amount);
        token.approve(address(vault), amount);
        vault.deposit(amount, owner);
        vm.stopBroadcast();
        console2.log("deposited", amount);
    }
}
