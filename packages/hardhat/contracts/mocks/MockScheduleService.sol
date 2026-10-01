// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IHederaScheduleService } from "../interfaces/IHederaScheduleService.sol";

/// @title MockScheduleService
/// @notice Local stand-in for the HIP-1215 Hedera Schedule Service. Mirrors the
/// real contract's shape (never reverts, returns int64 status codes) and adds an
/// `executeDueSchedule()` test harness in place of the network scheduler.
contract MockScheduleService is IHederaScheduleService {
    int64 public constant SUCCESS = 22;

    // Negative codes are local stand-ins for Hedera ResponseCodeEnum ordinals
    // (e.g. SCHEDULE_EXPIRY_IS_BUSY); tests only ever distinguish SUCCESS vs non-SUCCESS.
    int64 private constant MOCK_BUSY = -1;
    int64 private constant MOCK_NOT_FOUND = -2;
    int64 private constant MOCK_EXEC_FAILED = -3;

    struct Schedule {
        address to;
        uint256 expirySecond;
        uint256 gasLimit;
        bytes callData;
        bool executed;
        bool deleted;
    }

    event Scheduled(address indexed schedule, address indexed to, uint256 executeAt);
    event ScheduleDeleted(address indexed schedule, int64 rc);
    event ScheduleExecuted(address indexed schedule, bool ok, int64 rc);

    mapping(address => Schedule) private schedules;
    address[] private scheduleList;

    bool public capacity = true;
    int64 public failScheduleCode;
    bool public failDelete;

    function setCapacity(bool hasCapacity) external {
        capacity = hasCapacity;
    }

    function setFailScheduleCode(int64 code) external {
        failScheduleCode = code;
    }

    function setFailDelete(bool shouldFail) external {
        failDelete = shouldFail;
    }

    function scheduleCount() external view returns (uint256) {
        return scheduleList.length;
    }

    function getSchedule(address schedule) external view returns (Schedule memory) {
        return schedules[schedule];
    }

    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) public view returns (bool) {
        return capacity && gasLimit > 0 && expirySecond > block.timestamp;
    }

    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64,
        bytes calldata callData
    ) external returns (int64 rc, address schedule) {
        if (failScheduleCode != 0) return (failScheduleCode, address(0));
        if (!hasScheduleCapacity(expirySecond, gasLimit)) return (MOCK_BUSY, address(0));

        schedule = address(uint160(uint256(keccak256(abi.encode(block.chainid, address(this), scheduleList.length)))));
        schedules[schedule] = Schedule({
            to: to,
            expirySecond: expirySecond,
            gasLimit: gasLimit,
            callData: callData,
            executed: false,
            deleted: false
        });
        scheduleList.push(schedule);
        emit Scheduled(schedule, to, expirySecond);
        return (SUCCESS, schedule);
    }

    function deleteSchedule(address schedule) external returns (int64) {
        if (failDelete) return (MOCK_NOT_FOUND);
        Schedule storage sched = schedules[schedule];
        if (sched.to == address(0) || sched.executed || sched.deleted) return (MOCK_NOT_FOUND);
        sched.deleted = true;
        emit ScheduleDeleted(schedule, SUCCESS);
        return (SUCCESS);
    }

    /// Test harness for the network scheduler: runs every due, non-deleted call.
    function executeDueSchedule() external returns (uint256 executedCount) {
        for (uint256 i = 0; i < scheduleList.length; i++) {
            Schedule storage sched = schedules[scheduleList[i]];
            if (sched.executed || sched.deleted || sched.expirySecond > block.timestamp) continue;
            sched.executed = true;
            (bool ok, ) = sched.to.call(sched.callData);
            if (ok) executedCount++;
            emit ScheduleExecuted(scheduleList[i], ok, ok ? SUCCESS : MOCK_EXEC_FAILED);
        }
    }
}
