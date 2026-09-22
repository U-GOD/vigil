// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Fixture} from "./helpers/Fixture.sol";
import {ClosureMarketFactory} from "../src/core/ClosureMarketFactory.sol";
import {ClosureMath} from "../src/libs/ClosureMath.sol";
import {ISettlement} from "../src/interfaces/ISettlement.sol";

contract ClosureMarketFactoryTest is Fixture {
    receive() external payable {}

    function test_predictMatchesCreate() public {
        (bytes32 predId, address predUp, address predDn) =
            factory.predictNotes(TICKER, SESSION, K10, K10, address(usdc));
        (bytes32 id, address up, address dn) = _createDefault();
        assertEq(id, predId);
        assertEq(up, predUp);
        assertEq(dn, predDn);
        assertEq(id, ClosureMath.marketId(TICKER, SESSION, K10, K10, address(usdc)));
    }

    function test_revertDuplicateMarket() public {
        _createDefault();
        vm.expectRevert(ClosureMarketFactory.MarketExists.selector);
        factory.createMarket(TICKER, SESSION, K10, K10, address(usdc));
    }

    function test_revertWrongBond() public {
        factory.setCreationBond(1 ether);
        vm.expectRevert(ClosureMarketFactory.WrongBond.selector);
        factory.createMarket{value: 0}(TICKER, SESSION, K10, K10, address(usdc));
    }

    function test_bondRefundedOnSettle() public {
        factory.setCreationBond(1 ether);
        uint256 before = address(this).balance;
        (bytes32 id,,) =
            factory.createMarket{value: 1 ether}(TICKER, SESSION, K10, K10, address(usdc));
        assertEq(address(this).balance, before - 1 ether);
        _finalizeAt(id, PRICE);
        assertEq(address(this).balance, before);
        (, ISettlement.State state) = settlement.settlementOf(id);
        assertEq(uint256(state), uint256(ISettlement.State.Finalized));
    }

    function test_forfeitUntradedAfterDeadline() public {
        factory.setCreationBond(1 ether);
        (bytes32 id,,) =
            factory.createMarket{value: 1 ether}(TICKER, SESSION, K10, K10, address(usdc));
        vm.expectRevert(ClosureMarketFactory.StillLive.selector);
        factory.forfeitBond(id);
        _warpFallback();
        uint256 sinkBefore = feeSink.balance;
        factory.forfeitBond(id);
        assertEq(feeSink.balance - sinkBefore, 1 ether);
    }

    function test_revertForfeitIfTraded() public {
        factory.setCreationBond(1 ether);
        (bytes32 id,,) =
            factory.createMarket{value: 1 ether}(TICKER, SESSION, K10, K10, address(usdc));
        _fund(address(this), 1_000_000);
        vault.mintPair(id, 1_000_000, address(this));
        _warpFallback();
        vm.expectRevert(ClosureMarketFactory.MarketTraded.selector);
        factory.forfeitBond(id);
    }

    function test_revertUnknownSession() public {
        vm.expectRevert(ClosureMarketFactory.SessionNotOpen.selector);
        factory.createMarket(TICKER, 99, K10, K10, address(usdc));
    }

    function test_onSettledOnlyFromSettlement() public {
        vm.expectRevert(ClosureMarketFactory.NotSettlement.selector);
        factory.onSettled(bytes32(uint256(1)));
    }
}
