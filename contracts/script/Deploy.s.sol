// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

import "../src/tier1/TokenBalanceCondition.sol";
import "../src/tier1/NFTHolderCondition.sol";
import "../src/tier1/NativeBalanceCondition.sol";
import "../src/tier1/OpenWriteCondition.sol";
import "../src/tier2/ActivityRegistry.sol";
import "../src/tier2/TxCountCondition.sol";
import "../src/tier2/ContractCallCountCondition.sol";
import "../src/tier2/FirstTxBeforeCondition.sol";
import "../src/tier3/MultiCondition.sol";
import "../src/tier3/TimeLockedCondition.sol";
import "../src/tier3/StoryIPLicenseCondition.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        TokenBalanceCondition tokenBalance = new TokenBalanceCondition();
        NFTHolderCondition nftHolder = new NFTHolderCondition();
        NativeBalanceCondition nativeBalance = new NativeBalanceCondition();

        ActivityRegistry activityRegistry = new ActivityRegistry();
        TxCountCondition txCount = new TxCountCondition();
        ContractCallCountCondition contractCallCount = new ContractCallCountCondition();
        FirstTxBeforeCondition firstTxBefore = new FirstTxBeforeCondition();

        MultiCondition multiCondition = new MultiCondition();
        TimeLockedCondition timeLocked = new TimeLockedCondition();
        StoryIPLicenseCondition storyIPLicense = new StoryIPLicenseCondition();

        OpenWriteCondition openWrite = new OpenWriteCondition();

        vm.stopBroadcast();

        console.log("OpenWriteCondition:", address(openWrite));
        console.log("TokenBalanceCondition:", address(tokenBalance));
        console.log("NFTHolderCondition:", address(nftHolder));
        console.log("NativeBalanceCondition:", address(nativeBalance));
        console.log("ActivityRegistry:", address(activityRegistry));
        console.log("TxCountCondition:", address(txCount));
        console.log("ContractCallCountCondition:", address(contractCallCount));
        console.log("FirstTxBeforeCondition:", address(firstTxBefore));
        console.log("MultiCondition:", address(multiCondition));
        console.log("TimeLockedCondition:", address(timeLocked));
        console.log("StoryIPLicenseCondition:", address(storyIPLicense));
    }
}
