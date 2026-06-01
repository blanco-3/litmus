// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Interface required by the CDR contract for read-gating.
/// Updated to match CDR precompile v2: uuid prepended, reader moved to last.
interface IReadCondition {
    function checkReadCondition(
        uint32 uuid,
        bytes calldata conditionData,
        bytes calldata accessAuxData,
        address reader
    ) external view returns (bool);
}

/// @notice Interface required by the CDR contract for write-gating.
/// Updated to match CDR precompile v2: uuid prepended, caller moved to last.
interface IWriteCondition {
    function checkWriteCondition(
        uint32 uuid,
        bytes calldata conditionData,
        bytes calldata accessAuxData,
        address caller
    ) external view returns (bool);
}
