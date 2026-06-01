// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Pay-to-read gate: publisher registers a price per vault UUID,
///         readers pay to unlock, payment is forwarded to the recipient.
contract PaymentGate {
    struct Gate {
        address payable recipient;
        uint256 requiredWei;
    }

    mapping(uint32 => Gate) public gates;
    mapping(uint32 => mapping(address => bool)) public hasPaid;

    event Registered(uint32 indexed uuid, address indexed recipient, uint256 requiredWei);
    event Paid(uint32 indexed uuid, address indexed payer, uint256 amount);

    error NotRegistered();
    error InsufficientPayment();
    error TransferFailed();

    /// @notice Publisher registers a price for their vault.
    ///         Anyone can call, but the recipient receives the funds.
    function register(uint32 uuid, address payable recipient, uint256 requiredWei) external {
        gates[uuid] = Gate(recipient, requiredWei);
        emit Registered(uuid, recipient, requiredWei);
    }

    /// @notice Reader pays to unlock. Forwards full payment to recipient.
    function pay(uint32 uuid) external payable {
        Gate memory g = gates[uuid];
        if (g.requiredWei == 0) revert NotRegistered();
        if (msg.value < g.requiredWei) revert InsufficientPayment();
        hasPaid[uuid][msg.sender] = true;
        (bool ok,) = g.recipient.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
        emit Paid(uuid, msg.sender, msg.value);
    }
}
