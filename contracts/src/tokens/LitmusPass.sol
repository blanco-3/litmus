// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Litmus Pass — ERC-721 NFT for gating CDR vaults.
///         Owner can mint to any address; holders can transfer freely.
contract LitmusPass {
    string public constant name   = "Litmus Pass";
    string public constant symbol = "LPASS";

    address public owner;
    uint256 public totalSupply;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner_, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner_, address indexed operator, bool approved);

    error NotOwner();
    error NotAuthorized();
    error ZeroAddress();

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor() { owner = msg.sender; }

    // ── Mint ────────────────────────────────────────────────────────────────

    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        tokenId = totalSupply++;
        ownerOf[tokenId] = to;
        balanceOf[to]++;
        emit Transfer(address(0), to, tokenId);
    }

    function batchMint(address[] calldata recipients) external onlyOwner {
        for (uint256 i; i < recipients.length; i++) {
            address to = recipients[i];
            if (to == address(0)) revert ZeroAddress();
            uint256 tokenId = totalSupply++;
            ownerOf[tokenId] = to;
            balanceOf[to]++;
            emit Transfer(address(0), to, tokenId);
        }
    }

    // ── ERC-721 transfer ────────────────────────────────────────────────────

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (ownerOf[tokenId] != from) revert NotAuthorized();
        if (msg.sender != from && !isApprovedForAll[from][msg.sender] && getApproved[tokenId] != msg.sender)
            revert NotAuthorized();
        if (to == address(0)) revert ZeroAddress();
        delete getApproved[tokenId];
        ownerOf[tokenId] = to;
        balanceOf[from]--;
        balanceOf[to]++;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        transferFrom(from, to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf[tokenId];
        if (msg.sender != tokenOwner && !isApprovedForAll[tokenOwner][msg.sender])
            revert NotAuthorized();
        getApproved[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x80ac58cd // ERC721
            || id == 0x01ffc9a7; // ERC165
    }
}
