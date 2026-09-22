// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {ClosureMath} from "../src/libs/ClosureMath.sol";

contract VectorsTest is Test {
    using stdJson for string;

    function test_sharedSplitUpVectors() public view {
        string memory raw = vm.readFile(
            string.concat(vm.projectRoot(), "/../packages/sdk/test/vectors/splitUp.json")
        );
        uint256 n = 10;
        for (uint256 i = 0; i < n; ++i) {
            string memory p = string.concat(".[", vm.toString(i), "]");
            uint256 pClose = vm.parseUint(raw.readString(string.concat(p, ".pClose")));
            uint256 pOpen = vm.parseUint(raw.readString(string.concat(p, ".pOpen")));
            uint256 adj = vm.parseUint(raw.readString(string.concat(p, ".adj")));
            uint256 kUp = vm.parseUint(raw.readString(string.concat(p, ".kUp")));
            uint256 kDn = vm.parseUint(raw.readString(string.concat(p, ".kDn")));
            uint256 expected = vm.parseUint(raw.readString(string.concat(p, ".sUp")));
            assertEq(ClosureMath.splitUp(pClose, pOpen, adj, kUp, kDn), expected);
        }
    }

    function test_sharedGeneratedVectors() public view {
        string memory raw = vm.readFile(
            string.concat(vm.projectRoot(), "/../packages/sdk/test/vectors/splitUp.generated.json")
        );
        uint256 n = vm.parseUint(raw.readString(".count"));
        for (uint256 i = 0; i < n; ++i) {
            string memory p = string.concat(".cases[", vm.toString(i), "]");
            uint256 pClose = vm.parseUint(raw.readString(string.concat(p, ".pClose")));
            uint256 pOpen = vm.parseUint(raw.readString(string.concat(p, ".pOpen")));
            uint256 adj = vm.parseUint(raw.readString(string.concat(p, ".adj")));
            uint256 kUp = vm.parseUint(raw.readString(string.concat(p, ".kUp")));
            uint256 kDn = vm.parseUint(raw.readString(string.concat(p, ".kDn")));
            uint256 expected = vm.parseUint(raw.readString(string.concat(p, ".sUp")));
            assertEq(ClosureMath.splitUp(pClose, pOpen, adj, kUp, kDn), expected);
        }
    }
}
