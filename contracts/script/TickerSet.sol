// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ClosureMarketFactory} from "../src/core/ClosureMarketFactory.sol";
import {PolicyAdapter} from "../src/access/PolicyAdapter.sol";

/// @notice First five names with Equity.US session feeds. GOOG stays in the feed file until the set grows.
library TickerSet {
    function tickers() internal pure returns (string[5] memory names) {
        names = ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN"];
    }

    /// @dev Four symmetric caps, then 10/25 and 25/10.
    function caps() internal pure returns (uint64[6] memory kUp, uint64[6] memory kDn) {
        kUp = [uint64(5e16), 1e17, 15e16, 25e16, 1e17, 25e16];
        kDn = [uint64(5e16), 1e17, 15e16, 25e16, 25e16, 1e17];
    }

    function allowTiers(
        ClosureMarketFactory factory
    ) internal {
        (uint64[6] memory kUp, uint64[6] memory kDn) = caps();
        for (uint256 i; i < kUp.length; ++i) {
            factory.setTier(kUp[i], kDn[i], true);
        }
    }

    /// @dev Caller must own the factory and the policy. The session must still be before close.
    function openMarkets(
        ClosureMarketFactory factory,
        PolicyAdapter policy,
        address collateral,
        uint64 sessionId
    ) internal returns (uint256 opened) {
        allowTiers(factory);
        (uint64[6] memory kUp, uint64[6] memory kDn) = caps();
        string[5] memory names = tickers();
        for (uint256 t; t < names.length; ++t) {
            bytes32 ticker = keccak256(bytes(names[t]));
            for (uint256 c; c < kUp.length; ++c) {
                (bytes32 id,,) = factory.createMarket(ticker, sessionId, kUp[c], kDn[c], collateral);
                policy.allowMarket(id, sessionId, true);
                opened += 1;
            }
        }
    }
}
