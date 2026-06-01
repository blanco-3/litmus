/**
 * E2E test: publish with hybrid condition (NativeBalance 1 wei) → read
 * Mirrors exactly what the frontend does.
 * Run: node --env-file=.env.local scripts/test-hybrid.mjs
 */

import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain,
         encodeAbiParameters, decodeAbiParameters, parseAbiParameters } from 'viem'
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

// Addresses
const ALWAYS_TRUE    = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'
const NATIVE_BAL     = '0x2faF603251a8ae7987DB40818Eb3b37FE2B2BF1f'
const OPEN_WRITE     = '0xBDEE43Ee09B846077916485A6c3C9dAFBC1677be'
const CDR_ADDR       = '0xcccccc0000000000000000000000000000000005'

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })

const VAULT_ABI = [{
  name: 'vaults', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'uuid', type: 'uint32' }],
  outputs: [{ name: 'vault', type: 'tuple', components: [
    { name: 'updatable', type: 'bool' },
    { name: 'writeConditionAddr', type: 'address' },
    { name: 'readConditionAddr', type: 'address' },
    { name: 'writeConditionData', type: 'bytes' },
    { name: 'readConditionData', type: 'bytes' },
    { name: 'encryptedData', type: 'bytes' },
  ]}],
}]

const CONDITION_ABI = [{
  name: 'checkReadCondition', type: 'function', stateMutability: 'view',
  inputs: [
    { name: 'uuid', type: 'uint32' },
    { name: 'conditionData', type: 'bytes' },
    { name: 'accessAuxData', type: 'bytes' },
    { name: 'reader', type: 'address' },
  ],
  outputs: [{ type: 'bool' }],
}]

await initWasm()
console.log(`\n=== Hybrid Condition E2E Test ===`)
console.log(`Wallet: ${account.address}\n`)

// Step 1: Build hybrid readConditionData (same as frontend)
// realCondition = NativeBalance(1 wei)
const realConditionAddr = NATIVE_BAL
const realConditionData = encodeAbiParameters(parseAbiParameters('uint256'), [1n])
const hybridData = encodeAbiParameters(
  parseAbiParameters('address conditionAddr, bytes conditionData'),
  [realConditionAddr, realConditionData]
)

console.log('[1] Condition setup:')
console.log(`    readConditionAddr: ${ALWAYS_TRUE} (always-true)`)
console.log(`    realCondition:     NativeBalance(1 wei) @ ${NATIVE_BAL}`)

// Step 2: Publish (uploadFile)
console.log('\n[2] Publishing content...')
const { uuid } = await cdrClient.uploader.uploadFile({
  content: new TextEncoder().encode('# Hybrid Test\n\nIf you can read this, hybrid conditions work!'),
  storageProvider: {
    async upload(data) {
      // Minimal in-memory "storage" — just return a fake CID for this test
      // In production this would be Pinata
      globalThis.__testData = data
      return 'test-cid-' + Date.now()
    },
    async download() {
      return globalThis.__testData
    },
  },
  updatable: false,
  writeConditionAddr: OPEN_WRITE,
  writeConditionData: '0x',
  readConditionAddr: ALWAYS_TRUE,
  readConditionData: hybridData,
  accessAuxData: '0x',
})
console.log(`    UUID: ${uuid}`)

// Step 3: Simulate frontend read flow
console.log('\n[3] Simulating frontend read...')

// Read vault
const vault = await publicClient.readContract({ address: CDR_ADDR, abi: VAULT_ABI, functionName: 'vaults', args: [uuid] })
console.log(`    readConditionAddr: ${vault.readConditionAddr}`)

// Decode hybrid
let conditionAddr = vault.readConditionAddr
let conditionData = vault.readConditionData

if (vault.readConditionAddr.toLowerCase() === ALWAYS_TRUE.toLowerCase()) {
  const [decoded_addr, decoded_data] = decodeAbiParameters(
    parseAbiParameters('address conditionAddr, bytes conditionData'),
    vault.readConditionData
  )
  conditionAddr = decoded_addr
  conditionData = decoded_data
  console.log(`    Decoded real condition: ${conditionAddr}`)
}

// Check condition
const canRead = await publicClient.readContract({
  address: conditionAddr,
  abi: CONDITION_ABI,
  functionName: 'checkReadCondition',
  args: [uuid, conditionData, '0x', account.address],
})
console.log(`    canRead: ${canRead}`)

if (!canRead) {
  console.log('\n=== FAILED: condition check failed (expected pass) ===')
  process.exit(1)
}

// Step 4: CDR read (the always-true contract allows this)
console.log('\n[4] CDR downloadFile...')
const { content } = await cdrClient.consumer.downloadFile({
  uuid,
  accessAuxData: '0x',
  storageProvider: {
    async upload(data) { globalThis.__testData = data; return 'x' },
    async download() { return globalThis.__testData },
  },
  timeoutMs: 60_000,
})

console.log(`    Content: ${new TextDecoder().decode(content)}`)
console.log('\n=== SUCCESS ===')
console.log('Hybrid conditions work end-to-end!')
