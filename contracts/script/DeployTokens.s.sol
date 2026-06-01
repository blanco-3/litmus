// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/tokens/LitmusPass.sol";
import "../src/tokens/LitmusCoin.sol";

contract DeployTokens is Script {
    // Mint targets: seed wallet + user's personal wallet
    address constant USER_WALLET = 0x7B9846c4aC8E0bBc620d6a321A3b5c109A0350Bf;

    function run() external {
        vm.startBroadcast();

        LitmusPass  pass = new LitmusPass();
        LitmusCoin  coin = new LitmusCoin();

        address deployer = msg.sender;

        // ── LitmusPass: mint 1 NFT to deployer + user ──
        address[] memory passRecipients = new address[](2);
        passRecipients[0] = deployer;
        passRecipients[1] = USER_WALLET;
        pass.batchMint(passRecipients);

        // ── LitmusCoin: 1000 LCOIN to deployer + user ──
        address[] memory coinRecipients = new address[](2);
        coinRecipients[0] = deployer;
        coinRecipients[1] = USER_WALLET;
        coin.batchMint(coinRecipients, 1000 * 1e18);

        vm.stopBroadcast();

        console.log("LitmusPass:", address(pass));
        console.log("LitmusCoin:", address(coin));
        console.log("Minted Pass tokens: 0,1 to deployer + user");
        console.log("Minted 1000 LCOIN each to deployer + user");
    }
}
