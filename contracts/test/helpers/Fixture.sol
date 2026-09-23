// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SessionRegistry} from "../../src/registry/SessionRegistry.sol";
import {CorporateActionRegistry} from "../../src/oracle/CorporateActionRegistry.sol";
import {InjectedPrintOracle} from "../../src/oracle/InjectedPrintOracle.sol";
import {SettlementEngine} from "../../src/core/SettlementEngine.sol";
import {ClosureVault} from "../../src/core/ClosureVault.sol";
import {ClosureMarketFactory} from "../../src/core/ClosureMarketFactory.sol";
import {TestCollateral} from "../../src/util/TestCollateral.sol";
import {ISessionRegistry} from "../../src/interfaces/ISessionRegistry.sol";
import {IPrintOracle} from "../../src/interfaces/IPrintOracle.sol";
import {ISettlement} from "../../src/interfaces/ISettlement.sol";
import {ISettlementRegistrar} from "../../src/core/ClosureMarketFactory.sol";
import {ClosureNote} from "../../src/core/ClosureNote.sol";

contract Fixture is Test {
    uint64 internal constant SESSION = 1;
    uint64 internal constant K10 = 1e17;
    uint64 internal constant K25 = 25e16;
    bytes32 internal constant TICKER = keccak256("NVDA");
    uint256 internal constant PRICE = 100e18;

    SessionRegistry internal sessions;
    CorporateActionRegistry internal corp;
    InjectedPrintOracle internal oracle;
    SettlementEngine internal settlement;
    ClosureVault internal vault;
    ClosureMarketFactory internal factory;
    TestCollateral internal usdc;
    address internal feeSink = makeAddr("feeSink");

    function setUp() public virtual {
        sessions = new SessionRegistry(address(this));
        corp = new CorporateActionRegistry(address(this), sessions, 1);
        oracle = new InjectedPrintOracle(address(this));
        settlement = new SettlementEngine(address(this), sessions, oracle, corp);
        vault = new ClosureVault(address(this), settlement, feeSink, 3);
        factory = new ClosureMarketFactory(
            address(this), sessions, vault, ISettlementRegistrar(address(settlement)), feeSink, 0
        );
        vault.setFactory(address(factory));
        settlement.setFactory(address(factory), factory);
        factory.setTier(K10, K10, true);
        factory.setTier(K25, K25, true);
        usdc = new TestCollateral();

        sessions.createSession(
            SESSION,
            ISessionRegistry.Session({
                exchange: keccak256("XNYS"),
                closeTs: uint64(block.timestamp + 1 days),
                openTs: uint64(block.timestamp + 3 days),
                fallbackDeadline: uint64(block.timestamp + 4 days),
                printBandSecs: 1800,
                active: true
            })
        );
    }

    function _createDefault() internal returns (bytes32 id, address up, address dn) {
        (id, up, dn) = factory.createMarket(TICKER, SESSION, K10, K10, address(usdc));
    }

    function _fund(address who, uint256 pairs) internal {
        (uint256 requiredIn,) = _mintCost(pairs);
        usdc.mint(who, requiredIn);
        vm.prank(who);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _mintCost(
        uint256 pairs
    ) internal view returns (uint256 requiredIn, uint256 backing) {
        backing = pairs;
        requiredIn = (pairs * (10_000 + vault.mintFeeBps())) / 10_000;
    }

    function _warpOpen() internal {
        vm.warp(block.timestamp + 3 days);
    }

    function _warpFallback() internal {
        vm.warp(block.timestamp + 4 days);
    }

    function _finalizeAt(bytes32 id, uint256 pOpen) internal {
        _warpOpen();
        settlement.halt(id);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Close, PRICE);
        oracle.inject(TICKER, SESSION, IPrintOracle.PrintKind.Open, pOpen);
        settlement.finalize(id);
    }

    function _heldOf(
        bytes32 id
    ) internal view returns (uint256 held) {
        (,,, held,,) = vault.markets(id);
    }

    function _notesOf(
        bytes32 id
    ) internal view returns (ClosureNote up, ClosureNote dn) {
        (up, dn,,,,) = vault.markets(id);
    }

    function _stateOf(
        bytes32 id
    ) internal view returns (ISettlement.State) {
        return settlement.stateOf(id);
    }
}
