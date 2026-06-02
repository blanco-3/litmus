// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Read interface for the CDR precompile vault storage.
/// CDR precompile address on Aeneid testnet: 0xCCCcCC0000000000000000000000000000000005
interface ICDRVault {
    struct Vault {
        bool updatable;
        address writeConditionAddr;
        address readConditionAddr;
        bytes writeConditionData;
        bytes readConditionData;
        bytes encryptedData;
    }

    function vaults(uint32 uuid) external view returns (Vault memory);
}
