// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ping} from "../src/util/Ping.sol";

contract PingTest {
    function test_ping() public {
        Ping ping = new Ping();
        require(ping.ping() == keccak256("vigil"), "ping");
        require(keccak256(bytes(ping.VERSION())) == keccak256(bytes("phase-1")), "version");
    }
}
