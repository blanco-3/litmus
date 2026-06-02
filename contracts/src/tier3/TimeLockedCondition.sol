// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "../interfaces/ICDRVault.sol";

/// @notice Grants access only after block.timestamp >= unlockTime.
/// conditionData (stored in vault): abi.encode(uint256 unlockTime)
contract TimeLockedCondition is IReadCondition {
    ICDRVault constant CDR = ICDRVault(0xCCCcCC0000000000000000000000000000000005);

    function checkReadCondition(
        uint32 uuid,
        bytes calldata conditionData,
        bytes calldata,
        address
    ) external view override returns (bool) {
        bytes memory data = conditionData.length > 0 ? conditionData : CDR.vaults(uuid).readConditionData;
        if (data.length == 0) return false;
        (uint256 unlockTime) = abi.decode(data, (uint256));
        return block.timestamp >= unlockTime;
    }
}
