/**
 * Test: use real NativeBalanceCondition directly as readConditionAddr (no always-true bypass).
 * If CDR validators can call our Solidity contract, downloadFile will succeed.
 * Run: node --env-file=.env.local scripts/test-real-condition.mjs
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import {
  createPublicClient, createWalletClient, http, defineChain,
  encodeAbiParameters, parseAbiParameters,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const addresses = require('../deployments/addresses.json')

const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const RPC_URL = 'https://aeneid.storyrpc.io'
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

if (!JWT || !PK) { console.error('Missing JWT or PK'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

class PinataStorage {
  async upload(data) {
    const form = new FormData()
    form.append('file', new Blob([data.buffer], { type: 'application/octet-stream' }), 'content.bin')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST', headers: { Authorization: `Bearer ${JWT}` }, body: form,
    })
    if (!res.ok) throw new Error(`Pinata (${res.status}): ${await res.text()}`)
    return (await res.json()).IpfsHash
  }
  async download(cid) {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    throw new Error(`IPFS: ${cid}`)
  }
}

await initWasm()

const account      = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient    = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })
const storage      = new PinataStorage()

// Real condition: NativeBalanceCondition, min 0.001 IP
const NATIVE_BAL_ADDR = addresses.contracts.NativeBalanceCondition  // 0xc65ffE2fB85da3201731a2866b311bCb299C59b1
const OPEN_WRITE_ADDR = addresses.contracts.OpenWriteCondition      // 0x7131CfA02099f0308f1e864bbb8F047269C66046

const conditionData = encodeAbiParameters(
  parseAbiParameters('uint256 minWei'),
  [BigInt('1000000000000000')] // 0.001 IP — easy to pass
)

console.log('=== TEST: Real condition contract as readConditionAddr ===')
console.log('readConditionAddr:', NATIVE_BAL_ADDR)
console.log('Condition: NativeBalanceCondition, min 0.001 IP')
console.log()

// ── Step 1: Upload with real condition ───────────────────────────────────────
console.log('[1] Uploading vault with real readConditionAddr...')
let uuid
try {
  const result = await cdrClient.uploader.uploadFile({
    content: new TextEncoder().encode('CDR real condition test — if you read this, it works!'),
    storageProvider: storage,
    updatable: false,
    writeConditionAddr: OPEN_WRITE_ADDR,    // real v2 OpenWriteCondition
    writeConditionData: '0x',
    readConditionAddr: NATIVE_BAL_ADDR,   // <-- real v2 contract, NOT always-true
    readConditionData: conditionData,
    accessAuxData: '0x',
  })
  uuid = result.uuid
  console.log('  Upload OK. UUID:', uuid)
} catch (err) {
  console.error('  Upload FAILED:', err.message?.slice(0, 300))
  if (err.cause) console.error('  cause:', err.cause?.message?.slice(0, 200))
  process.exit(1)
}

// ── Step 2: Try to download ──────────────────────────────────────────────────
console.log()
console.log('[2] Attempting download (CDR validators must call our contract)...')
console.log('    Wallet:', account.address)
console.log('    Waiting up to 120s for validator partial decryptions...')

try {
  const { content } = await cdrClient.consumer.downloadFile({
    uuid,
    accessAuxData: '0x',
    storageProvider: storage,
    timeoutMs: 120_000,
  })
  const text = new TextDecoder().decode(content)
  console.log()
  console.log('SUCCESS — CDR validators called our Solidity contract!')
  console.log('   Decrypted:', text)
} catch (err) {
  console.log()
  console.log('FAILED — validators could not verify via our contract')
  console.log('   Error:', err.message?.slice(0, 300))
  if (err.cause) console.log('   Cause:', err.cause?.message?.slice(0, 200))
}
