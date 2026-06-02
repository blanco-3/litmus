// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "../interfaces/ICDRVault.sol";

/// @notice AND/OR combinator for multiple IReadCondition contracts.
/// conditionData (stored in vault): abi.encode(address[] conditions, bytes[] conditionDatas, bool[] isAnd)
/// Note: sub-conditions are also called with uuid so they self-read their own data if needed.
///       conditionDatas here are ignored by sub-conditions that use self-reading pattern.
contract MultiCondition is IReadCondition {
    ICDRVault constant CDR = ICDRVault(0xCCCcCC0000000000000000000000000000000005);

    function checkReadCondition(
        uint32 uuid,
        bytes calldata,
        bytes calldata accessAuxData,
        address reader
    ) external view override returns (bool) {
        bytes memory conditionData = CDR.vaults(uuid).readConditionData;
        if (conditionData.length == 0) return false;

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
