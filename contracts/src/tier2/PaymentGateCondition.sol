// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

interface IPaymentGate {
    function hasPaid(uint32 uuid, address reader) external view returns (bool);
}

/// @notice Read condition identifier for PaymentGate vaults.
/// Used as a marker address in hybrid conditionData so the frontend can detect pay-to-read vaults.
/// CDR always-true is used on-chain; the frontend calls PaymentGate.hasPaid() directly.
/// conditionData: abi.encode(address paymentGate, uint256 requiredWei)
contract PaymentGateCondition is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view returns (bool) {
        // Not called by CDR (vault uses always-true). Called by frontend for detection only.
        (address gateAddr,) = abi.decode(conditionData, (address, uint256));
        // Placeholder — frontend calls PaymentGate.hasPaid(uuid, reader) directly.
        return false;
    }
}
