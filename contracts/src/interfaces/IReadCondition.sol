// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Interface required by the CDR contract for read-gating.
interface IReadCondition {
    function checkReadCondition(
        address reader,
        bytes calldata conditionData,
        bytes calldata accessAuxData
    ) external view returns (bool);
}

/// @notice Interface required by the CDR contract for write-gating.
interface IWriteCondition {
    function checkWriteCondition(
        address caller,
        bytes calldata conditionData,
        bytes calldata accessAuxData
    ) external view returns (bool);
}
