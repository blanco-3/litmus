// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

interface IPaymentGate {
    function hasPaid(uint32 uuid, address reader) external view returns (bool);
}

/// @notice Read condition: passes if reader has paid for the vault via PaymentGate.
/// conditionData: abi.encode(address paymentGate, uint256 requiredWei)
///   - paymentGate: the PaymentGate contract address
///   - requiredWei: stored for frontend display only; gate contract is authoritative
contract PaymentGateCondition is IReadCondition {
    function checkReadCondition(
        uint32 uuid,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view returns (bool) {
        (address gateAddr,) = abi.decode(conditionData, (address, uint256));
        return IPaymentGate(gateAddr).hasPaid(uuid, reader);
    }
}
