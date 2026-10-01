// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Committee } from "../Committee.sol";

/// @title MaliciousReceiver
/// @notice Reentrancy fixture: a committee member that re-enters
/// `finalizeRound()`/`contribute()` from its HBAR `receive()` hook during payout.
contract MaliciousReceiver {
    Committee public committee;
    bool public attackOnPayout;
    bool public reentrySucceeded;

    constructor(address committee_) {
        committee = Committee(committee_);
    }

    function setAttack(bool enabled) external {
        attackOnPayout = enabled;
    }

    function joinCommittee() external {
        committee.join();
    }

    function contribute() external payable {
        committee.contribute{ value: msg.value }();
    }

    receive() external payable {
        if (!attackOnPayout) return;
        try committee.finalizeRound() {
            reentrySucceeded = true;
        } catch {}
        try committee.contribute() {
            reentrySucceeded = true;
        } catch {}
    }
}
