// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {KuruListingAdapter} from "../src/kuru/KuruListingAdapter.sol";
import {IKuruOrderBook} from "../src/interfaces/IKuruOrderBook.sol";

/// @notice Mints a passive band on a bound Closure Note book.
/// @dev Reverts while the listing is unbound. Does not deploy a book.
contract SeedPassive is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        KuruListingAdapter adapter = KuruListingAdapter(vm.envAddress("LISTING_ADAPTER"));
        bytes32 marketId = vm.envBytes32("MARKET_ID");
        uint40 userId = uint40(vm.envUint("USER_ID"));
        uint32 lowPrice = uint32(vm.envUint("LOW_PRICE"));
        uint256 baseAmount = vm.envUint("BASE_AMOUNT");
        uint256 quoteAmount = vm.envUint("QUOTE_AMOUNT");
        uint256 minShares = vm.envOr("MIN_SHARES", uint256(0));
        uint256 deadline = vm.envOr("DEADLINE", block.timestamp + 1 hours);
        bool dn = keccak256(bytes(vm.envOr("LEG", string("up")))) == keccak256("dn");

        (address bookUp, address bookDn) = adapter.requireBound(marketId);
        address book = dn ? bookDn : bookUp;

        vm.startBroadcast(pk);
        (uint256 positionId, uint256 shares) = IKuruOrderBook(book).mintPassiveLiquidity(
            userId, lowPrice, baseAmount, quoteAmount, minShares, deadline
        );
        vm.stopBroadcast();

        console2.log("book", book);
        console2.log("positionId", positionId);
        console2.log("shares", shares);
    }
}
