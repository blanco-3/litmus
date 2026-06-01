// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Litmus Coin — ERC-20 token for gating CDR vaults.
contract LitmusCoin {
    string public constant name     = "Litmus Coin";
    string public constant symbol   = "LCOIN";
    uint8  public constant decimals = 18;

    address public owner;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner_, address indexed spender, uint256 value);

    error NotOwner();
    error InsufficientBalance();
    error InsufficientAllowance();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor() { owner = msg.sender; }

    // ── Mint ────────────────────────────────────────────────────────────────

    function mint(address to, uint256 amount) external onlyOwner {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function batchMint(address[] calldata recipients, uint256 amountEach) external onlyOwner {
        for (uint256 i; i < recipients.length; i++) {
            totalSupply += amountEach;
            balanceOf[recipients[i]] += amountEach;
            emit Transfer(address(0), recipients[i], amountEach);
        }
    }

    // ── ERC-20 ──────────────────────────────────────────────────────────────

    function transfer(address to, uint256 amount) external returns (bool) {
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (allowance[from][msg.sender] < amount) revert InsufficientAllowance();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
