// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "../interfaces/ICDRVault.sol";
import "./IActivityRegistry.sol";

/// @notice Grants access if reader's total tx count (from ActivityRegistry) >= minCount.
/// conditionData (stored in vault): abi.encode(address registry, uint256 minCount)
contract TxCountCondition is IReadCondition {
    ICDRVault constant CDR = ICDRVault(0xCCCcCC0000000000000000000000000000000005);

    function checkReadCondition(
        uint32 uuid,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        bytes memory data = conditionData.length > 0 ? conditionData : CDR.vaults(uuid).readConditionData;
        if (data.length == 0) return false;
        (address registry, uint256 minCount) = abi.decode(data, (address, uint256));
        return IActivityRegistry(registry).txCount(reader) >= minCount;
    }
}
