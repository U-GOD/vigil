// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Fixture} from "./helpers/Fixture.sol";
import {ClosureNote} from "../src/core/ClosureNote.sol";
import {ClosureVault} from "../src/core/ClosureVault.sol";
import {SettlementEngine} from "../src/core/SettlementEngine.sol";
import {InjectedPrintOracle} from "../src/oracle/InjectedPrintOracle.sol";
import {CorporateActionRegistry} from "../src/oracle/CorporateActionRegistry.sol";
import {TestCollateral} from "../src/util/TestCollateral.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";
import {IPrintOracle} from "../src/interfaces/IPrintOracle.sol";
import {ISessionRegistry} from "../src/interfaces/ISessionRegistry.sol";
import {ClosureMath} from "../src/libs/ClosureMath.sol";

struct HandlerCfg {
    ClosureVault vault;
    SettlementEngine settlement;
    InjectedPrintOracle oracle;
    CorporateActionRegistry corp;
    TestCollateral usdc;
    address owner;
    uint64 sessionId;
    uint256 closeTs;
    uint256 openTs;
    uint256 fallbackTs;
}

contract Handler is Test {
    uint256 public ghostFees;
    uint256 public ghostSwept;
    uint256 public ghostMintedPairs;

    ClosureVault public vault;
    SettlementEngine public settlement;
    InjectedPrintOracle public oracle;
    CorporateActionRegistry public corp;
    TestCollateral public usdc;
    address public owner;

    address[] public actors;
    bytes32[] public ids;
    bytes32[] public tickers;
    uint64 public sessionId;
    uint256 public closeTs;
    uint256 public openTs;
    uint256 public fallbackTs;

    constructor(
        HandlerCfg memory cfg,
        address[] memory actors_,
        bytes32[] memory ids_,
        bytes32[] memory tickers_
    ) {
        vault = cfg.vault;
        settlement = cfg.settlement;
        oracle = cfg.oracle;
        corp = cfg.corp;
        usdc = cfg.usdc;
        owner = cfg.owner;
        sessionId = cfg.sessionId;
        closeTs = cfg.closeTs;
        openTs = cfg.openTs;
        fallbackTs = cfg.fallbackTs;
        for (uint256 i = 0; i < actors_.length; ++i) {
            actors.push(actors_[i]);
            usdc.mint(actors_[i], 1e18);
            vm.prank(actors_[i]);
            usdc.approve(address(vault), type(uint256).max);
        }
        for (uint256 i = 0; i < ids_.length; ++i) {
            ids.push(ids_[i]);
            tickers.push(tickers_[i]);
        }
    }

    function mint(uint256 actorSeed, uint256 marketSeed, uint256 pairs) external {
        address actor = actors[actorSeed % actors.length];
        bytes32 id = ids[marketSeed % ids.length];
        if (settlement.stateOf(id) != ISettlement.State.Trading) return;
        pairs = bound(pairs, 1, 1_000_000);
        (uint256 requiredIn, uint256 backing) = ClosureMath.mintIn(pairs, vault.mintFeeBps());
        if (usdc.balanceOf(actor) < requiredIn) {
            usdc.mint(actor, requiredIn);
        }
        vm.prank(actor);
        try vault.mintPair(id, pairs, actor) {
            ghostFees += requiredIn - backing;
            ghostMintedPairs += pairs;
        } catch {}
    }

    function burn(uint256 actorSeed, uint256 marketSeed, uint256 pairs) external {
        address actor = actors[actorSeed % actors.length];
        bytes32 id = ids[marketSeed % ids.length];
        (ClosureNote up, ClosureNote dn) = _notes(id);
        uint256 maxPairs = up.balanceOf(actor);
        if (dn.balanceOf(actor) < maxPairs) maxPairs = dn.balanceOf(actor);
        if (maxPairs == 0) return;
        pairs = bound(pairs, 1, maxPairs);
        vm.prank(actor);
        try vault.burnPair(id, pairs, actor) {} catch {}
    }

    function transfer(uint256 actorSeed, uint256 marketSeed, uint256 amount, bool upLeg) external {
        address from = actors[actorSeed % actors.length];
        address to = actors[(actorSeed + 1) % actors.length];
        (ClosureNote up, ClosureNote dn) = _notes(ids[marketSeed % ids.length]);
        ClosureNote note = upLeg ? up : dn;
        uint256 bal = note.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(from);
        try note.transfer(to, amount) {} catch {}
    }

    function transferFrom(
        uint256 actorSeed,
        uint256 marketSeed,
        uint256 amount,
        bool upLeg
    ) external {
        address from = actors[actorSeed % actors.length];
        address spender = actors[(actorSeed + 2) % actors.length];
        address to = actors[(actorSeed + 3) % actors.length];
        (ClosureNote up, ClosureNote dn) = _notes(ids[marketSeed % ids.length]);
        ClosureNote note = upLeg ? up : dn;
        uint256 bal = note.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(from);
        note.approve(spender, amount);
        vm.prank(spender);
        try note.transferFrom(from, to, amount) {} catch {}
    }

    function halt(
        uint256 marketSeed
    ) external {
        bytes32 id = ids[marketSeed % ids.length];
        if (block.timestamp < openTs) vm.warp(openTs);
        try settlement.halt(id) {} catch {}
    }

    function finalize(uint256 marketSeed, uint256 pOpen) external {
        bytes32 id = ids[marketSeed % ids.length];
        bytes32 ticker = tickers[marketSeed % tickers.length];
        if (block.timestamp < openTs) vm.warp(openTs);
        try settlement.halt(id) {} catch {}
        pOpen = bound(pOpen, 1, 200e18);
        vm.startPrank(owner);
        try oracle.inject(ticker, sessionId, IPrintOracle.PrintKind.Close, 100e18) {} catch {}
        try oracle.inject(ticker, sessionId, IPrintOracle.PrintKind.Open, pOpen) {} catch {}
        vm.stopPrank();
        try settlement.finalize(id) {} catch {}
    }

    function fallbackFinalize(
        uint256 marketSeed
    ) external {
        bytes32 id = ids[marketSeed % ids.length];
        if (block.timestamp < fallbackTs) vm.warp(fallbackTs);
        try settlement.fallbackFinalize(id) {} catch {}
    }

    function redeem(uint256 actorSeed, uint256 marketSeed, uint256 upAmt, uint256 dnAmt) external {
        address actor = actors[actorSeed % actors.length];
        bytes32 id = ids[marketSeed % ids.length];
        (ClosureNote up, ClosureNote dn) = _notes(id);
        uint256 uBal = up.balanceOf(actor);
        uint256 dBal = dn.balanceOf(actor);
        if (uBal == 0 && dBal == 0) return;
        upAmt = uBal == 0 ? 0 : bound(upAmt, 0, uBal);
        dnAmt = dBal == 0 ? 0 : bound(dnAmt, 0, dBal);
        if (upAmt == 0 && dnAmt == 0) return;
        vm.prank(actor);
        try vault.redeem(id, upAmt, dnAmt, actor) {} catch {}
    }

    function sweep(
        uint256 marketSeed
    ) external {
        address sink = vault.feeSink();
        uint256 before = usdc.balanceOf(sink);
        try vault.sweepDust(ids[marketSeed % ids.length]) {
            ghostSwept += usdc.balanceOf(sink) - before;
        } catch {}
    }

    function setAdj(
        uint256 adj
    ) external {
        if (block.timestamp >= closeTs) return;
        adj = bound(adj, 1, 10e18);
        vm.prank(owner);
        try corp.scheduleAdj(tickers[0], sessionId, adj) {}
        catch {
            return;
        }
        vm.warp(block.timestamp + corp.adjDelay());
        try corp.executeAdj(tickers[0], sessionId) {} catch {}
    }

    function _notes(
        bytes32 id
    ) internal view returns (ClosureNote up, ClosureNote dn) {
        (up, dn,,,,) = vault.markets(id);
    }
}

contract InvariantTest is StdInvariant, Fixture {
    Handler internal handler;
    bytes32[] internal ids;
    bytes32[] internal tickers;

    function setUp() public override {
        super.setUp();
        tickers.push(TICKER);
        tickers.push(keccak256("AAPL"));
        tickers.push(keccak256("TSLA"));
        for (uint256 i = 0; i < 3; ++i) {
            (bytes32 id,,) = factory.createMarket(tickers[i], SESSION, K10, K10, address(usdc));
            ids.push(id);
        }
        address[] memory actors = new address[](5);
        actors[0] = makeAddr("a0");
        actors[1] = makeAddr("a1");
        actors[2] = makeAddr("a2");
        actors[3] = makeAddr("a3");
        actors[4] = makeAddr("a4");
        ISessionRegistry.Session memory session = sessions.sessionOf(SESSION);
        handler = new Handler(
            HandlerCfg({
                vault: vault,
                settlement: settlement,
                oracle: oracle,
                corp: corp,
                usdc: usdc,
                owner: address(this),
                sessionId: SESSION,
                closeTs: session.closeTs,
                openTs: session.openTs,
                fallbackTs: session.fallbackDeadline
            }),
            actors,
            ids,
            tickers
        );
        targetContract(address(handler));
    }

    function invariant_I1_equalSupplyWhileLive() public view {
        for (uint256 i = 0; i < ids.length; ++i) {
            ISettlement.State state = settlement.stateOf(ids[i]);
            if (state == ISettlement.State.Trading || state == ISettlement.State.Halted) {
                (ClosureNote up, ClosureNote dn,,,,) = vault.markets(ids[i]);
                assertEq(up.totalSupply(), dn.totalSupply());
            }
        }
    }

    function invariant_I2_backingWhileLive() public view {
        for (uint256 i = 0; i < ids.length; ++i) {
            ISettlement.State state = settlement.stateOf(ids[i]);
            if (state == ISettlement.State.Trading || state == ISettlement.State.Halted) {
                (ClosureNote up,,, uint256 held,,) = vault.markets(ids[i]);
                assertEq(held, up.totalSupply());
            }
        }
    }

    function invariant_I4_redeemable() public view {
        for (uint256 i = 0; i < ids.length; ++i) {
            (ClosureNote up, ClosureNote dn,, uint256 held,,) = vault.markets(ids[i]);
            ISettlement.State state = settlement.stateOf(ids[i]);
            if (
                state == ISettlement.State.Finalized || state == ISettlement.State.FallbackFinalized
            ) {
                (uint256 sUp,) = settlement.settlementOf(ids[i]);
                uint256 owed = ClosureMath.payoutUp(up.totalSupply(), sUp)
                    + ClosureMath.payoutDn(dn.totalSupply(), sUp);
                assertGe(held, owed);
                assertLe(sUp, ClosureMath.WAD);
            }
        }
    }

    function invariant_I5_feesNeverInHeld() public view {
        assertEq(usdc.balanceOf(feeSink), handler.ghostFees() + handler.ghostSwept());
        uint256 heldSum;
        for (uint256 i = 0; i < ids.length; ++i) {
            (,,, uint256 held,,) = vault.markets(ids[i]);
            heldSum += held;
        }
        assertEq(usdc.balanceOf(address(vault)), heldSum);
    }

    function invariant_I8_termsFrozen() public view {
        for (uint256 i = 0; i < ids.length; ++i) {
            (bytes32 ticker, uint64 sessionId, uint64 kUp, uint64 kDn,) = settlement.termsOf(ids[i]);
            assertEq(ticker, tickers[i]);
            assertEq(sessionId, SESSION);
            assertEq(kUp, K10);
            assertEq(kDn, K10);
        }
    }
}
