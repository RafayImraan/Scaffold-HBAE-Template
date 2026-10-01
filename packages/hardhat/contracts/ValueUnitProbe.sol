// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Throwaway probe used once to record how Hedera JSON-RPC accounts native value.
/// Records msg.value for inbound transfers and the balance delta for an outbound call.
contract ValueUnitProbe {
    uint256 public lastMsgValue;
    uint256 public balanceAfterReceive;
    uint256 public lastPayoutValue;

    event ValueReceived(address indexed sender, uint256 msgValue, uint256 contractBalance);
    event ValuePaid(address indexed to, uint256 payoutValue, uint256 contractBalance);

    receive() external payable {
        lastMsgValue = msg.value;
        balanceAfterReceive = address(this).balance;
        emit ValueReceived(msg.sender, msg.value, address(this).balance);
    }

    function payOut(address payable to, uint256 amount) external {
        lastPayoutValue = amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "payout failed");
        emit ValuePaid(to, amount, address(this).balance);
    }
}
