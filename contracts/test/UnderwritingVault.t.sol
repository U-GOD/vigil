// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {UnderwritingVault} from "../src/vault/UnderwritingVault.sol";
import {Fixture} from "./helpers/Fixture.sol";

contract UnderwritingVaultTest is Fixture {
    UnderwritingVault internal uw;
    address internal keeper = makeAddr("keeper");

    function setUp() public override {
        super.setUp();
        uw = new UnderwritingVault(usdc, vault, address(this));
        uw.setKeeper(keeper);
        usdc.mint(address(this), 1_000_000_000);
        usdc.approve(address(uw), type(uint256).max);
        uw.deposit(1_000_000_000, address(this));
    }

    function test_tickerCapBoundsTheGapLoss() public {
        (bytes32 id,,) = _createDefault();
        uint256 pairs = 25_000_000;
        vm.prank(keeper);
        uw.allocate(id, TICKER, pairs);
        vm.prank(keeper);
        uw.recordPremium(TICKER, 1_000_000);

        uint256 loss = uw.worstCaseLoss(TICKER);
        assertEq(loss, pairs - 1_000_000);
        assertLe(loss, (uw.totalAssets() * uw.tickerCapBps()) / 10_000);
    }

    function test_capAndExclusionRevert() public {
        (bytes32 id,,) = _createDefault();
        vm.prank(keeper);
        vm.expectRevert(UnderwritingVault.Cap.selector);
        uw.allocate(id, TICKER, 26_000_000);

        uw.setExcluded(TICKER, true);
        vm.prank(keeper);
        vm.expectRevert(UnderwritingVault.Excluded.selector);
        uw.allocate(id, TICKER, 1_000_000);
    }

    function test_strangerCannotAllocate() public {
        (bytes32 id,,) = _createDefault();
        vm.expectRevert(UnderwritingVault.NotKeeper.selector);
        uw.allocate(id, TICKER, 1_000_000);
    }
}
