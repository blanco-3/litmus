// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Grants access if reader holds >= minAmount of an ERC-20 token.
/// conditionData: abi.encode(address token, uint256 minAmount)
contract TokenBalanceCondition is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        (address token, uint256 minAmount) = abi.decode(conditionData, (address, uint256));
        return IERC20(token).balanceOf(reader) >= minAmount;
    }
}
