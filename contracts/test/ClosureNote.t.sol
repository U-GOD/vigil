// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Fixture} from "./helpers/Fixture.sol";
import {ClosureNote} from "../src/core/ClosureNote.sol";

contract ClosureNoteTest is Fixture {
    function test_decimalsAndVaultMintBurn() public {
        (, address up,) = _createDefault();
        assertEq(ClosureNote(up).decimals(), 6);
        vm.expectRevert(ClosureNote.NotVault.selector);
        ClosureNote(up).mint(address(this), 1);
        vm.expectRevert(ClosureNote.NotVault.selector);
        ClosureNote(up).burn(address(this), 1);
    }

    function test_transferOkWhileTrading() public {
        (bytes32 id, address up,) = _createDefault();
        _fund(address(this), 1_000_000);
        vault.mintPair(id, 1_000_000, address(this));
        address other = makeAddr("other");
        assertTrue(ClosureNote(up).transfer(other, 100));
        assertEq(ClosureNote(up).balanceOf(other), 100);
    }

    function test_transferFromBlockedWhileHalted() public {
        (bytes32 id, address up,) = _createDefault();
        _fund(address(this), 1_000_000);
        vault.mintPair(id, 1_000_000, address(this));
        address spender = makeAddr("spender");
        ClosureNote(up).approve(spender, 50);
        _warpOpen();
        settlement.halt(id);
        vm.prank(spender);
        vm.expectRevert(ClosureNote.Halted.selector);
        ClosureNote(up).transferFrom(address(this), spender, 50);
    }

    function test_transferResumesAfterFinalize() public {
        (bytes32 id, address up,) = _createDefault();
        _fund(address(this), 1_000_000);
        vault.mintPair(id, 1_000_000, address(this));
        _finalizeAt(id, PRICE);
        address other = makeAddr("other");
        assertTrue(ClosureNote(up).transfer(other, 1));
    }
}
