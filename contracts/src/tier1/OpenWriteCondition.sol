// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

/// @notice Write condition that allows anyone to write (open vault).
/// Use this as writeConditionAddr when the publisher wants to write once and close.
contract OpenWriteCondition is IWriteCondition {
    function checkWriteCondition(
        address,
        bytes calldata,
        bytes calldata
    ) external pure override returns (bool) {
        return true;
    }
}
