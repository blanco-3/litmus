// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

/// @notice Grants access only after block.timestamp >= unlockTime.
/// conditionData: abi.encode(uint256 unlockTime)
contract TimeLockedCondition is IReadCondition {
    function checkReadCondition(
        address,
        bytes calldata conditionData,
        bytes calldata
    ) external view override returns (bool) {
        (uint256 unlockTime) = abi.decode(conditionData, (uint256));
        return block.timestamp >= unlockTime;
    }
}
