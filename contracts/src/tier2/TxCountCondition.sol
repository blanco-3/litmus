// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "./IActivityRegistry.sol";

/// @notice Grants access if reader's total tx count (from ActivityRegistry) >= minCount.
/// conditionData: abi.encode(address registry, uint256 minCount)
contract TxCountCondition is IReadCondition {
    function checkReadCondition(
        address reader,
        bytes calldata conditionData,
        bytes calldata
    ) external view override returns (bool) {
        (address registry, uint256 minCount) = abi.decode(conditionData, (address, uint256));
        return IActivityRegistry(registry).txCount(reader) >= minCount;
    }
}
