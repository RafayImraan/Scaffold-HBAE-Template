// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Committee } from "./Committee.sol";

/// @title CommitteeFactory
/// @notice Creates Committee instances with shared configuration. The immutable
/// `unitsPerHbar` comes from the chain id in the deploy script (1e8 on Hedera,
/// 1e18 on local Hardhat) and seeds every committee's unit conversion.
contract CommitteeFactory {
    error InvalidConfig(bytes32 param);
    error ReserveTooLow(uint256 required, uint256 sent);
    error ZeroAddress();

    event CommitteeCreated(
        uint256 indexed index,
        address indexed committee,
        address indexed creator,
        uint256 usdAmountPerRound,
        uint8 maxMembers,
        uint256 roundDuration,
        uint256 maxPriceAge
    );

    bytes32 public constant PAIR_KEY = keccak256("HBAR/USD");

    address public immutable oracle;
    address public immutable scheduleService;
    bool public immutable hssEnabled;
    uint256 public immutable unitsPerHbar;

    address[] private _committees;

    constructor(address oracle_, address scheduleService_, bool hssEnabled_, uint256 unitsPerHbar_) {
        if (oracle_ == address(0)) revert ZeroAddress();
        if (unitsPerHbar_ != 1e8 && unitsPerHbar_ != 1e18) revert InvalidConfig("unitsPerHbar");
        oracle = oracle_;
        scheduleService = scheduleService_;
        hssEnabled = hssEnabled_;
        unitsPerHbar = unitsPerHbar_;
    }

    /// @notice HSS fees are paid from the committee's own balance, so every
    /// committee starts with a float that is never part of the pot (0.5 HBAR).
    function minReserve() public view returns (uint256) {
        return unitsPerHbar / 2;
    }

    function createCommittee(
        uint256 usdAmountPerRound,
        uint8 maxMembers,
        uint256 roundDuration,
        uint256 maxPriceAge
    ) external payable returns (address committee) {
        if (usdAmountPerRound < 1e6 || usdAmountPerRound > 1e9) revert InvalidConfig("usdAmountPerRound");
        if (maxMembers < 2 || maxMembers > 10) revert InvalidConfig("maxMembers");
        if (roundDuration < 300 || roundDuration > 30 days) revert InvalidConfig("roundDuration");
        if (maxPriceAge < 60 || maxPriceAge > 7 days) revert InvalidConfig("maxPriceAge");

        uint256 required = minReserve();
        if (msg.value < required) revert ReserveTooLow(required, msg.value);

        committee = address(
            new Committee{ value: msg.value }(
                msg.sender,
                oracle,
                PAIR_KEY,
                scheduleService,
                hssEnabled,
                unitsPerHbar,
                usdAmountPerRound,
                maxMembers,
                roundDuration,
                maxPriceAge
            )
        );
        _committees.push(committee);
        emit CommitteeCreated(
            _committees.length - 1,
            committee,
            msg.sender,
            usdAmountPerRound,
            maxMembers,
            roundDuration,
            maxPriceAge
        );
    }

    function getCommittees() external view returns (address[] memory) {
        return _committees;
    }
}
