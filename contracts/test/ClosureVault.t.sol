// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Fixture} from "./helpers/Fixture.sol";
import {ClosureVault} from "../src/core/ClosureVault.sol";
import {ClosureMarketFactory} from "../src/core/ClosureMarketFactory.sol";
import {ClosureMath} from "../src/libs/ClosureMath.sol";
import {FeeOnTransferToken, Dec18Token} from "./helpers/Tokens.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";

contract ClosureVaultTest is Fixture {
    function test_revertZeroMint() public {
        (bytes32 id,,) = _createDefault();
        vm.expectRevert(ClosureMath.InvalidAmount.selector);
        vault.mintPair(id, 0, address(this));
    }

    function test_revertUnknownMarket() public {
        vm.expectRevert(ClosureVault.MarketMissing.selector);
        vault.mintPair(bytes32(uint256(1)), 1, address(this));
    }

    function test_revertFeeOnTransfer() public {
        FeeOnTransferToken feeTok = new FeeOnTransferToken();
        (bytes32 id,,) = factory.createMarket(keccak256("FEE"), SESSION, K10, K10, address(feeTok));
        feeTok.mint(address(this), 2_000_000);
        feeTok.approve(address(vault), type(uint256).max);
        vm.expectRevert(ClosureVault.FeeOnTransfer.selector);
        vault.mintPair(id, 1_000_000, address(this));
    }

    function test_revertWrongDecimalsOnRegister() public {
        Dec18Token tok = new Dec18Token();
        vm.expectRevert(ClosureMarketFactory.WrongDecimals.selector);
        factory.createMarket(keccak256("E18"), SESSION, K10, K10, address(tok));
    }

    function test_revertRedeemZero() public {
        (bytes32 id,,) = _createDefault();
        _fund(address(this), 1_000_000);
        vault.mintPair(id, 1_000_000, address(this));
        _finalizeAt(id, PRICE);
        vm.expectRevert(ClosureMath.InvalidAmount.selector);
        vault.redeem(id, 0, 0, address(this));
    }

    function test_sweepDustAfterFullRedeem() public {
        (bytes32 id,,) = _createDefault();
        _fund(address(this), 1);
        vault.mintPair(id, 1, address(this));
        _finalizeAt(id, 103e18);
        (uint256 sUp,) = settlement.settlementOf(id);
        uint256 owed = ClosureMath.payoutUp(1, sUp) + ClosureMath.payoutDn(1, sUp);
        vault.redeem(id, 1, 1, address(this));
        uint256 dust = _heldOf(id);
        assertEq(dust, 1 - owed);
        if (dust != 0) {
            uint256 before = usdc.balanceOf(feeSink);
            vault.sweepDust(id);
            assertEq(usdc.balanceOf(feeSink) - before, dust);
            assertEq(_heldOf(id), 0);
        }
    }

    function test_revertSweepWhileSupplyRemains() public {
        (bytes32 id,,) = _createDefault();
        _fund(address(this), 1_000_000);
        vault.mintPair(id, 1_000_000, address(this));
        _finalizeAt(id, PRICE);
        vm.expectRevert(ClosureVault.DustRemaining.selector);
        vault.sweepDust(id);
    }

    function test_setFactoryOnce() public {
        ClosureVault other = new ClosureVault(address(this), settlement, feeSink, 3);
        other.setFactory(address(factory));
        vm.expectRevert(ClosureVault.AlreadySet.selector);
        other.setFactory(address(factory));
    }

    function test_onlyFactoryRegisters() public {
        (bytes32 id, address up, address dn) = _createDefault();
        vm.expectRevert(ClosureVault.NotFactory.selector);
        vault.registerMarket(keccak256("x"), up, dn, address(usdc));
        assertTrue(id != bytes32(0));
    }

    function test_feeSinkOnlyGetsFee() public {
        (bytes32 id,,) = _createDefault();
        _fund(address(this), 2_000_000);
        vault.mintPair(id, 2_000_000, address(this));
        assertEq(usdc.balanceOf(feeSink), 600);
        assertEq(_heldOf(id), 2_000_000);
        assertEq(uint256(_stateOf(id)), uint256(ISettlement.State.Trading));
    }
}
