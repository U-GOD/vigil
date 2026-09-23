// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";
import {
    IMarketCollateral, INotePair, KuruListingAdapter
} from "../src/kuru/KuruListingAdapter.sol";
import {IKuruAccountCore} from "../src/interfaces/IKuruAccountCore.sol";
import {IKuruOrderBook} from "../src/interfaces/IKuruOrderBook.sol";
import {IKuruSpotRouter} from "../src/interfaces/IKuruSpotRouter.sol";
import {Fixture} from "./helpers/Fixture.sol";

interface ITestnetFaucet {
    function claim() external;
}

contract RevertRouter {
    fallback() external payable {
        revert("router touched");
    }
}

contract MockRouter {
    mapping(address market => bool) public verified;
    mapping(address base => address book) public bookOf;

    function setVerified(address market, bool ok) external {
        verified[market] = ok;
    }

    function setBook(address base, address book) external {
        bookOf[base] = book;
    }

    function verifiedSpotMarket(
        address market
    ) external view returns (bool) {
        return verified[market];
    }

    function computeAddress(
        address baseToken,
        address,
        uint96,
        uint32,
        uint32,
        uint32 passiveSpreadTicks,
        uint96,
        uint96,
        uint256,
        uint256
    ) external view returns (address) {
        if (passiveSpreadTicks != 50) return address(0);
        return bookOf[baseToken];
    }
}

contract MockCore {
    mapping(address market => bool) public verified;

    function setVerified(address market, bool ok) external {
        verified[market] = ok;
    }

    function verifiedSpotOrderBook(
        address market
    ) external view returns (bool) {
        return verified[market];
    }
}

contract MockBook {
    address public baseToken;
    address public quoteToken;
    uint256 public baseSizeMultiplier = 1;
    uint32 public tickSize = 100;

    constructor(address base, address quote) {
        baseToken = base;
        quoteToken = quote;
    }

    function setTick(
        uint32 tick
    ) external {
        tickSize = tick;
    }

    function setMultiplier(
        uint256 multiplier
    ) external {
        baseSizeMultiplier = multiplier;
    }

    function getMarketParams()
        external
        view
        returns (
            uint32 pricePrecision,
            uint32 sizePrecision,
            uint32 tick,
            uint96 minQuoteNotional,
            uint96 maxQuoteNotional,
            uint256 takerFeePps,
            uint256 makerFeePps
        )
    {
        return (1_000_000, 1_000_000, tickSize, 10_000_000, 5_000_000_000_000, 7000, 4000);
    }
}

contract ListingAdapterTest is Fixture {
    KuruListingAdapter internal adapter;
    MockRouter internal router;
    MockCore internal core;
    MockBook internal bookUp;
    MockBook internal bookDn;

    function setUp() public override {
        super.setUp();
        router = new MockRouter();
        core = new MockCore();
        adapter = new KuruListingAdapter(
            address(this),
            INotePair(address(factory)),
            IMarketCollateral(address(vault)),
            IKuruSpotRouter(address(router)),
            IKuruAccountCore(address(core))
        );
    }

    function test_requestDoesNotTouchRouter() public {
        (bytes32 id,,) = _createDefault();
        KuruListingAdapter isolated = new KuruListingAdapter(
            address(this),
            INotePair(address(factory)),
            IMarketCollateral(address(vault)),
            IKuruSpotRouter(address(new RevertRouter())),
            IKuruAccountCore(address(core))
        );
        isolated.requestListing(id, _spec());
        KuruListingAdapter.Listing memory listing = isolated.getListing(id);
        assertTrue(listing.requested);
        assertFalse(listing.bound);
        assertEq(listing.specHash, isolated.hashSpec(_spec()));
    }

    function test_bindChecksRegistryAndSpec() public {
        (bytes32 id, address up, address dn) = _createDefault();
        adapter.requestListing(id, _spec());
        _arm(up, dn);

        adapter.bindListing(id, address(bookUp), address(bookDn));
        (address boundUp, address boundDn) = adapter.requireBound(id);
        assertEq(boundUp, address(bookUp));
        assertEq(boundDn, address(bookDn));
        assertTrue(adapter.isBound(id));
    }

    function test_unboundMarketCannotTrade() public {
        (bytes32 id,,) = _createDefault();
        vm.expectRevert(KuruListingAdapter.NotBound.selector);
        adapter.requireBound(id);
    }

    function test_bindRevertsWhenUnverified() public {
        (bytes32 id, address up, address dn) = _createDefault();
        adapter.requestListing(id, _spec());
        _arm(up, dn);
        router.setVerified(address(bookUp), false);
        vm.expectRevert(KuruListingAdapter.Unverified.selector);
        adapter.bindListing(id, address(bookUp), address(bookDn));
    }

    function test_bindRevertsOnTickMismatch() public {
        (bytes32 id, address up, address dn) = _createDefault();
        adapter.requestListing(id, _spec());
        _arm(up, dn);
        bookUp.setTick(200);
        vm.expectRevert(KuruListingAdapter.SpecMismatch.selector);
        adapter.bindListing(id, address(bookUp), address(bookDn));
    }

    function test_bindRevertsWhenPassiveSpreadDiffers() public {
        (bytes32 id, address up, address dn) = _createDefault();
        KuruListingAdapter.BookSpec memory spec = _spec();
        spec.passiveSpreadTicks = 40;
        adapter.requestListing(id, spec);
        _arm(up, dn);
        vm.expectRevert(KuruListingAdapter.SpecMismatch.selector);
        adapter.bindListing(id, address(bookUp), address(bookDn));
    }

    function test_bindRevertsOnWrongBase() public {
        (bytes32 id, address up, address dn) = _createDefault();
        adapter.requestListing(id, _spec());
        _arm(up, dn);
        bookUp = new MockBook(address(0xBEEF), address(usdc));
        router.setBook(up, address(bookUp));
        router.setVerified(address(bookUp), true);
        core.setVerified(address(bookUp), true);
        vm.expectRevert(KuruListingAdapter.TokenMismatch.selector);
        adapter.bindListing(id, address(bookUp), address(bookDn));
    }

    function test_sameBookRejected() public {
        (bytes32 id, address up, address dn) = _createDefault();
        adapter.requestListing(id, _spec());
        _arm(up, dn);
        vm.expectRevert(KuruListingAdapter.SameBook.selector);
        adapter.bindListing(id, address(bookUp), address(bookUp));
    }

    function test_cancelAllowsANewSpec() public {
        (bytes32 id,,) = _createDefault();
        adapter.requestListing(id, _spec());
        adapter.cancelRequest(id);
        KuruListingAdapter.BookSpec memory spec = _spec();
        spec.tickSize = 200;
        adapter.requestListing(id, spec);
        assertEq(adapter.getListing(id).specHash, adapter.hashSpec(spec));
    }

    function test_strangerCannotRequest() public {
        (bytes32 id,,) = _createDefault();
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        adapter.requestListing(id, _spec());
    }

    function test_faucetClaimSelector() public pure {
        assertEq(ITestnetFaucet.claim.selector, bytes4(hex"4e71d92d"));
    }

    function test_monUsdcBookIsVerified() public {
        string memory url;
        try this.rpcUrl() returns (string memory got) {
            url = got;
        } catch {
            vm.skip(true);
            return;
        }
        if (bytes(url).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(url);

        address monUsdc = 0xfdbE356828c8f5A5d5ed4f69ddE0816f4058Ef61;
        IKuruSpotRouter liveRouter = IKuruSpotRouter(0xba24a1042701f06e8F7edCF04389260D1Fa4c697);
        IKuruAccountCore liveCore = IKuruAccountCore(0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22);
        assertTrue(liveRouter.verifiedSpotMarket(monUsdc));
        assertTrue(liveCore.verifiedSpotOrderBook(monUsdc));

        IKuruOrderBook book = IKuruOrderBook(monUsdc);
        assertEq(book.baseToken(), address(0));
        assertEq(book.quoteToken(), 0xEe0722ead54f1B4fe97bE399Be43BC0226a6f97E);
        (
            uint32 pricePrecision,
            uint32 sizePrecision,
            uint32 tickSize,
            uint96 minQuote,
            uint96 maxQuote,
            uint256 taker,
            uint256 maker
        ) = book.getMarketParams();
        assertEq(pricePrecision, 1_000_000);
        assertEq(sizePrecision, 100_000_000);
        assertEq(tickSize, 1);
        assertEq(minQuote, 10_000_000);
        assertEq(maxQuote, 5_000_000_000_000);
        assertEq(taker, 7000);
        assertEq(maker, 4000);
    }

    function rpcUrl() external view returns (string memory) {
        return vm.rpcUrl("monad_testnet");
    }

    function _arm(address up, address dn) internal {
        bookUp = new MockBook(up, address(usdc));
        bookDn = new MockBook(dn, address(usdc));
        router.setBook(up, address(bookUp));
        router.setBook(dn, address(bookDn));
        router.setVerified(address(bookUp), true);
        router.setVerified(address(bookDn), true);
        core.setVerified(address(bookUp), true);
        core.setVerified(address(bookDn), true);
    }

    function _spec() internal pure returns (KuruListingAdapter.BookSpec memory) {
        return KuruListingAdapter.BookSpec({
            pricePrecision: 1_000_000,
            sizePrecision: 1_000_000,
            tickSize: 100,
            passiveSpreadTicks: 50,
            minQuoteNotional: 10_000_000,
            maxQuoteNotional: 5_000_000_000_000,
            takerFeePps: 7000,
            makerFeePps: 4000,
            baseSizeMultiplier: 1
        });
    }
}
