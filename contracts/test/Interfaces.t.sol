// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IKuruAccountCore} from "../src/interfaces/IKuruAccountCore.sol";
import {IKuruOrderBook} from "../src/interfaces/IKuruOrderBook.sol";
import {IKuruSpotRouter} from "../src/interfaces/IKuruSpotRouter.sol";
import {IPyth} from "../src/interfaces/IPyth.sol";

contract InterfacesTest {
    function test_interfaceIds() public pure {
        require(type(IKuruAccountCore).interfaceId != bytes4(0), "account");
        require(type(IKuruOrderBook).interfaceId != bytes4(0), "book");
        require(type(IKuruSpotRouter).interfaceId != bytes4(0), "router");
        require(type(IPyth).interfaceId != bytes4(0), "pyth");
    }
}
