// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IBondRefund {
    function onSettled(
        bytes32 marketId
    ) external;
}
