// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "./IActivityRegistry.sol";

/// @notice Grants access if reader has called a specific contract >= minCount times.
/// conditionData: abi.encode(address registry, address targetContract, uint256 minCount)
contract ContractCallCountCondition is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        (address registry, address targetContract, uint256 minCount) =
            abi.decode(conditionData, (address, address, uint256));
        return IActivityRegistry(registry).contractCallCount(reader, targetContract) >= minCount;
    }
}
