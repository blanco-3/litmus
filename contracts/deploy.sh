#!/bin/bash
# Usage: DEPLOYER_PRIVATE_KEY=0x... bash deploy.sh
set -e

RPC="https://aeneid.storyrpc.io"
CHAIN_ID=1315

if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
  echo "Error: DEPLOYER_PRIVATE_KEY not set"
  exit 1
fi

cd "$(dirname "$0")"

OUTPUT=$(forge script script/Deploy.s.sol \
  --rpc-url "$RPC" \
  --chain-id "$CHAIN_ID" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  --legacy \
  2>&1)

echo "$OUTPUT"

# Parse addresses from output and write to deployments/addresses.json
OPEN_WRITE=$(echo "$OUTPUT"     | grep "OpenWriteCondition:"   | awk '{print $NF}')
OWNER_WRITE=$(echo "$OUTPUT"    | grep "OwnerWriteCondition:"  | awk '{print $NF}')
TOKEN_BALANCE=$(echo "$OUTPUT"  | grep "TokenBalanceCondition:" | awk '{print $NF}')
NFT_HOLDER=$(echo "$OUTPUT"     | grep "NFTHolderCondition:"    | awk '{print $NF}')
NATIVE_BAL=$(echo "$OUTPUT"     | grep "NativeBalanceCondition:"| awk '{print $NF}')
ACTIVITY_REG=$(echo "$OUTPUT"   | grep "ActivityRegistry:"      | awk '{print $NF}')
TX_COUNT=$(echo "$OUTPUT"       | grep "TxCountCondition:"      | awk '{print $NF}')
CONTRACT_CALL=$(echo "$OUTPUT"  | grep "ContractCallCountCondition:" | awk '{print $NF}')
FIRST_TX=$(echo "$OUTPUT"       | grep "FirstTxBeforeCondition:"| awk '{print $NF}')
MULTI=$(echo "$OUTPUT"          | grep "MultiCondition:"        | awk '{print $NF}')
TIME_LOCKED=$(echo "$OUTPUT"    | grep "TimeLockedCondition:"   | awk '{print $NF}')
STORY_IP=$(echo "$OUTPUT"       | grep "StoryIPLicenseCondition:" | awk '{print $NF}')

cat > ../deployments/addresses.json <<EOF
{
  "network": "aeneid",
  "chainId": 1315,
  "deployed": true,
  "contracts": {
    "OpenWriteCondition": "$OPEN_WRITE",
    "OwnerWriteCondition": "$OWNER_WRITE",
    "TokenBalanceCondition": "$TOKEN_BALANCE",
    "NFTHolderCondition": "$NFT_HOLDER",
    "NativeBalanceCondition": "$NATIVE_BAL",
    "ActivityRegistry": "$ACTIVITY_REG",
    "TxCountCondition": "$TX_COUNT",
    "ContractCallCountCondition": "$CONTRACT_CALL",
    "FirstTxBeforeCondition": "$FIRST_TX",
    "MultiCondition": "$MULTI",
    "TimeLockedCondition": "$TIME_LOCKED",
    "StoryIPLicenseCondition": "$STORY_IP"
  }
}
EOF

echo ""
echo "Addresses written to ../deployments/addresses.json"
