// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Owner-controlled registry that mirrors off-chain activity data on-chain.
/// An oracle (or the publisher) calls setTxCount / setFirstTxTimestamp / setContractCallCount
/// for any wallet before content is accessed. Tier 2 conditions read from here.
contract ActivityRegistry {
    address public owner;

    /// total transaction count per wallet
    mapping(address => uint256) public txCount;
    /// timestamp of first tx per wallet (unix seconds, 0 = unknown)
    mapping(address => uint256) public firstTxTimestamp;
    /// call count per (wallet, contract) pair
    mapping(address => mapping(address => uint256)) public contractCallCount;

    event TxCountUpdated(address indexed wallet, uint256 count);
    event FirstTxTimestampUpdated(address indexed wallet, uint256 timestamp);
    event ContractCallCountUpdated(address indexed wallet, address indexed target, uint256 count);

    modifier onlyOwner() {
        require(msg.sender == owner, "ActivityRegistry: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function setTxCount(address wallet, uint256 count) external onlyOwner {
        txCount[wallet] = count;
        emit TxCountUpdated(wallet, count);
    }

    function setFirstTxTimestamp(address wallet, uint256 timestamp) external onlyOwner {
        firstTxTimestamp[wallet] = timestamp;
        emit FirstTxTimestampUpdated(wallet, timestamp);
    }

    function setContractCallCount(address wallet, address target, uint256 count) external onlyOwner {
        contractCallCount[wallet][target] = count;
        emit ContractCallCountUpdated(wallet, target, count);
    }

    /// Batch update tx counts
    function batchSetTxCount(address[] calldata wallets, uint256[] calldata counts) external onlyOwner {
        require(wallets.length == counts.length, "length mismatch");
        for (uint256 i = 0; i < wallets.length; i++) {
            txCount[wallets[i]] = counts[i];
        }
    }
}
