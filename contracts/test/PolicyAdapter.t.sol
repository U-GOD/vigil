// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PolicyAdapter} from "../src/access/PolicyAdapter.sol";
import {ClosureNote} from "../src/core/ClosureNote.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";
import {Fixture} from "./helpers/Fixture.sol";

contract PolicyAdapterTest is Fixture {
    PolicyAdapter internal policy;
    address internal user = makeAddr("user");
    address internal other = makeAddr("other");

    function setUp() public override {
        super.setUp();
        policy = new PolicyAdapter(vault, address(this), 1_000_000_000, 500_000_000);
    }

    function test_mintForwardsNotesToTheUser() public {
        bytes32 id = _allow();
        uint256 pairs = 1_000_000;
        _mintThrough(user, id, pairs);

        (ClosureNote up, ClosureNote dn) = _notesOf(id);
        assertEq(up.balanceOf(user), pairs);
        assertEq(dn.balanceOf(user), pairs);
        assertEq(policy.accountUsed(user, SESSION), pairs);
        assertEq(policy.windowUsed(SESSION), pairs);
        assertEq(usdc.balanceOf(user), 0);
    }

    function test_accountCap() public {
        bytes32 id = _allow();
        uint256 pairs = 500_000_001;
        (uint256 requiredIn,) = _mintCost(pairs);
        usdc.mint(user, requiredIn);
        vm.startPrank(user);
        usdc.approve(address(policy), requiredIn);
        vm.expectRevert(PolicyAdapter.Cap.selector);
        policy.mintPair(id, pairs, user);
        vm.stopPrank();
    }

    function test_windowCapSumsAccounts() public {
        bytes32 id = _allow();
        policy.setCaps(150, 1000);
        _mintThrough(user, id, 100);
        (uint256 requiredIn,) = _mintCost(100);
        usdc.mint(other, requiredIn);
        vm.startPrank(other);
        usdc.approve(address(policy), requiredIn);
        vm.expectRevert(PolicyAdapter.Cap.selector);
        policy.mintPair(id, 100, other);
        vm.stopPrank();
        assertEq(policy.windowUsed(SESSION), 100);
    }

    function test_unlistedMarketReverts() public {
        (bytes32 id,,) = _createDefault();
        vm.expectRevert(PolicyAdapter.MarketNotAllowed.selector);
        policy.mintPair(id, 1, user);
    }

    function test_strangerCannotAllow() public {
        (bytes32 id,,) = _createDefault();
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        policy.allowMarket(id, SESSION, true);
    }

    function test_buyProtectionReservesNotionalWithoutMovingCollateral() public {
        bytes32 id = _allow();
        usdc.mint(user, 50);
        uint256 before = usdc.balanceOf(user);
        vm.prank(user);
        policy.buyProtection(id, 25);
        assertEq(usdc.balanceOf(user), before);
        assertEq(policy.accountUsed(user, SESSION), 25);
    }

    function test_burnReturnsBacking() public {
        bytes32 id = _allow();
        uint256 pairs = 1_000_000;
        _mintThrough(user, id, pairs);
        (ClosureNote up, ClosureNote dn) = _notesOf(id);
        vm.startPrank(user);
        up.approve(address(policy), pairs);
        dn.approve(address(policy), pairs);
        policy.burnPair(id, pairs, user);
        vm.stopPrank();
        assertEq(usdc.balanceOf(user), pairs);
        assertEq(up.balanceOf(user), 0);
    }

    function test_haltBlocksAdapterBurn() public {
        bytes32 id = _allow();
        uint256 pairs = 1_000_000;
        _mintThrough(user, id, pairs);
        _warpOpen();
        settlement.halt(id);
        assertEq(uint256(_stateOf(id)), uint256(ISettlement.State.Halted));
        (ClosureNote up, ClosureNote dn) = _notesOf(id);
        vm.startPrank(user);
        up.approve(address(policy), pairs);
        dn.approve(address(policy), pairs);
        vm.expectRevert(ClosureNote.Halted.selector);
        policy.burnPair(id, pairs, user);
        vm.stopPrank();
    }

    function test_redeemAfterFinalize() public {
        bytes32 id = _allow();
        uint256 pairs = 1_000_000;
        _mintThrough(user, id, pairs);
        _finalizeAt(id, PRICE);
        (ClosureNote up, ClosureNote dn) = _notesOf(id);
        vm.startPrank(user);
        up.approve(address(policy), pairs);
        dn.approve(address(policy), pairs);
        policy.redeem(id, pairs, pairs, user);
        vm.stopPrank();
        assertEq(usdc.balanceOf(user), pairs);
        assertEq(up.balanceOf(user), 0);
        assertEq(dn.balanceOf(user), 0);
    }

    function _allow() internal returns (bytes32 id) {
        (id,,) = _createDefault();
        policy.allowMarket(id, SESSION, true);
    }

    function _mintThrough(address who, bytes32 id, uint256 pairs) internal {
        (uint256 requiredIn,) = _mintCost(pairs);
        usdc.mint(who, requiredIn);
        vm.startPrank(who);
        usdc.approve(address(policy), requiredIn);
        policy.mintPair(id, pairs, who);
        vm.stopPrank();
    }
}
