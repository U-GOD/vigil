// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IKuruAccountCore} from "../src/interfaces/IKuruAccountCore.sol";

interface ITestnetFaucet {
    function claim() external;
}

/// @notice Faucet USDC, approve AccountCore, deposit, then read the account id.
/// @dev The plugin builds the same deposit through `@toxicflow-labs/ts-sdk`.
contract AccountDeposit is Script {
    address internal constant CORE = 0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22;
    address internal constant USDC = 0xEe0722ead54f1B4fe97bE399Be43BC0226a6f97E;
    address internal constant FAUCET = 0x25B1416FcD3400bE2D8F50bbe7Cf1101b8B891E9;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address me = vm.addr(pk);
        address core = vm.envOr("KURU_ACCOUNT_CORE", CORE);
        address usdc = vm.envOr("KURU_USDC", USDC);
        address faucet = vm.envOr("KURU_FAUCET", FAUCET);
        uint256 amount = vm.envOr("DEPOSIT_AMOUNT", uint256(1_000_000_000));

        vm.startBroadcast(pk);
        ITestnetFaucet(faucet).claim();
        IERC20(usdc).approve(core, amount);
        IKuruAccountCore(core).deposit(usdc, amount);
        vm.stopBroadcast();

        console2.log("accountId", IKuruAccountCore(core).userRegistry(me));
    }
}
