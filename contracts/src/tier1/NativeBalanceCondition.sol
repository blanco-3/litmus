// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "../interfaces/ICDRVault.sol";

/// @notice Grants access if reader's native token (IP) balance >= minWei.
/// conditionData (stored in vault): abi.encode(uint256 minWei)
/// Note: CDR precompile does not forward conditionData to condition contracts.
///       This contract reads it directly from the CDR vault storage.
contract NativeBalanceCondition is IReadCondition {
    ICDRVault constant CDR = ICDRVault(0xCCCcCC0000000000000000000000000000000005);

    function checkReadCondition(
        uint32 uuid,
        bytes calldata,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        bytes memory conditionData = CDR.vaults(uuid).readConditionData;
        if (conditionData.length == 0) return false;
        (uint256 minWei) = abi.decode(conditionData, (uint256));
        return reader.balance >= minWei;
    }
}
