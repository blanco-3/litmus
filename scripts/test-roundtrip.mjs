/**
 * Test: upload a small file then immediately download it.
 * This tests if the CDR read flow works at all right now.
 * Run: node --env-file=.env.local scripts/test-roundtrip.mjs
 */

import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain, encodeAbiParameters, parseAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'
const RPC_URL = 'https://aeneid.storyrpc.io'

if (!JWT) { console.error('Missing NEXT_PUBLIC_PINATA_JWT'); process.exit(1) }
if (!PK)  { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315,
  name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
})

class PinataStorage {
  async upload(data) {
    const form = new FormData()
    form.append('file', new Blob([data.buffer], { type: 'application/octet-stream' }), 'test.bin')
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

console.log(`\n=== CDR Round-trip Test ===`)
console.log(`Wallet: ${account.address}`)
console.log(`API:    ${API_URL}\n`)

console.log('[1] Initializing WASM...')
await initWasm()
console.log('  OK')

const client = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })

// Encode a simple open-write condition using OpenWriteCondition from addresses.json
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const addresses = require('../deployments/addresses.json')
// Use fresh contract addresses (both write and read conditions must match new interface)
const OPEN_WRITE_ADDR = addresses.contracts.OpenWriteCondition   // new: checkWriteCondition(uint32,bytes,bytes,address)
const NATIVE_BAL_ADDR = addresses.contracts.NativeBalanceCondition  // new: checkReadCondition(uint32,bytes,bytes,address)

// Open read condition: NativeBalanceCondition with minWei=1
const readConditionData = encodeAbiParameters(
  parseAbiParameters('uint256'),
  [1n]
)

console.log(`\n[2] Uploading test file...`)
console.log(`  Write condition: OpenWriteCondition @ ${OPEN_WRITE_ADDR}`)
console.log(`  Read condition: NativeBalanceCondition @ ${NATIVE_BAL_ADDR} (1 wei min)`)
let uuid
try {
  const start = Date.now()
  const result = await client.uploader.uploadFile({
    content: new TextEncoder().encode('Hello from Litmus roundtrip test! ' + new Date().toISOString()),
    storageProvider: new PinataStorage(),
    writeConditionAddr: OPEN_WRITE_ADDR,
    writeConditionData: '0x',
    readConditionAddr: NATIVE_BAL_ADDR,
    readConditionData,
    accessAuxData: '0x',
    updatable: false,
  })
  uuid = result.uuid
  console.log(`  OK! UUID: ${uuid} (${Date.now() - start}ms)`)
} catch (err) {
  console.error(`  FAILED: ${err.message}`)
  if (err.cause) console.error(`  cause: ${err.cause?.message}`)
  process.exit(1)
}

console.log(`\n[3] Waiting 5s for tx to be indexed...`)
await new Promise(r => setTimeout(r, 5000))

console.log(`\n[4] Downloading UUID ${uuid}...`)
try {
  const start = Date.now()
  const result = await client.consumer.downloadFile({
    uuid,
    accessAuxData: '0x',
    storageProvider: new PinataStorage(),
    timeoutMs: 90_000,
  })
  const text = new TextDecoder().decode(result.content)
  console.log(`  OK! (${Date.now() - start}ms)`)
  console.log(`  Content: ${text}`)
  console.log('\n=== SUCCESS ===')
} catch (err) {
  console.error(`  FAILED: ${err.message}`)
  if (err.cause) console.error(`  cause: ${err.cause?.message}`)
  if (err.stack) console.error(`\n${err.stack}`)
  process.exit(1)
}
