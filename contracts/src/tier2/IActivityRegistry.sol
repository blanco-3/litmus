// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IActivityRegistry {
    function txCount(address wallet) external view returns (uint256);
    function firstTxTimestamp(address wallet) external view returns (uint256);
    function contractCallCount(address wallet, address target) external view returns (uint256);
}
