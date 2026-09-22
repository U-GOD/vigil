// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {ClosureMarketFactory} from "../src/core/ClosureMarketFactory.sol";
import {ClosureVault} from "../src/core/ClosureVault.sol";
import {SettlementEngine} from "../src/core/SettlementEngine.sol";
import {InjectedPrintOracle} from "../src/oracle/InjectedPrintOracle.sol";
import {TestCollateral} from "../src/util/TestCollateral.sol";
import {IPrintOracle} from "../src/interfaces/IPrintOracle.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";

contract Lifecycle is Script {
    uint64 internal constant K10 = 1e17;
    uint256 internal constant PAIRS = 1_000_000;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address who = vm.addr(pk);
        ClosureMarketFactory factory = ClosureMarketFactory(vm.envAddress("FACTORY"));
        ClosureVault vault = ClosureVault(vm.envAddress("VAULT"));
        SettlementEngine settlement = SettlementEngine(vm.envAddress("SETTLEMENT"));
        InjectedPrintOracle oracle = InjectedPrintOracle(vm.envAddress("ORACLE"));
        TestCollateral collateral = TestCollateral(vm.envAddress("COLLATERAL"));
        bytes32 ticker = keccak256("NVDA");
        uint64 sessionId = 1;
        string memory step = vm.envOr("STEP", string("create"));

        vm.startBroadcast(pk);

        if (_eq(step, "create")) {
            (bytes32 id, address up, address dn) =
                factory.createMarket(ticker, sessionId, K10, K10, address(collateral));
            console2.logBytes32(id);
            console2.log("noteUp", up);
            console2.log("noteDn", dn);
        } else if (_eq(step, "mint")) {
            bytes32 id = vm.envBytes32("MARKET_ID");
            collateral.mint(who, 1_000_300);
            collateral.approve(address(vault), type(uint256).max);
            vault.mintPair(id, PAIRS, who);
            console2.log("minted", PAIRS);
        } else if (_eq(step, "burn")) {
            bytes32 id = vm.envBytes32("MARKET_ID");
            vault.burnPair(id, 100_000, who);
            console2.log("burned", uint256(100_000));
        } else if (_eq(step, "halt")) {
            settlement.halt(vm.envBytes32("MARKET_ID"));
            console2.log("halted");
        } else if (_eq(step, "inject")) {
            oracle.inject(ticker, sessionId, IPrintOracle.PrintKind.Close, 100e18);
            oracle.inject(ticker, sessionId, IPrintOracle.PrintKind.Open, 105e18);
            console2.log("injected close=100 open=105");
        } else if (_eq(step, "finalize")) {
            bytes32 id = vm.envBytes32("MARKET_ID");
            settlement.finalize(id);
            (uint256 sUp, ISettlement.State state) = settlement.settlementOf(id);
            console2.log("sUp", sUp);
            console2.log("state", uint256(state));
        } else if (_eq(step, "redeem")) {
            bytes32 id = vm.envBytes32("MARKET_ID");
            vault.redeem(id, 900_000, 900_000, who);
            console2.log("redeemed remaining pair");
        } else {
            revert("unknown STEP");
        }

        vm.stopBroadcast();
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
