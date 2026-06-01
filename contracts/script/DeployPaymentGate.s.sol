// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/tier2/PaymentGate.sol";
import "../src/tier2/PaymentGateCondition.sol";

contract DeployPaymentGate is Script {
    function run() external {
        uint256 pk = vm.envUint("SEED_PRIVATE_KEY");
        vm.startBroadcast(pk);

        PaymentGate gate = new PaymentGate();
        PaymentGateCondition cond = new PaymentGateCondition();

        vm.stopBroadcast();

        console.log("PaymentGate:", address(gate));
        console.log("PaymentGateCondition:", address(cond));
    }
}
