// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IKuruAccountCore} from "../src/interfaces/IKuruAccountCore.sol";

/// @notice Approve AccountCore, deposit to the deployer's root account, then read the account id.
/// @dev Kuru test USDC is admin-minted; there is no public faucet. The plugin builds the
///      same deposit through the toxicflow-labs ts-sdk.
contract AccountDeposit is Script {
    address internal constant CORE = 0xe08573a1Ecc4aa507c9626071fA0c4513caf7906;
    address internal constant USDC = 0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address me = vm.addr(pk);
        address core = vm.envOr("KURU_ACCOUNT_CORE", CORE);
        address usdc = vm.envOr("KURU_USDC", USDC);
        uint256 amount = vm.envOr("DEPOSIT_AMOUNT", uint256(1_000_000_000));

        vm.startBroadcast(pk);
        IERC20(usdc).approve(core, amount);
        IKuruAccountCore(core).deposit(me, usdc, amount);
        vm.stopBroadcast();

        console2.log("accountId", IKuruAccountCore(core).rootAccountIdOf(me));
    }
}
