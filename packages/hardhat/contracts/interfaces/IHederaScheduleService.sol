// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice HIP-1215 Hedera Schedule Service (system contract 0x16b) surface.
/// These calls never revert: failures come back as a non-SUCCESS int64 code and
/// address(0). 22 == SUCCESS in Hedera's ResponseCodeEnum.
interface IHederaScheduleService {
    function scheduleCall(
        address to,
        uint256 expirySecond,
        uint256 gasLimit,
        uint64 value,
        bytes calldata callData
    ) external returns (int64 rc, address schedule);

    function hasScheduleCapacity(uint256 expirySecond, uint256 gasLimit) external view returns (bool);

    function deleteSchedule(address scheduleAddress) external returns (int64 rc);
}
