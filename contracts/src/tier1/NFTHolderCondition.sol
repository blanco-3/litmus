// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

interface IERC721 {
    function balanceOf(address owner) external view returns (uint256);
}

/// @notice Grants access if reader holds >= minBalance of an ERC-721 NFT collection.
/// conditionData: abi.encode(address nftContract, uint256 minBalance)
contract NFTHolderCondition is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        (address nftContract, uint256 minBalance) = abi.decode(conditionData, (address, uint256));
        return IERC721(nftContract).balanceOf(reader) >= minBalance;
    }
}
