// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "../interfaces/ICDRVault.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Grants access if reader holds >= minAmount of an ERC-20 token.
/// conditionData (stored in vault): abi.encode(address token, uint256 minAmount)
contract TokenBalanceCondition is IReadCondition {
    ICDRVault constant CDR = ICDRVault(0xCCCcCC0000000000000000000000000000000005);

    function checkReadCondition(
        uint32 uuid,
        bytes calldata,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        bytes memory conditionData = CDR.vaults(uuid).readConditionData;
        if (conditionData.length == 0) return false;
        (address token, uint256 minAmount) = abi.decode(conditionData, (address, uint256));
        return IERC20(token).balanceOf(reader) >= minAmount;
    }
}
