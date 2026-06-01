/**
 * Deploy a diagnostic condition contract that:
 * - Has the v2 checkReadCondition function (always returns true)
 * - Has a fallback that also returns true
 * This tells us if the issue is selector mismatch or something in our logic.
 *
 * Run: node --env-file=.env.local scripts/deploy-diagnostic.mjs
 */

import { createPublicClient, createWalletClient, http, defineChain, encodeDeployData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CDRClient, initWasm, uuidToLabel } from '@piplabs/cdr-sdk'
import { toHex } from 'viem'

const PK      = process.env.SEED_PRIVATE_KEY
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'
const RPC_URL = 'https://aeneid.storyrpc.io'

if (!PK) { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })

// Minimal Solidity contract with v2 function + fallback, both always return true
//
// contract AlwaysTrueV2 {
//     // v2: checkReadCondition(uint32,bytes,bytes,address) = 0x8db3eb17
//     function checkReadCondition(uint32, bytes calldata, bytes calldata, address)
//         external pure returns (bool) { return true; }
//     // catch any other call
//     fallback() external pure returns (bool) { return true; }
// }
//
// Compiled bytecode (approximate — using raw EVM for simplicity):
// We'll use the known-working "always true" minimal bytecode instead
// since it handles ALL possible selectors

// Deploy "always true" ourselves (same as other teams use)
// bytecode = 0x600160005260206000f3 wrapped in a constructor
// Constructor: PUSH10 <runtime_bytes> PUSH1 0 MSTORE PUSH1 10 PUSH1 22 RETURN
const RUNTIME = '600160005260206000f3'
// Constructor that deploys the runtime code:
// PUSH10 600160005260206000f3
// PUSH1 0x00 MSTORE (store at pos 0, but MSTORE writes 32 bytes, so runtime is at pos 22-31)
// Actually let's use a simpler constructor pattern:
// PUSH10 runtimeBytes | PUSH1 0 | MSTORE | PUSH1 10 | PUSH1 22 | RETURN
const DEPLOY_BYTECODE = '0x69' + RUNTIME + '6000526010601af3'

console.log('\n=== Deploy Diagnostic Condition Contract ===')
console.log(`Bytecode: ${DEPLOY_BYTECODE}`)

// Deploy
const hash = await walletClient.sendTransaction({ data: DEPLOY_BYTECODE })
console.log(`Deploy tx: ${hash}`)
const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30000 })
const contractAddr = receipt.contractAddress
console.log(`Contract address: ${contractAddr}`)

// Verify bytecode
const code = await publicClient.getBytecode({ address: contractAddr })
console.log(`Deployed bytecode: ${code}`)
console.log(`Matches expected: ${code === ('0x' + RUNTIME)}`)

// Test read with this contract
await initWasm()
const OPEN_WRITE = '0xBDEE43Ee09B846077916485A6c3C9dAFBC1677be'

const { uuid } = await cdrClient.uploader.allocate({
  updatable: false,
  writeConditionAddr: OPEN_WRITE,
  writeConditionData: '0x',
  readConditionAddr: contractAddr,
  readConditionData: '0x',
  skipConditionValidation: true,
})
console.log(`\nAllocated UUID: ${uuid}`)

const secret = 'diagnostic-test'
const globalPubKey = await cdrClient.observer.getGlobalPubKey()
const cipher = await cdrClient.uploader.encryptDataKey({
  dataKey: new TextEncoder().encode(secret),
  globalPubKey, label: uuidToLabel(uuid),
})
await cdrClient.uploader.write({ uuid, accessAuxData: '0x', encryptedData: toHex(cipher.raw) })

console.log('Written. Attempting read...')
try {
  const { dataKey: recovered } = await cdrClient.consumer.accessCDR({ uuid, accessAuxData: '0x', timeoutMs: 60_000 })
  console.log('✅ READ SUCCESS:', new TextDecoder().decode(recovered))
} catch (err) {
  console.log('❌ READ FAILED:', err.shortMessage ?? err.message)
}
