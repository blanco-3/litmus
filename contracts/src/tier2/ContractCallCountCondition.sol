// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "../interfaces/ICDRVault.sol";
import "./IActivityRegistry.sol";

/// @notice Grants access if reader has called a specific contract >= minCount times.
/// conditionData (stored in vault): abi.encode(address registry, address targetContract, uint256 minCount)
contract ContractCallCountCondition is IReadCondition {
    ICDRVault constant CDR = ICDRVault(0xCCCcCC0000000000000000000000000000000005);

    function checkReadCondition(
        uint32 uuid,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        bytes memory data = conditionData.length > 0 ? conditionData : CDR.vaults(uuid).readConditionData;
        if (data.length == 0) return false;
        (address registry, address targetContract, uint256 minCount) =
            abi.decode(data, (address, address, uint256));
        return IActivityRegistry(registry).contractCallCount(reader, targetContract) >= minCount;
    }
}
