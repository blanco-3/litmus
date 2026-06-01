/**
 * Simulate CDR read() with a proper ephemeral keypair to isolate revert reason
 * Run: node --env-file=.env.local scripts/sim-read.mjs [uuid]
 */

import { createPublicClient, createWalletClient, http, defineChain, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { generateEphemeralKeyPair } from '@piplabs/cdr-crypto'
import { cdrAbi, contractAddresses } from '@piplabs/cdr-contracts'

const PK      = process.env.SEED_PRIVATE_KEY
const RPC_URL = 'https://aeneid.storyrpc.io'
const UUID    = Number(process.argv[2] ?? 4310)

if (!PK) { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315,
  name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
})

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })

console.log(`\n=== CDR Read Simulation for UUID ${UUID} ===`)
console.log(`Wallet: ${account.address}\n`)

// Get CDR address from SDK
const CDR_ADDR = contractAddresses['testnet']?.cdr
console.log(`CDR address from SDK: ${CDR_ADDR}`)

// Generate ephemeral keypair (what the SDK uses internally)
const kp = generateEphemeralKeyPair()
const requesterPubKey = toHex(kp.publicKey)
console.log(`Ephemeral pubkey (${kp.publicKey.length} bytes): ${requesterPubKey.slice(0, 20)}...`)

// Check fee
let fee = 0n
try {
  fee = await publicClient.readContract({
    address: CDR_ADDR,
    abi: cdrAbi,
    functionName: 'readFee',
  })
  console.log(`Read fee: ${fee} wei`)
} catch (e) {
  console.log(`readFee error: ${e.message}`)
}

// Simulate
console.log(`\nSimulating read(${UUID}, 0x, pubkey) with value=${fee}...`)
try {
  const result = await publicClient.simulateContract({
    address: CDR_ADDR,
    abi: cdrAbi,
    functionName: 'read',
    args: [UUID, '0x', requesterPubKey],
    account: account.address,
    value: fee,
  })
  console.log('Simulation SUCCESS:', result)
} catch (err) {
  console.log(`Simulation FAILED: ${err.shortMessage ?? err.message}`)
  if (err.cause) console.log(`  cause: ${err.cause?.message?.slice(0, 300)}`)
  if (err.metaMessages) err.metaMessages.forEach(m => console.log(`  meta: ${m}`))
  if (err.details) console.log(`  details: ${err.details}`)
}

// Also check if there's a newer CDR ABI function signature for read
console.log('\n=== CDR ABI read() function ===')
const readFn = cdrAbi.find(f => f.name === 'read' && f.type === 'function')
if (readFn) {
  console.log(`Inputs: ${readFn.inputs.map(i => `${i.type} ${i.name}`).join(', ')}`)
} else {
  console.log('read() not found in cdrAbi')
}

// Also check readFee signature
const readFeeFn = cdrAbi.find(f => f.name === 'readFee')
console.log(`readFee outputs: ${readFeeFn?.outputs?.map(o => o.type).join(', ')}`)

// Check vaults() function
const vaultsFn = cdrAbi.find(f => f.name === 'vaults')
if (vaultsFn) {
  console.log(`vaults() outputs: ${JSON.stringify(vaultsFn.outputs?.[0]?.components?.map(c => c.name))}`)
}

// Try to read vault via SDK ABI
console.log('\n=== Reading vault 4310 via SDK ABI ===')
try {
  const vault = await publicClient.readContract({
    address: CDR_ADDR,
    abi: cdrAbi,
    functionName: 'vaults',
    args: [UUID],
  })
  console.log(`Vault:`, vault)
} catch (e) {
  console.log(`vaults() error: ${e.message}`)
}
