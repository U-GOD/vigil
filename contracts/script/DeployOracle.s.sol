// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SessionRegistry} from "../src/registry/SessionRegistry.sol";
import {CorporateActionRegistry} from "../src/oracle/CorporateActionRegistry.sol";
import {PrintOracle} from "../src/oracle/PrintOracle.sol";
import {PythPrintReporter} from "../src/oracle/PythPrintReporter.sol";
import {SettlementEngine} from "../src/core/SettlementEngine.sol";
import {ClosureVault} from "../src/core/ClosureVault.sol";
import {ClosureMarketFactory, ISettlementRegistrar} from "../src/core/ClosureMarketFactory.sol";
import {TestCollateral} from "../src/util/TestCollateral.sol";
import {IPyth} from "../src/interfaces/IPyth.sol";
import {ISessionRegistry} from "../src/interfaces/ISessionRegistry.sol";

/// @notice Phase-3 stack. Prints come from PrintOracle, not the owner.
contract DeployOracle is Script {
    uint64 internal constant K10 = 1e17;
    uint64 internal constant K25 = 25e16;
    address internal constant PYTH = 0x2880aB155794e7179c9eE2e38200202908C17B43;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.addr(pk);
        address council = vm.envAddress("COUNCIL");
        address feeSink = vm.envOr("FEE_SINK", owner);
        address pyth = vm.envOr("PYTH_CONTRACT", PYTH);
        uint64 adjDelay = uint64(vm.envOr("ADJ_DELAY", uint256(3600)));
        uint96 bond = uint96(vm.envOr("DISPUTE_BOND", uint256(0.01 ether)));

        vm.startBroadcast(pk);

        SessionRegistry sessions = new SessionRegistry(owner);
        CorporateActionRegistry corp = new CorporateActionRegistry(owner, sessions, adjDelay);
        PrintOracle oracle = new PrintOracle(owner, council, feeSink, sessions, 500, 2000, 3, bond);
        PythPrintReporter reporter = new PythPrintReporter(owner, oracle, IPyth(pyth), sessions);
        oracle.setPythReporter(address(reporter));
        oracle.addReporter(vm.envAddress("REPORTER_1_ADDRESS"));
        oracle.addReporter(vm.envAddress("REPORTER_2_ADDRESS"));
        oracle.addReporter(vm.envAddress("REPORTER_3_ADDRESS"));
        oracle.setDisputeWindow(keccak256("XNYS"), 30 minutes);
        oracle.setDisputeWindow(keccak256("VIGIL_SYNTH"), 60);

        SettlementEngine settlement = new SettlementEngine(owner, sessions, oracle, corp);
        ClosureVault vault = new ClosureVault(owner, settlement, feeSink, 3);
        ClosureMarketFactory factory = new ClosureMarketFactory(
            owner, sessions, vault, ISettlementRegistrar(address(settlement)), feeSink, 0
        );
        vault.setFactory(address(factory));
        settlement.setFactory(address(factory), factory);
        factory.setTier(K10, K10, true);
        factory.setTier(K25, K25, true);
        TestCollateral collateral = new TestCollateral();

        uint64 closeTs = uint64(block.timestamp + 120);
        uint64 openTs = uint64(closeTs + 60);
        sessions.createSession(
            90_000_001,
            ISessionRegistry.Session({
                exchange: keccak256("VIGIL_SYNTH"),
                closeTs: closeTs,
                openTs: openTs,
                fallbackDeadline: uint64(openTs + 3600),
                printBandSecs: 60,
                active: true
            })
        );

        vm.stopBroadcast();

        console2.log("SessionRegistry", address(sessions));
        console2.log("CorporateActionRegistry", address(corp));
        console2.log("PrintOracle", address(oracle));
        console2.log("PythPrintReporter", address(reporter));
        console2.log("SettlementEngine", address(settlement));
        console2.log("ClosureVault", address(vault));
        console2.log("ClosureMarketFactory", address(factory));
        console2.log("TestCollateral", address(collateral));
        console2.log("synth.sessionId", uint256(90_000_001));
        console2.log("synth.closeTs", closeTs);
        console2.log("synth.openTs", openTs);
    }
}
