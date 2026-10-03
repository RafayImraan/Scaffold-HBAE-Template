// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IPriceOracle, PriceData } from "./interfaces/IPriceOracle.sol";
import { IHederaScheduleService } from "./interfaces/IHederaScheduleService.sol";

/// @title Committee
/// @notice USD-denominated digital ROSCA (committee): `maxMembers` people each
/// contribute a fixed USD amount every `roundDuration`; each round the pot goes
/// to the next member in join order. The USD amount is converted to native value
/// at contribution time through a price oracle, so HBAR volatility never changes
/// what members owe each other.
///
/// Units: `msg.value`, `pot` and payouts are chain-native EVM units -
/// tinybars (1 HBAR = 1e8) on Hedera, wei (1e18) on local Hardhat. The immutable
/// `unitsPerHbar` is set by the deploy script from the chain id; senders apply
/// `relayScale = 1e18 / unitsPerHbar` to the tx `value` field because the hashio
/// relay divides it before execution (measured - see docs/RESEARCH.md).
contract Committee is ReentrancyGuard {
    enum Status {
        Open,
        Active,
        Completed
    }

    error NotCreator();
    error NotOpen();
    error NotActive();
    error AlreadyMember();
    error NotMember();
    error CommitteeFull();
    error AlreadyContributed(uint256 round);
    error RoundClosed(uint256 roundEndsAt);
    error RoundNotEnded(uint256 roundEndsAt);
    error InsufficientContribution(uint256 required, uint256 sent);
    error ReserveTooLow(uint256 required, uint256 sent);
    error NotComplete();
    error InvalidConfig(bytes32 param);
    error ZeroAddress();
    error ZeroAmount();
    error InvalidPrice();
    error StalePrice(uint256 updatedAt, uint256 maxPriceAge);
    error NativeTransferFailed(address to);

    event MemberJoined(address indexed member, uint256 slot);
    event CommitteeStarted(uint256 round, uint256 roundEndsAt);
    event ContributionReceived(
        uint256 indexed round,
        address indexed member,
        uint256 priceE18,
        uint256 usdAmount,
        uint256 hbarWei,
        uint256 refundWei
    );
    event PayoutScheduled(address indexed schedule, uint256 executeAt);
    event PayoutScheduleFailed(int64 rc);
    event ScheduleSkipped();
    event RoundFinalized(
        uint256 indexed round,
        address indexed receiver,
        uint256 amount,
        uint256 contributors,
        uint256 missed
    );
    event CommitteeCompleted();
    event ReserveToppedUp(address indexed from, uint256 amount);
    event ReserveSwept(address indexed to, uint256 amount);

    int64 private constant HSS_SUCCESS = 22; // Hedera ResponseCodeEnum.SUCCESS
    uint256 private constant HSS_PAYOUT_GAS_LIMIT = 1_000_000;
    uint256 private constant HSS_SLOT_PROBES = 8;

    address public immutable creator;
    IPriceOracle public immutable oracle;
    bytes32 public immutable pairKey;
    address public immutable scheduleService;
    bool public immutable hssEnabled;
    uint256 public immutable unitsPerHbar;
    uint256 public immutable relayScale;
    uint256 public immutable usdAmountPerRound; // 1e-6 USD, e.g. 20_000_000 = $20.00
    uint8 public immutable maxMembers;
    uint256 public immutable roundDuration;
    uint256 public immutable maxPriceAge;

    Status public status;
    address[] public members;
    mapping(address => uint256) public memberIndex; // 1-based; 0 = not a member
    mapping(address => mapping(uint256 => bool)) public paidInRound;
    uint256 public round; // 1-based; 0 until the last member joins
    uint256 public roundEndsAt;
    uint256 public pot;
    uint256 public contributedThisRound;
    uint256 public contributorsThisRound;
    mapping(uint256 => bool) public roundPaid;
    address public pendingSchedule;

    constructor(
        address creator_,
        address oracle_,
        bytes32 pairKey_,
        address scheduleService_,
        bool hssEnabled_,
        uint256 unitsPerHbar_,
        uint256 usdAmountPerRound_,
        uint8 maxMembers_,
        uint256 roundDuration_,
        uint256 maxPriceAge_
    ) payable {
        if (creator_ == address(0) || oracle_ == address(0)) revert ZeroAddress();
        if (unitsPerHbar_ != 1e8 && unitsPerHbar_ != 1e18) revert InvalidConfig("unitsPerHbar");
        creator = creator_;
        oracle = IPriceOracle(oracle_);
        pairKey = pairKey_;
        scheduleService = scheduleService_;
        hssEnabled = hssEnabled_;
        unitsPerHbar = unitsPerHbar_;
        relayScale = 1e18 / unitsPerHbar_;
        usdAmountPerRound = usdAmountPerRound_;
        maxMembers = maxMembers_;
        roundDuration = roundDuration_;
        maxPriceAge = maxPriceAge_;
    }

    // --- membership ---

    /// @notice Join the committee; the round starts when the last slot fills.
    function join() external {
        if (status != Status.Open) revert NotOpen();
        if (memberIndex[msg.sender] != 0) revert AlreadyMember();
        if (members.length >= maxMembers) revert CommitteeFull();

        members.push(msg.sender);
        memberIndex[msg.sender] = members.length;
        emit MemberJoined(msg.sender, members.length);

        if (members.length == maxMembers) {
            status = Status.Active;
            round = 1;
            roundEndsAt = block.timestamp + roundDuration;
            emit CommitteeStarted(round, roundEndsAt);
            _schedulePayout();
        }
    }

    // --- contributions ---

    /// @notice Native amount currently owed for `usdAmountE6`, at the live price.
    function usdToNative(uint256 usdAmountE6) external view returns (uint256 required) {
        (required, , ) = _quote(usdAmountE6);
    }

    /// @notice This round's quote: required native amount, price and its timestamp.
    function quoteContribution() public view returns (uint256 required, uint256 priceE18, uint256 updatedAt) {
        return _quote(usdAmountPerRound);
    }

    /// @notice Pay this round's installment; overpayment is refunded in the same tx.
    function contribute() external payable nonReentrant {
        if (status != Status.Active) revert NotActive();
        if (memberIndex[msg.sender] == 0) revert NotMember();
        if (block.timestamp >= roundEndsAt) revert RoundClosed(roundEndsAt);
        if (paidInRound[msg.sender][round]) revert AlreadyContributed(round);

        (uint256 required, uint256 priceE18, ) = _quote(usdAmountPerRound);
        if (msg.value < required) revert InsufficientContribution(required, msg.value);

        paidInRound[msg.sender][round] = true;
        pot += required;
        contributedThisRound += required;
        contributorsThisRound += 1;

        uint256 refund = msg.value - required;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{ value: refund }("");
            if (!ok) revert NativeTransferFailed(msg.sender);
        }

        emit ContributionReceived(round, msg.sender, priceE18, usdAmountPerRound, required, refund);
    }

    // --- round lifecycle ---

    /// @notice Pay out the finished round and start the next one. Permissionless:
    /// this is both the HSS auto-executed call and the manual fallback.
    function finalizeRound() external nonReentrant {
        if (status != Status.Active) revert NotActive();
        if (block.timestamp < roundEndsAt) revert RoundNotEnded(roundEndsAt);

        uint256 finishedRound = round;
        address receiver = members[finishedRound - 1];
        uint256 amount = pot < address(this).balance ? pot : address(this).balance;
        uint256 contributors = contributorsThisRound;
        uint256 missed = members.length - contributors;

        pot = 0;
        contributorsThisRound = 0;
        contributedThisRound = 0;
        roundPaid[finishedRound] = true;

        if (pendingSchedule != address(0)) {
            // Our own schedule: delete is best-effort (a fresh round re-schedules anyway).
            try IHederaScheduleService(scheduleService).deleteSchedule(pendingSchedule) {} catch {}
            pendingSchedule = address(0);
        }

        bool lastRound = finishedRound == maxMembers;
        if (lastRound) {
            status = Status.Completed;
        } else {
            // Absolute, not += : a late or manual call must not shorten the next round.
            round = finishedRound + 1;
            roundEndsAt = block.timestamp + roundDuration;
            _schedulePayout();
        }

        if (amount > 0) {
            (bool ok, ) = receiver.call{ value: amount }("");
            if (!ok) revert NativeTransferFailed(receiver);
        }

        emit RoundFinalized(finishedRound, receiver, amount, contributors, missed);
        if (lastRound) emit CommitteeCompleted();
    }

    // --- HSS fee reserve ---

    /// @notice Top up the reserve HSS fees are paid from; never part of the pot.
    function topUpReserve() external payable {
        if (msg.value == 0) revert ZeroAmount();
        emit ReserveToppedUp(msg.sender, msg.value);
    }

    /// @notice Creator withdraws the remaining reserve once the committee completed.
    function sweepReserve() external nonReentrant {
        if (msg.sender != creator) revert NotCreator();
        if (status != Status.Completed) revert NotComplete();

        uint256 amount = address(this).balance;
        if (amount == 0) revert ZeroAmount();

        (bool ok, ) = creator.call{ value: amount }("");
        if (!ok) revert NativeTransferFailed(creator);
        emit ReserveSwept(creator, amount);
    }

    /// @notice All members, in join order (the payout order).
    function getMembers() external view returns (address[] memory) {
        return members;
    }

    // --- internals ---

    function _quote(uint256 usdAmountE6) internal view returns (uint256 required, uint256 priceE18, uint256 updatedAt) {
        PriceData memory data = oracle.latestPrice(pairKey);
        priceE18 = data.priceE18;
        updatedAt = data.updatedAt;
        if (priceE18 == 0) revert InvalidPrice();
        // Per-committee freshness bound (the adapter enforces its own global one too).
        if (block.timestamp - updatedAt > maxPriceAge) revert StalePrice(updatedAt, maxPriceAge);
        // USD(1e-6) -> HBAR -> native units; ceil so the pot can never fall short.
        required = _ceilDiv(usdAmountE6 * 1e12 * unitsPerHbar, priceE18);
    }

    function _ceilDiv(uint256 a, uint256 b) private pure returns (uint256) {
        if (a == 0) return 0;
        return (a - 1) / b + 1;
    }

    /// @dev Schedule this round's payout on HSS; emits PayoutScheduleFailed
    /// instead of reverting so a throttled second can never brick a round.
    function _schedulePayout() internal {
        if (!hssEnabled) {
            emit ScheduleSkipped();
            return;
        }

        IHederaScheduleService hss = IHederaScheduleService(scheduleService);
        int64 rc = 0;
        for (uint256 i = 0; i < HSS_SLOT_PROBES; i++) {
            uint256 executeAt = roundEndsAt + i;
            if (!hss.hasScheduleCapacity(executeAt, HSS_PAYOUT_GAS_LIMIT)) continue;

            address schedule;
            (rc, schedule) = hss.scheduleCall(
                address(this),
                executeAt,
                HSS_PAYOUT_GAS_LIMIT,
                0,
                abi.encodeCall(this.finalizeRound, ())
            );
            if (rc == HSS_SUCCESS && schedule != address(0)) {
                pendingSchedule = schedule;
                emit PayoutScheduled(schedule, executeAt);
                return;
            }
        }
        emit PayoutScheduleFailed(rc);
    }
}
