// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

/// @notice Grants access if reader's native token (IP) balance >= minWei.
/// conditionData: abi.encode(uint256 minWei)
contract NativeBalanceCondition is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        (uint256 minWei) = abi.decode(conditionData, (uint256));
        return reader.balance >= minWei;
    }
}
