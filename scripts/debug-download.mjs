/**
 * Debug: simulate the full downloadFile flow from Node.js
 * Run: node --env-file=.env.local scripts/debug-download.mjs [uuid]
 * Default UUID: 4302 (needs ≥ 1 wei IP, open to anyone on testnet)
 */

import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain, encodeAbiParameters, parseAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'
const RPC_URL = 'https://aeneid.storyrpc.io'
const UUID    = Number(process.argv[2] ?? 4302)

if (!JWT) { console.error('Missing NEXT_PUBLIC_PINATA_JWT'); process.exit(1) }
if (!PK)  { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315,
  name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
})

const CDR_ADDR = '0xcccccc0000000000000000000000000000000005'
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
  outputs: [{ name: '', type: 'bool' }],
}]

class PinataStorage {
  async upload(data) {
    const form = new FormData()
    form.append('file', new Blob([data.buffer], { type: 'application/octet-stream' }), 'content.bin')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST', headers: { Authorization: `Bearer ${JWT}` }, body: form,
    })
    if (!res.ok) throw new Error(`Pinata upload failed: ${await res.text()}`)
    return (await res.json()).IpfsHash
  }
  async download(cid) {
    console.log(`  [IPFS] Downloading CID: ${cid}`)
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    throw new Error(`IPFS download failed: ${cid}`)
  }
}

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient  = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient  = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })

console.log(`\n=== CDR Download Debug ===`)
console.log(`UUID:    ${UUID}`)
console.log(`Wallet:  ${account.address}`)
console.log(`API URL: ${API_URL}\n`)

// Step 1: init WASM
console.log('[1/5] Initializing CDR WASM...')
await initWasm()
console.log('  OK\n')

// Step 2: read vault on-chain
console.log('[2/5] Reading vault from chain...')
let vault
try {
  vault = await publicClient.readContract({
    address: CDR_ADDR, abi: VAULT_ABI, functionName: 'vaults', args: [UUID],
  })
  console.log(`  readConditionAddr: ${vault.readConditionAddr}`)
  console.log(`  writeConditionAddr: ${vault.writeConditionAddr}`)
  console.log(`  readConditionData: ${vault.readConditionData.slice(0, 66)}...`)
  console.log(`  encryptedData length: ${vault.encryptedData.length} bytes\n`)
} catch (err) {
  console.error(`  FAILED: ${err.message}`)
  process.exit(1)
}

// Step 3: off-chain condition check
console.log('[3/5] Checking read condition...')
try {
  const canRead = await publicClient.readContract({
    address: vault.readConditionAddr,
    abi: CONDITION_ABI,
    functionName: 'checkReadCondition',
    args: [UUID, vault.readConditionData, '0x', account.address],
  })
  console.log(`  canRead: ${canRead}`)
  if (!canRead) {
    console.error('  Wallet does not meet the read condition. Aborting.')
    process.exit(1)
  }
  console.log('  OK\n')
} catch (err) {
  console.error(`  FAILED: ${err.message}`)
  process.exit(1)
}

// Step 4: CDR downloadFile
console.log('[4/5] Calling CDR downloadFile (this requests partial decryptions from validators)...')
const client = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })

let content
try {
  const start = Date.now()
  const result = await client.consumer.downloadFile({
    uuid: UUID,
    accessAuxData: '0x',
    storageProvider: new PinataStorage(),
    timeoutMs: 60_000,
  })
  content = result.content
  console.log(`  OK (${Date.now() - start}ms)\n`)
} catch (err) {
  console.error(`  FAILED: ${err.message}`)
  if (err.cause) console.error(`  cause: ${err.cause?.message}`)
  if (err.stack) console.error(`\n${err.stack}`)
  process.exit(1)
}

// Step 5: decode
console.log('[5/5] Decoding content...')
const text = new TextDecoder().decode(content)
console.log(`  Length: ${text.length} chars`)
console.log('\n--- Content preview (first 400 chars) ---')
console.log(text.slice(0, 400))
console.log('\n=== SUCCESS ===\n')
