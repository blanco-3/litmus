// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "./IActivityRegistry.sol";

/// @notice Grants access if reader's first tx was before a given timestamp (OG gate).
/// conditionData: abi.encode(address registry, uint256 beforeTimestamp)
/// Note: firstTxTimestamp == 0 means unknown → fails the check.
contract FirstTxBeforeCondition is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        (address registry, uint256 beforeTimestamp) = abi.decode(conditionData, (address, uint256));
        uint256 first = IActivityRegistry(registry).firstTxTimestamp(reader);
        return first != 0 && first < beforeTimestamp;
    }
}
