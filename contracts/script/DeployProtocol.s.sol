// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ProtocolStack} from "./ProtocolStack.sol";

/// @notice CREATE2 deploy of the live stack. Addresses stay empty until this broadcast succeeds.
contract DeployProtocol is Script, ProtocolStack {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.addr(pk);
        Config memory cfg = Config({
            owner: owner,
            council: vm.envAddress("COUNCIL"),
            feeSink: vm.envOr("FEE_SINK", owner),
            pyth: vm.envOr("PYTH_CONTRACT", PYTH),
            reporter1: vm.envAddress("REPORTER_1_ADDRESS"),
            reporter2: vm.envAddress("REPORTER_2_ADDRESS"),
            reporter3: vm.envAddress("REPORTER_3_ADDRESS"),
            keeper: vm.envOr("KEEPER_ADDRESS", owner),
            adjDelay: uint64(vm.envOr("ADJ_DELAY", uint256(3600))),
            disputeBond: uint96(vm.envOr("DISPUTE_BOND", uint256(0.01 ether))),
            mintFeeBps: uint16(vm.envOr("MINT_FEE_BPS", uint256(3))),
            windowCap: vm.envOr("WINDOW_NOTIONAL_CAP", uint256(500_000_000_000)),
            accountCap: vm.envOr("ACCOUNT_NOTIONAL_CAP", uint256(100_000_000_000))
        });

        vm.startBroadcast(pk);
        Stack memory out = deployStack(cfg);
        vm.stopBroadcast();

        console2.log("SessionRegistry", address(out.sessions));
        console2.log("CorporateActionRegistry", address(out.corp));
        console2.log("PrintOracle", address(out.oracle));
        console2.log("PythPrintReporter", address(out.reporter));
        console2.log("SettlementEngine", address(out.settlement));
        console2.log("ClosureVault", address(out.vault));
        console2.log("ClosureMarketFactory", address(out.factory));
        console2.log("TestCollateral", address(out.collateral));
        console2.log("KuruListingAdapter", address(out.listing));
        console2.log("PolicyAdapter", address(out.policy));
        console2.log("UnderwritingVault", address(out.underwriting));
    }
}
