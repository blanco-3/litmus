/**
 * Check CDR precompile health: DKG state + write/read simulation.
 * Run periodically to know when the DKG resharing is complete.
 * Run: node --env-file=.env.local scripts/check-cdr.mjs
 */

import { createPublicClient, createWalletClient, http, defineChain, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { cdrAbi, contractAddresses } from '@piplabs/cdr-contracts'
import { initWasm } from '@piplabs/cdr-sdk'
import { generateEphemeralKeyPair } from '@piplabs/cdr-crypto'

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
const CDR = contractAddresses['testnet'].cdr

console.log(`\n=== CDR Health Check ===`)
console.log(`Wallet: ${account.address}`)
console.log(`API:    ${API_URL}\n`)

// 1. DKG state
console.log('[1] DKG State:')
let allResharingDone = true
for (const round of [12, 13, 14]) {
  try {
    const r = await fetch(`${API_URL}/dkg/dkg_network?round=${round}`)
    const d = await r.json()
    if (d.code === 200 && d.msg?.network) {
      const n = d.msg.network
      console.log(`  Round ${n.round}: stage=${n.stage} resharing=${n.is_resharing}`)
      if (n.is_resharing) allResharingDone = false
    } else {
      console.log(`  Round ${round}: not found`)
    }
  } catch(e) { console.log(`  Round ${round}: error`) }
}

try {
  const r = await fetch(`${API_URL}/dkg/latest_active`)
  const d = await r.json()
  const n = d.msg?.network
  console.log(`  Latest active: round=${n?.round} stage=${n?.stage} resharing=${n?.is_resharing}`)
  console.log(`  Group pubkey: ${d.msg?.network?.global_public_key?.slice(0,20)}...`)
} catch(e) { console.log(`  latest_active error: ${e.message}`) }

// 2. allocate simulation (always should work)
console.log('\n[2] allocate() simulation:')
try {
  await publicClient.simulateContract({
    address: CDR, abi: cdrAbi, functionName: 'allocate',
    args: [false, '0x33a8c792c8c2466d42C45F44c22420ACbB0fcc85', '0x9fA4fB22820093B33a5B1CfD5CC2C66752B0d79F', '0x', '0x0000000000000000000000000000000000000000000000000000000000000001'],
    account: account.address, value: 0n
  })
  console.log('  OK ✓')
} catch(e) {
  console.log(`  FAILED ✗: ${e.shortMessage ?? e.message}`)
}

// 3. write() via full uploadFile (tests both write condition and ciphertext)
console.log('\n[3] write() via uploadFile (new write conditions):')
await initWasm()

import { createWalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CDRClient } from '@piplabs/cdr-sdk'
import { createRequire } from 'module'
const require2 = createRequire(import.meta.url)
const addresses = require2('../deployments/addresses.json')

const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })

try {
  const { uuid } = await cdrClient.uploader.uploadFile({
    content: new TextEncoder().encode('check-cdr health test'),
    storageProvider: {
      async upload() { return 'Qmbadcid' },
      async download() { return new Uint8Array() }
    },
    writeConditionAddr: addresses.contracts.OpenWriteCondition,
    writeConditionData: '0x',
    readConditionAddr: addresses.contracts.NativeBalanceCondition,
    readConditionData: '0x0000000000000000000000000000000000000000000000000000000000000001',
    accessAuxData: '0x',
    updatable: false,
  })
  console.log(`  OK ✓ UUID: ${uuid} — write() is working!`)
} catch(e) {
  const msg = e.shortMessage ?? e.message ?? e.cause?.message
  console.log(`  FAILED ✗: ${(msg ?? '').slice(0, 120)}`)
}

// 4. read() simulation on existing vault 4310
console.log('\n[4] read() simulation on vault 4310:')
try {
  const kp = generateEphemeralKeyPair()
  await publicClient.simulateContract({
    address: CDR, abi: cdrAbi, functionName: 'read',
    args: [4310, '0x', toHex(kp.publicKey)],
    account: account.address, value: 0n
  })
  console.log('  OK ✓ (read simulation passed — DKG is working!)')
} catch(e) {
  const msg = e.shortMessage ?? e.message
  console.log(`  FAILED ✗: ${msg.slice(0, 100)}`)
}

console.log('\n=== Summary ===')
console.log('If write() and read() simulations pass, run: node --env-file=.env.local scripts/seed-vaults.mjs')
