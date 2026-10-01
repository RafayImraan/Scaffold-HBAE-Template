// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IAggregatorV3 } from "../interfaces/IAggregatorV3.sol";
import { IPriceOracle, PriceData } from "../interfaces/IPriceOracle.sol";

/// @title ChainlinkHbarUsdAdapter
/// @notice Normalizes a Chainlink HBAR/USD Data Feed round to `priceE18`
/// (USD per HBAR scaled by 1e18) behind the single-pair IPriceOracle interface
/// the committee consumes.
contract ChainlinkHbarUsdAdapter is IPriceOracle {
    error OracleUnsupportedPair(bytes32 pairKey);
    error OracleIncompleteRound(uint80 roundId, uint80 answeredInRound);
    error OracleInvalidPrice();
    error OracleStalePrice(uint256 updatedAt, uint256 maxAge);
    error ZeroAddress();

    bytes32 public constant PAIR_HBAR_USD = keccak256("HBAR/USD");

    IAggregatorV3 public immutable feed;
    uint8 public immutable feedDecimals;
    uint256 public immutable maxPriceAge;

    constructor(address feed_, uint256 maxPriceAge_) {
        if (feed_ == address(0)) revert ZeroAddress();
        feed = IAggregatorV3(feed_);
        feedDecimals = IAggregatorV3(feed_).decimals();
        maxPriceAge = maxPriceAge_;
    }

    function latestPrice(bytes32 pairKey_) external view returns (PriceData memory) {
        if (pairKey_ != PAIR_HBAR_USD) revert OracleUnsupportedPair(pairKey_);

        (uint80 roundId, int256 answer, , uint256 updatedAt, uint80 answeredInRound) = feed.latestRoundData();
        if (answeredInRound < roundId) revert OracleIncompleteRound(roundId, answeredInRound);
        if (updatedAt == 0) revert OracleStalePrice(0, maxPriceAge);
        if (answer <= 0) revert OracleInvalidPrice();
        if (block.timestamp - updatedAt > maxPriceAge) revert OracleStalePrice(updatedAt, maxPriceAge);

        uint256 priceE18 = feedDecimals <= 18
            ? uint256(answer) * 10 ** (18 - feedDecimals)
            : uint256(answer) / 10 ** (feedDecimals - 18);
        return PriceData({ pairKey: pairKey_, priceE18: priceE18, updatedAt: updatedAt });
    }
}
