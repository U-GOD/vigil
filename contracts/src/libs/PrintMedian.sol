// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Median of at most five prices. Even counts take the lower-middle value.
library PrintMedian {
    function median(uint256[5] memory prices, uint8 n) internal pure returns (uint256) {
        uint256[5] memory sorted;
        for (uint8 i; i < n; ++i) {
            sorted[i] = prices[i];
        }
        for (uint8 i = 1; i < n; ++i) {
            uint256 key = sorted[i];
            uint8 j = i;
            while (j > 0 && sorted[j - 1] > key) {
                sorted[j] = sorted[j - 1];
                unchecked {
                    --j;
                }
            }
            sorted[j] = key;
        }
        if (n % 2 == 0) return sorted[n / 2 - 1];
        return sorted[n / 2];
    }
}
