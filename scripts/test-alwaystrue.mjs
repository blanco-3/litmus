/**
 * Deploy an "always true" condition contract (same as other teams)
 * then test read() with it.
 * Run: node --env-file=.env.local scripts/test-alwaystrue.mjs
 */

import { CDRClient, initWasm, uuidToLabel } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

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

// "Always true" bytecode: PUSH1 1 | MSTORE | RETURN 32 bytes = abi.encode(true)
// Same as 0xd019fA1e1E5e5731D18C633f1aE890022cf090cd used by other teams
const ALWAYS_TRUE_BYTECODE = '0x600160005260206000f3'

// Use already-deployed one from another team (saves gas)
const ALWAYS_TRUE_ADDR = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'
const OPEN_WRITE = '0xBDEE43Ee09B846077916485A6c3C9dAFBC1677be'

await initWasm()

console.log(`\n=== Always-True Condition Test ===`)
console.log(`Wallet: ${account.address}`)
console.log(`Read condition: ${ALWAYS_TRUE_ADDR} (always returns true)\n`)

// Allocate with always-true read condition
console.log('[1] Allocating vault...')
const { uuid } = await cdrClient.uploader.allocate({
  updatable: false,
  writeConditionAddr: OPEN_WRITE,
  writeConditionData: '0x',
  readConditionAddr: ALWAYS_TRUE_ADDR,
  readConditionData: '0x',
  skipConditionValidation: true,
})
console.log(`    UUID: ${uuid}`)

// Encrypt + write
const secret = 'always-true-test-' + Date.now()
const globalPubKey = await cdrClient.observer.getGlobalPubKey()
const ciphertext = await cdrClient.uploader.encryptDataKey({
  dataKey: new TextEncoder().encode(secret),
  globalPubKey,
  label: uuidToLabel(uuid),
})
await cdrClient.uploader.write({ uuid, accessAuxData: '0x', encryptedData: toHex(ciphertext.raw) })
console.log(`    Written.\n`)

// Read
console.log('[2] Reading...')
try {
  const { dataKey: recovered, txHash } = await cdrClient.consumer.accessCDR({
    uuid, accessAuxData: '0x', timeoutMs: 60_000,
  })
  console.log(`    tx: ${txHash}`)
  console.log(`    Decrypted: ${new TextDecoder().decode(recovered)}`)
  console.log('\n=== SUCCESS ===')
  console.log('Conclusion: "always true" contract conditions work.')
  console.log('Our Solidity condition contracts need a different approach.')
} catch (err) {
  console.log(`    FAILED: ${err.shortMessage ?? err.message}`)
}
