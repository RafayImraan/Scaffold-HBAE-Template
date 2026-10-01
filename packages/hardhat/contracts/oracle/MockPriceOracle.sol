// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IPriceOracle, PriceData } from "../interfaces/IPriceOracle.sol";

/// @title MockPriceOracle
/// @notice Local/test stand-in for a price feed: caller-controlled price and
/// timestamp, plus a revert switch so tests can prove errors bubble unchanged.
contract MockPriceOracle is IPriceOracle {
    error MockOracleDown();

    bytes32 public constant PAIR_HBAR_USD = keccak256("HBAR/USD");

    uint256 public priceE18;
    uint256 public updatedAt;
    bool public revertOnRead;

    constructor(uint256 initialPriceE18) {
        priceE18 = initialPriceE18;
        updatedAt = block.timestamp;
    }

    function setPrice(uint256 newPriceE18) external {
        priceE18 = newPriceE18;
    }

    function setUpdatedAt(uint256 newUpdatedAt) external {
        updatedAt = newUpdatedAt;
    }

    function setRevertOnRead(bool shouldRevert) external {
        revertOnRead = shouldRevert;
    }

    function latestPrice(bytes32) external view returns (PriceData memory) {
        if (revertOnRead) revert MockOracleDown();
        return PriceData({ pairKey: PAIR_HBAR_USD, priceE18: priceE18, updatedAt: updatedAt });
    }
}
