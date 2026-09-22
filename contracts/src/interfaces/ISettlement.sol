// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISettlement {
    enum State {
        Unset,
        Trading,
        Halted,
        Finalized,
        FallbackFinalized
    }

    function isHalted(
        bytes32 marketId
    ) external view returns (bool);

    function stateOf(
        bytes32 marketId
    ) external view returns (State);

    function settlementOf(
        bytes32 marketId
    ) external view returns (uint256 sUp, State state);
}
