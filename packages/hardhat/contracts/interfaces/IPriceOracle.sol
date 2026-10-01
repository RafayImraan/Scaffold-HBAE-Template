// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

struct PriceData {
    bytes32 pairKey;
    uint256 priceE18;
    uint256 updatedAt;
}

interface IPriceOracle {
    function latestPrice(bytes32 pairKey) external view returns (PriceData memory);
}
