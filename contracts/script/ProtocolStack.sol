// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SessionRegistry} from "../src/registry/SessionRegistry.sol";
import {CorporateActionRegistry} from "../src/oracle/CorporateActionRegistry.sol";
import {PrintOracle} from "../src/oracle/PrintOracle.sol";
import {PythPrintReporter} from "../src/oracle/PythPrintReporter.sol";
import {SettlementEngine} from "../src/core/SettlementEngine.sol";
import {ClosureVault} from "../src/core/ClosureVault.sol";
import {ClosureMarketFactory, ISettlementRegistrar} from "../src/core/ClosureMarketFactory.sol";
import {TestCollateral} from "../src/util/TestCollateral.sol";
import {
    KuruListingAdapter, IMarketCollateral, INotePair
} from "../src/kuru/KuruListingAdapter.sol";
import {IKuruAccountCore} from "../src/interfaces/IKuruAccountCore.sol";
import {IKuruSpotRouter} from "../src/interfaces/IKuruSpotRouter.sol";
import {IPyth} from "../src/interfaces/IPyth.sol";
import {PolicyAdapter} from "../src/access/PolicyAdapter.sol";
import {UnderwritingVault} from "../src/vault/UnderwritingVault.sol";
import {Salts} from "./Salts.sol";
import {TickerSet} from "./TickerSet.sol";

/// @notice Deploys the live stack. Prints come from PrintOracle. InjectedPrintOracle is not used.
abstract contract ProtocolStack {
    address internal constant PYTH = 0x2880aB155794e7179c9eE2e38200202908C17B43;
    address internal constant ROUTER = 0xba24a1042701f06e8F7edCF04389260D1Fa4c697;
    address internal constant ACCOUNT_CORE = 0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22;

    struct Config {
        address owner;
        address council;
        address feeSink;
        address pyth;
        address reporter1;
        address reporter2;
        address reporter3;
        address keeper;
        uint64 adjDelay;
        uint96 disputeBond;
        uint16 mintFeeBps;
        uint256 windowCap;
        uint256 accountCap;
    }

    struct Stack {
        SessionRegistry sessions;
        CorporateActionRegistry corp;
        PrintOracle oracle;
        PythPrintReporter reporter;
        SettlementEngine settlement;
        ClosureVault vault;
        ClosureMarketFactory factory;
        TestCollateral collateral;
        KuruListingAdapter listing;
        PolicyAdapter policy;
        UnderwritingVault underwriting;
    }

    function deployStack(
        Config memory cfg
    ) internal returns (Stack memory out) {
        out.sessions = new SessionRegistry{salt: Salts.SESSIONS}(cfg.owner);
        out.corp =
            new CorporateActionRegistry{salt: Salts.CORP}(cfg.owner, out.sessions, cfg.adjDelay);
        out.oracle = new PrintOracle{salt: Salts.ORACLE}(
            cfg.owner, cfg.council, cfg.feeSink, out.sessions, 500, 2000, 3, cfg.disputeBond
        );
        out.reporter = new PythPrintReporter{salt: Salts.REPORTER}(
            cfg.owner, out.oracle, IPyth(cfg.pyth), out.sessions
        );
        out.oracle.setPythReporter(address(out.reporter));
        out.oracle.addReporter(cfg.reporter1);
        out.oracle.addReporter(cfg.reporter2);
        out.oracle.addReporter(cfg.reporter3);
        out.oracle.setDisputeWindow(keccak256("XNYS"), 30 minutes);
        out.oracle.setDisputeWindow(keccak256("VIGIL_SYNTH"), 60);

        out.settlement = new SettlementEngine{salt: Salts.SETTLEMENT}(
            cfg.owner, out.sessions, out.oracle, out.corp
        );
        out.vault = new ClosureVault{salt: Salts.VAULT}(
            cfg.owner, out.settlement, cfg.feeSink, cfg.mintFeeBps
        );
        out.factory = new ClosureMarketFactory{salt: Salts.FACTORY}(
            cfg.owner,
            out.sessions,
            out.vault,
            ISettlementRegistrar(address(out.settlement)),
            cfg.feeSink,
            0
        );
        out.vault.setFactory(address(out.factory));
        out.settlement.setFactory(address(out.factory), out.factory);
        out.collateral = new TestCollateral{salt: Salts.COLLATERAL}();

        out.listing = new KuruListingAdapter{salt: Salts.LISTING}(
            cfg.owner,
            INotePair(address(out.factory)),
            IMarketCollateral(address(out.vault)),
            IKuruSpotRouter(ROUTER),
            IKuruAccountCore(ACCOUNT_CORE)
        );
        out.policy = new PolicyAdapter{salt: Salts.POLICY}(
            out.vault, cfg.owner, cfg.windowCap, cfg.accountCap
        );
        out.underwriting =
            new UnderwritingVault{salt: Salts.UNDERWRITING}(out.collateral, out.vault, cfg.owner);
        out.underwriting.setKeeper(cfg.keeper);

        TickerSet.allowTiers(out.factory);
    }
}
