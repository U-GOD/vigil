// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ProtocolStack} from "../script/ProtocolStack.sol";
import {Salts} from "../script/Salts.sol";
import {SessionRegistry} from "../src/registry/SessionRegistry.sol";
import {SeedSynth} from "../script/SeedSynth.s.sol";
import {TickerSet} from "../script/TickerSet.sol";
import {PolicyAdapter} from "../src/access/PolicyAdapter.sol";
import {Fixture} from "./helpers/Fixture.sol";

contract DeployProtocolTest is Test, ProtocolStack {
    function test_create2SaltMatchesTheDeployer() public {
        address owner = address(this);
        SessionRegistry sessions = new SessionRegistry{salt: Salts.SESSIONS}(owner);
        address predicted = vm.computeCreate2Address(
            Salts.SESSIONS,
            keccak256(abi.encodePacked(type(SessionRegistry).creationCode, abi.encode(owner))),
            address(this)
        );
        assertEq(address(sessions), predicted);
    }

    function test_stackWiresTheLiveOracle() public {
        Config memory cfg = Config({
            owner: address(this),
            council: makeAddr("council"),
            feeSink: makeAddr("fee"),
            pyth: PYTH,
            reporter1: makeAddr("r1"),
            reporter2: makeAddr("r2"),
            reporter3: makeAddr("r3"),
            keeper: makeAddr("keeper"),
            adjDelay: 3600,
            disputeBond: 0.01 ether,
            mintFeeBps: 3,
            windowCap: 500_000_000_000,
            accountCap: 100_000_000_000
        });
        Stack memory out = deployStack(cfg);
        assertEq(out.oracle.pythReporter(), address(out.reporter));
        assertEq(address(out.vault.settlement()), address(out.settlement));
        assertEq(out.vault.factory(), address(out.factory));
        assertEq(address(out.factory.vault()), address(out.vault));
        assertEq(address(out.policy.vault()), address(out.vault));
        assertEq(address(out.underwriting.closureVault()), address(out.vault));
        assertEq(out.underwriting.keeper(), cfg.keeper);
        assertTrue(out.factory.tierAllowed(1e17, 1e17));
        assertTrue(out.factory.tierAllowed(1e17, 25e16));
        assertEq(out.oracle.defaultQuorum(), 3);
    }

    function test_synthWindowIsOrdered() public {
        SeedSynth seed = new SeedSynth();
        (uint64 closeTs, uint64 openTs, uint64 fallbackDeadline) =
            seed.synthWindow(1000, 300, 600, 600);
        assertEq(closeTs, 1300);
        assertEq(openTs, 1900);
        assertEq(fallbackDeadline, 2500);
    }
}

contract TickerSetTest is Fixture {
    function test_opensThirtyMarkets() public {
        PolicyAdapter policy =
            new PolicyAdapter(vault, address(this), 500_000_000_000, 100_000_000_000);
        uint256 opened = TickerSet.openMarkets(factory, policy, address(usdc), SESSION);
        assertEq(opened, 30);
        assertTrue(factory.tierAllowed(5e16, 5e16));
        assertTrue(factory.tierAllowed(25e16, 1e17));
    }
}
