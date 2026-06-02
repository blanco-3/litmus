// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

/// @notice Always-true, pure (no state access)
contract AlwaysTruePure is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata,
        bytes calldata,
        address
    ) external pure override returns (bool) {
        return true;
    }
}

/// @notice Always-true, view (state-reading allowed)
contract AlwaysTrueView is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata,
        bytes calldata,
        address
    ) external view override returns (bool) {
        return true;
    }
}

/// @notice Decode conditionData as uint256, always return true (no balance check)
contract DecodeOnlyCondition is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address
    ) external pure override returns (bool) {
        if (conditionData.length == 0) return true;
        abi.decode(conditionData, (uint256));
        return true;
    }
}

/// @notice Check reader's native balance (the actual NativeBalanceCondition logic)
contract BalanceCheckCondition is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        if (conditionData.length == 0) return reader.balance > 0;
        (uint256 minWei) = abi.decode(conditionData, (uint256));
        return reader.balance >= minWei;
    }
}
