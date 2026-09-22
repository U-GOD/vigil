// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {SessionRegistry} from "../src/registry/SessionRegistry.sol";
import {CorporateActionRegistry} from "../src/oracle/CorporateActionRegistry.sol";
import {InjectedPrintOracle} from "../src/oracle/InjectedPrintOracle.sol";
import {SettlementEngine} from "../src/core/SettlementEngine.sol";
import {ClosureVault} from "../src/core/ClosureVault.sol";
import {ClosureMarketFactory, ISettlementRegistrar} from "../src/core/ClosureMarketFactory.sol";
import {TestCollateral} from "../src/util/TestCollateral.sol";
import {ISessionRegistry} from "../src/interfaces/ISessionRegistry.sol";

/// @notice Deploys the Phase-2 core. Prints are owner-injected until Phase 3.
contract DeployCore is Script {
    uint64 internal constant K10 = 1e17;
    uint64 internal constant K25 = 25e16;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.addr(pk);
        address feeSink = vm.envOr("FEE_SINK", owner);
        uint16 mintFeeBps = uint16(vm.envOr("MINT_FEE_BPS", uint256(3)));
        uint96 creationBond = uint96(vm.envOr("CREATION_BOND", uint256(0)));

        vm.startBroadcast(pk);

        SessionRegistry sessions = new SessionRegistry(owner);
        CorporateActionRegistry corp = new CorporateActionRegistry(owner, sessions);
        InjectedPrintOracle oracle = new InjectedPrintOracle(owner);
        SettlementEngine settlement = new SettlementEngine(owner, sessions, oracle, corp);
        ClosureVault vault = new ClosureVault(owner, settlement, feeSink, mintFeeBps);
        ClosureMarketFactory factory = new ClosureMarketFactory(
            owner, sessions, vault, ISettlementRegistrar(address(settlement)), feeSink, creationBond
        );
        vault.setFactory(address(factory));
        settlement.setFactory(address(factory), factory);
        factory.setTier(K10, K10, true);
        factory.setTier(K25, K25, true);

        TestCollateral collateral = new TestCollateral();

        uint64 closeTs = uint64(block.timestamp + vm.envOr("SESSION_CLOSE_DELAY", uint256(120)));
        uint64 openTs = uint64(closeTs + vm.envOr("SESSION_WINDOW_SECS", uint256(60)));
        uint64 fallbackDeadline = uint64(openTs + vm.envOr("SESSION_FALLBACK_SECS", uint256(3600)));
        sessions.createSession(
            1,
            ISessionRegistry.Session({
                exchange: keccak256("VIGIL_SYNTH"),
                closeTs: closeTs,
                openTs: openTs,
                fallbackDeadline: fallbackDeadline,
                printBandSecs: 1800,
                active: true
            })
        );

        vm.stopBroadcast();

        console2.log("SessionRegistry", address(sessions));
        console2.log("CorporateActionRegistry", address(corp));
        console2.log("InjectedPrintOracle", address(oracle));
        console2.log("SettlementEngine", address(settlement));
        console2.log("ClosureVault", address(vault));
        console2.log("ClosureMarketFactory", address(factory));
        console2.log("TestCollateral", address(collateral));
        console2.log("feeSink", feeSink);
        console2.log("session.closeTs", closeTs);
        console2.log("session.openTs", openTs);
        console2.log("session.fallbackDeadline", fallbackDeadline);
    }
}
