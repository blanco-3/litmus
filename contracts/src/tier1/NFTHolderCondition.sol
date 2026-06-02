// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";
import "../interfaces/ICDRVault.sol";

interface IERC721 {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Grants access if reader holds >= minBalance of an ERC-721 NFT collection.
/// conditionData (stored in vault): abi.encode(address nftContract, uint256 minBalance)
contract NFTHolderCondition is IReadCondition {
    ICDRVault constant CDR = ICDRVault(0xCCCcCC0000000000000000000000000000000005);

    function checkReadCondition(
        uint32 uuid,
        bytes calldata,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        bytes memory conditionData = CDR.vaults(uuid).readConditionData;
        if (conditionData.length == 0) return false;
        (address nftContract, uint256 minBalance) = abi.decode(conditionData, (address, uint256));
        return IERC721(nftContract).balanceOf(reader) >= minBalance;
    }
}
