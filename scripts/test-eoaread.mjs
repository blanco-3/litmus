/**
 * Isolation test: allocate+write+read with EOA as readConditionAddr
 * (exactly like jacob-tucker/cdr-skill example 01-encrypt-text.ts)
 *
 * If read() succeeds here → our condition contracts have wrong interface
 * If read() also fails  → DKG/infra is the problem
 *
 * Run: node --env-file=.env.local scripts/test-eoaread.mjs
 */

import { CDRClient, initWasm, uuidToLabel } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain, encodeAbiParameters, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const PK      = process.env.SEED_PRIVATE_KEY
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'
const RPC_URL = 'https://aeneid.storyrpc.io'

if (!PK) { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315,
  name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
})

// Reference impl uses this address — same OwnerWriteCondition, different deployment
const OWNER_WRITE_CONDITION = '0x4C9bFC96d7092b590D497A191826C3dA2277c34B'

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const client = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })

console.log(`\n=== EOA Read Condition Isolation Test ===`)
console.log(`Wallet: ${account.address}`)
console.log(`API:    ${API_URL}\n`)

// Step 1: Init WASM
console.log('[1] Initializing WASM...')
await initWasm()
console.log('    OK\n')

const owner = account.address

// Step 2: Allocate — EOA as readConditionAddr (exactly like reference impl)
console.log('[2] Allocating vault (EOA read condition)...')
const writeConditionData = encodeAbiParameters([{ type: 'address' }], [owner])
let uuid
try {
  const result = await client.uploader.allocate({
    updatable: false,
    writeConditionAddr: OWNER_WRITE_CONDITION,
    writeConditionData,
    readConditionAddr: owner,   // ← EOA, not a contract
    readConditionData: '0x',
    skipConditionValidation: true,
  })
  uuid = result.uuid
  console.log(`    UUID: ${uuid}  tx: ${result.txHash}\n`)
} catch (err) {
  console.error(`    FAILED: ${err.message}`)
  process.exit(1)
}

// Step 3: Encrypt
console.log('[3] Encrypting secret...')
const secret = 'litmus-eoaread-test-' + Date.now()
const dataKey = new TextEncoder().encode(secret)
const globalPubKey = await client.observer.getGlobalPubKey()
const label = uuidToLabel(uuid)
const ciphertext = await client.uploader.encryptDataKey({ dataKey, globalPubKey, label })
console.log(`    label: ${toHex(label).slice(0, 18)}...\n`)

// Step 4: Write
console.log('[4] Writing ciphertext on-chain...')
try {
  const { txHash } = await client.uploader.write({
    uuid,
    accessAuxData: '0x',
    encryptedData: toHex(ciphertext.raw),
  })
  console.log(`    tx: ${txHash}\n`)
} catch (err) {
  console.error(`    FAILED: ${err.message}`)
  process.exit(1)
}

// Step 5: Read — this is the critical test
console.log('[5] Attempting accessCDR (read + partial decryption)...')
console.log('    (timeout 120s)\n')
try {
  const { dataKey: recovered, txHash } = await client.consumer.accessCDR({
    uuid,
    accessAuxData: '0x',
    timeoutMs: 120_000,
  })
  const text = new TextDecoder().decode(recovered)
  console.log(`    READ TX: ${txHash}`)
  console.log(`    Decrypted: ${text}`)
  console.log('\n=== SUCCESS — EOA read condition works ===')
  console.log('→ Conclusion: our condition CONTRACTS likely have wrong interface\n')
} catch (err) {
  console.error(`    FAILED: ${err.message}`)
  if (err.cause) console.error(`    cause: ${err.cause?.message ?? err.cause}`)
  console.log('\n=== FAILED — same error as condition contracts ===')
  console.log('→ Conclusion: DKG/infra is the blocker, not our contracts\n')
}
