// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IReadCondition.sol";

interface ILicenseToken {
    function balanceOf(address account) external view returns (uint256);
    function getLicenseTokenMetadata(uint256 tokenId)
        external
        view
        returns (address licensorIpId, address licenseTemplate, uint256 licenseTermsId);
    function totalSupply() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice Grants access if reader holds a Story Protocol IP license token
///         matching the specified licenseTermsId.
/// conditionData: abi.encode(address licenseToken, uint256 licenseTermsId)
/// licenseTermsId == 0 → any license from this token contract suffices.
contract StoryIPLicenseCondition is IReadCondition {
    function checkReadCondition(
        uint32,
        bytes calldata conditionData,
        bytes calldata,
        address reader
    ) external view override returns (bool) {
        (address licenseToken, uint256 licenseTermsId) =
            abi.decode(conditionData, (address, uint256));

        ILicenseToken lt = ILicenseToken(licenseToken);
        if (lt.balanceOf(reader) == 0) return false;
        if (licenseTermsId == 0) return true;

        uint256 supply = lt.totalSupply();
        for (uint256 i = 0; i < supply; i++) {
            try lt.ownerOf(i) returns (address owner) {
                if (owner == reader) {
                    try lt.getLicenseTokenMetadata(i) returns (address, address, uint256 termsId) {
                        if (termsId == licenseTermsId) return true;
                    } catch {}
                }
            } catch {}
        }
        return false;
    }
}
