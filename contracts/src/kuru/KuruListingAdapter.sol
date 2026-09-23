// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IKuruAccountCore} from "../interfaces/IKuruAccountCore.sol";
import {IKuruOrderBook} from "../interfaces/IKuruOrderBook.sol";
import {IKuruSpotRouter} from "../interfaces/IKuruSpotRouter.sol";

/// @dev Matches `ClosureMarketFactory.noteUpOf` / `noteDnOf`.
interface INotePair {
    function noteUpOf(
        bytes32 marketId
    ) external view returns (address);
    function noteDnOf(
        bytes32 marketId
    ) external view returns (address);
}

/// @dev Matches the public `ClosureVault.markets` getter.
interface IMarketCollateral {
    function markets(
        bytes32 marketId
    )
        external
        view
        returns (
            address noteUp,
            address noteDn,
            address collateral,
            uint256 collateralHeld,
            uint256 cumulativeMinted,
            bool registered
        );
}

/// @notice Records a Closure Note listing and binds it once Kuru has registered the books.
/// @dev This contract never calls a market-creation function. `getMarketParams` omits
///      `passiveSpreadTicks`, so that field is checked by `SpotRouter.computeAddress`
///      returning the book. `baseSizeMultiplier` is read from the book. Every compared
///      field must match. There is no allowed delta.
contract KuruListingAdapter is Ownable {
    error ZeroAddress();
    error BadSpec();
    error UnknownMarket();
    error InconsistentMarket();
    error AlreadyRequested();
    error AlreadyBound();
    error NotBound();
    error SameBook();
    error Unverified();
    error TokenMismatch();
    error SpecMismatch();

    struct BookSpec {
        uint32 pricePrecision;
        uint96 sizePrecision;
        uint32 tickSize;
        uint32 passiveSpreadTicks;
        uint96 minQuoteNotional;
        uint96 maxQuoteNotional;
        uint256 takerFeePps;
        uint256 makerFeePps;
        uint256 baseSizeMultiplier;
    }

    struct Listing {
        address up;
        address dn;
        address collateral;
        BookSpec spec;
        bytes32 specHash;
        address bookUp;
        address bookDn;
        bool requested;
        bool bound;
    }

    INotePair public immutable factory;
    IMarketCollateral public immutable vault;
    IKuruSpotRouter public immutable router;
    IKuruAccountCore public immutable accountCore;

    mapping(bytes32 marketId => Listing) public listings;

    event ListingRequested(
        bytes32 indexed marketId, address up, address dn, address collateral, bytes32 specHash
    );
    event ListingCancelled(bytes32 indexed marketId);
    event ListingBound(bytes32 indexed marketId, address bookUp, address bookDn);

    constructor(
        address owner_,
        INotePair factory_,
        IMarketCollateral vault_,
        IKuruSpotRouter router_,
        IKuruAccountCore accountCore_
    ) Ownable(owner_) {
        if (
            address(factory_) == address(0) || address(vault_) == address(0)
                || address(router_) == address(0) || address(accountCore_) == address(0)
        ) revert ZeroAddress();
        factory = factory_;
        vault = vault_;
        router = router_;
        accountCore = accountCore_;
    }

    function requestListing(bytes32 marketId, BookSpec calldata spec) external onlyOwner {
        _validateSpec(spec);
        if (listings[marketId].requested) revert AlreadyRequested();

        address up = factory.noteUpOf(marketId);
        address dn = factory.noteDnOf(marketId);
        (address vaultUp, address vaultDn, address collateral,,, bool registered) =
            vault.markets(marketId);
        if (!registered || up == address(0) || dn == address(0) || collateral == address(0)) {
            revert UnknownMarket();
        }
        if (up != vaultUp || dn != vaultDn) revert InconsistentMarket();

        bytes32 specHash = hashSpec(spec);
        Listing storage listing = listings[marketId];
        listing.up = up;
        listing.dn = dn;
        listing.collateral = collateral;
        listing.spec = spec;
        listing.specHash = specHash;
        listing.requested = true;

        emit ListingRequested(marketId, up, dn, collateral, specHash);
    }

    function cancelRequest(
        bytes32 marketId
    ) external onlyOwner {
        Listing storage listing = listings[marketId];
        if (!listing.requested) revert UnknownMarket();
        if (listing.bound) revert AlreadyBound();
        delete listings[marketId];
        emit ListingCancelled(marketId);
    }

    /// @notice Permissioned bind after Kuru has registered both books. Does not deploy them.
    function bindListing(bytes32 marketId, address bookUp, address bookDn) external onlyOwner {
        Listing storage listing = listings[marketId];
        if (!listing.requested) revert UnknownMarket();
        if (listing.bound) revert AlreadyBound();
        if (bookUp == address(0) || bookDn == address(0)) revert ZeroAddress();
        if (bookUp == bookDn) revert SameBook();

        _checkBook(bookUp, listing.up, listing.collateral, listing.spec);
        _checkBook(bookDn, listing.dn, listing.collateral, listing.spec);

        listing.bookUp = bookUp;
        listing.bookDn = bookDn;
        listing.bound = true;
        emit ListingBound(marketId, bookUp, bookDn);
    }

    function getListing(
        bytes32 marketId
    ) external view returns (Listing memory) {
        return listings[marketId];
    }

    function isBound(
        bytes32 marketId
    ) external view returns (bool) {
        return listings[marketId].bound;
    }

    /// @notice Keepers and the plugin must call this before any order on the market.
    function requireBound(
        bytes32 marketId
    ) external view returns (address bookUp, address bookDn) {
        Listing storage listing = listings[marketId];
        if (!listing.bound) revert NotBound();
        return (listing.bookUp, listing.bookDn);
    }

    function hashSpec(
        BookSpec memory spec
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(spec));
    }

    function _validateSpec(
        BookSpec calldata spec
    ) internal pure {
        if (
            spec.pricePrecision == 0 || spec.sizePrecision == 0 || spec.tickSize == 0
                || spec.baseSizeMultiplier == 0 || spec.maxQuoteNotional < spec.minQuoteNotional
        ) revert BadSpec();
    }

    function _checkBook(
        address book,
        address base,
        address quote,
        BookSpec memory spec
    ) internal view {
        if (!router.verifiedSpotMarket(book) || !accountCore.verifiedSpotOrderBook(book)) {
            revert Unverified();
        }
        IKuruOrderBook orderBook = IKuruOrderBook(book);
        if (orderBook.baseToken() != base || orderBook.quoteToken() != quote) {
            revert TokenMismatch();
        }
        if (orderBook.baseSizeMultiplier() != spec.baseSizeMultiplier) revert SpecMismatch();
        _matchMarketParams(orderBook, spec);
        if (_predicted(base, quote, spec) != book) revert SpecMismatch();
    }

    function _matchMarketParams(IKuruOrderBook orderBook, BookSpec memory spec) internal view {
        (
            uint32 pricePrecision,
            uint32 sizePrecision,
            uint32 tickSize,
            uint96 minQuoteNotional,
            uint96 maxQuoteNotional,
            uint256 takerFeePps,
            uint256 makerFeePps
        ) = orderBook.getMarketParams();
        if (spec.sizePrecision > type(uint32).max) revert SpecMismatch();
        if (
            pricePrecision != spec.pricePrecision || sizePrecision != uint32(spec.sizePrecision)
                || tickSize != spec.tickSize || minQuoteNotional != spec.minQuoteNotional
                || maxQuoteNotional != spec.maxQuoteNotional || takerFeePps != spec.takerFeePps
                || makerFeePps != spec.makerFeePps
        ) revert SpecMismatch();
    }

    function _predicted(
        address base,
        address quote,
        BookSpec memory spec
    ) internal view returns (address) {
        return router.computeAddress(
            base,
            quote,
            spec.sizePrecision,
            spec.pricePrecision,
            spec.tickSize,
            spec.passiveSpreadTicks,
            spec.minQuoteNotional,
            spec.maxQuoteNotional,
            spec.takerFeePps,
            spec.makerFeePps
        );
    }
}
