// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

/// @notice AND/OR combinator for multiple IReadCondition contracts.
/// conditionData: abi.encode(address[] conditions, bytes[] conditionDatas, bool[] isAnd)
///
/// Evaluation (left-to-right, no precedence):
///   result = checkReadCondition(conditions[0])
///   for i in 1..n:
///     if isAnd[i-1]: result = result && checkReadCondition(conditions[i])
///     else:          result = result || checkReadCondition(conditions[i])
///
/// isAnd.length must equal conditions.length - 1.
contract MultiCondition is IReadCondition {
    function checkReadCondition(
        uint32 uuid,
        bytes calldata conditionData,
        bytes calldata accessAuxData,
        address reader
    ) external view override returns (bool) {
        (address[] memory conds, bytes[] memory condDatas, bool[] memory isAnd) =
            abi.decode(conditionData, (address[], bytes[], bool[]));

        require(conds.length > 0, "MultiCondition: empty");
        require(condDatas.length == conds.length, "MultiCondition: data mismatch");
        require(isAnd.length == conds.length - 1, "MultiCondition: op mismatch");

        bool result = IReadCondition(conds[0]).checkReadCondition(uuid, condDatas[0], accessAuxData, reader);

        for (uint256 i = 1; i < conds.length; i++) {
            bool next = IReadCondition(conds[i]).checkReadCondition(uuid, condDatas[i], accessAuxData, reader);
            result = isAnd[i - 1] ? (result && next) : (result || next);
        }

        return result;
    }
}
