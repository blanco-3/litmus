// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

/// @notice Write condition that allows only the original publisher (owner) to update a vault.
/// conditionData: abi.encode(address owner)
contract OwnerWriteCondition is IWriteCondition {
    function checkWriteCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address caller
    ) external pure override returns (bool) {
        address owner = abi.decode(conditionData, (address));
        return caller == owner;
    }
}
