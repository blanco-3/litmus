// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Interface required by the CDR precompile for read-gating.
/// Selector: 0x8db3eb17 — checkReadCondition(uint32,bytes,bytes,address)
interface IReadCondition {
    function checkReadCondition(
        uint32 uuid,
        bytes calldata conditionData,
        bytes calldata accessAuxData,
        address reader
    ) external view returns (bool);
}

/// @notice Interface required by the CDR precompile for write-gating.
/// Selector: 0x5645dbbf — checkWriteCondition(uint32,bytes,bytes,address)
interface IWriteCondition {
    function checkWriteCondition(
        uint32 uuid,
        bytes calldata conditionData,
        bytes calldata accessAuxData,
        address caller
    ) external view returns (bool);
}
