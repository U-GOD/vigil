// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {
    IMarketCollateral, INotePair, KuruListingAdapter
} from "../src/kuru/KuruListingAdapter.sol";
import {IKuruAccountCore} from "../src/interfaces/IKuruAccountCore.sol";
import {IKuruSpotRouter} from "../src/interfaces/IKuruSpotRouter.sol";

/// @notice Deploys the listing adapter. It does not create Kuru markets.
contract DeployListing is Script {
    address internal constant ROUTER = 0xba24a1042701f06e8F7edCF04389260D1Fa4c697;
    address internal constant CORE = 0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        INotePair factory = INotePair(vm.envAddress("FACTORY"));
        IMarketCollateral vault = IMarketCollateral(vm.envAddress("VAULT"));
        IKuruSpotRouter router = IKuruSpotRouter(vm.envOr("KURU_SPOT_ROUTER", ROUTER));
        IKuruAccountCore core = IKuruAccountCore(vm.envOr("KURU_ACCOUNT_CORE", CORE));

        vm.startBroadcast(pk);
        KuruListingAdapter adapter =
            new KuruListingAdapter(vm.addr(pk), factory, vault, router, core);
        vm.stopBroadcast();

        console2.log("listingAdapter", address(adapter));
    }
}
