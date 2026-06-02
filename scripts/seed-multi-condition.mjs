/**
 * Seed MultiCondition demo vaults on Litmus.
 *
 * Vault A: NFTHolder (LitmusPass) AND NativeBalance (>= 1 IP)
 * Vault B: TokenBalance (>= 100 LCOIN) OR NativeBalance (>= 1 IP)
 *
 * Run: node --env-file=.env.local scripts/seed-multi-condition.mjs
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

const {
  OpenWriteCondition:     OPEN_WRITE,
  NFTHolderCondition:     NFT_HOLDER,
  TokenBalanceCondition:  TOKEN_BAL,
  NativeBalanceCondition: NATIVE_BAL,
  MultiCondition:         MULTI_COND,
  LitmusPass:             LITMUS_PASS,
  LitmusCoin:             LITMUS_COIN,
} = addresses.contracts

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

const enc = (types, values) => encodeAbiParameters(parseAbiParameters(types), values)

// ── Individual condition datas ───────────────────────────────────────────────

// NFTHolder: abi.encode(address nftContract, uint256 minBalance)
const nftData = enc('address nftContract, uint256 minBalance', [LITMUS_PASS, 1n])

// NativeBalance: abi.encode(uint256 minWei)
const nativeData = enc('uint256 minWei', [1n * 10n ** 18n])

// TokenBalance: abi.encode(address token, uint256 minAmount)
const tokenData = enc('address token, uint256 minAmount', [LITMUS_COIN, 100n * 10n ** 18n])

// ── MultiCondition readConditionDatas ────────────────────────────────────────

// Vault A: [NFTHolder, NativeBalance], operators=[true]  (AND)
const multiDataAnd = enc(
  'address[] conditions, bytes[] conditionDatas, bool[] isAnd',
  [
    [NFT_HOLDER, NATIVE_BAL],
    [nftData, nativeData],
    [true],
  ]
)

// Vault B: [TokenBalance, NativeBalance], operators=[false]  (OR)
const multiDataOr = enc(
  'address[] conditions, bytes[] conditionDatas, bool[] isAnd',
  [
    [TOKEN_BAL, NATIVE_BAL],
    [tokenData, nativeData],
    [false],
  ]
)

// ── Vault definitions ─────────────────────────────────────────────────────────

const VAULTS = [
  {
    id: 'A',
    title: '[Multi-Condition AND] NFT Pass + 1 IP Required',
    conditionPreview: 'Hold Litmus Pass NFT AND hold >= 1 IP',
    readConditionAddr: MULTI_COND,
    readConditionData: multiDataAnd,
    content: `# Multi-Condition Gate: NFT AND Balance

This vault requires BOTH conditions:
1. Hold a Litmus Pass NFT
2. Hold >= 1 IP native token

Both must be true simultaneously.

---

## Composable Access Control

Litmus MultiCondition lets you combine any conditions with AND/OR logic.
Stack as many as you need — the CDR validators enforce the combined rule on-chain.

**Use cases:**
- "Tier 1 NFT holder AND staker" -> exclusive research
- "DAO member AND governance voter" -> proposal drafts
- "License holder AND subscriber" -> premium IP content
`,
  },
  {
    id: 'B',
    title: '[Multi-Condition OR] 100 LCOIN or 1 IP',
    conditionPreview: 'Hold >= 100 LCOIN OR hold >= 1 IP',
    readConditionAddr: MULTI_COND,
    readConditionData: multiDataOr,
    content: `# Multi-Condition Gate: Token OR Balance

This vault unlocks if EITHER condition is true:
1. Hold >= 100 LCOIN tokens
2. Hold >= 1 IP native token

Either one works.

---

## OR Logic for Broader Access

OR conditions let multiple communities access the same content without requiring all criteria.

**Use cases:**
- "Discord OG role OR NFT holder" -> merged community content
- "Token holder OR early contributor" -> combined tier access
- "Any supported asset holder" -> DeFi protocol research
`,
  },
]

// ── Pinata helpers ────────────────────────────────────────────────────────────

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

async function pinMeta({ uuid, title, conditionPreview }) {
  const createdAt = Date.now()
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pinataContent: { uuid, title, conditionPreview, createdAt },
      pinataMetadata: {
        name: `litmus-meta-${uuid}`,
        keyvalues: {
          litmus: '1',
          uuid: String(uuid),
          title: title.slice(0, 200),
          conditionPreview: conditionPreview.slice(0, 500),
          createdAt: String(createdAt),
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`Pinata meta (${res.status}): ${await res.text()}`)
}

// ── On-chain verification ─────────────────────────────────────────────────────
//
// NOTE on self-reading sub-conditions:
// All tier1/tier2 condition contracts deployed on Aeneid use the self-reading pattern:
//   bytes memory conditionData = CDR.vaults(uuid).readConditionData;
// They IGNORE the conditionData argument passed by MultiCondition and always read
// from the vault identified by the UUID argument.
//
// When MultiCondition calls a sub-condition it passes the PARENT vault UUID (e.g. 5349),
// so the sub-condition reads the parent vault's readConditionData (the MultiCondition
// ABI blob), not its own sub-condition params.
//
// Consequence: NFTHolderCondition will revert (can't decode multi-blob as (address,uint256)).
//              NativeBalanceCondition will decode the first 32 bytes as a uint256 offset (0x60=96)
//              and return false (96 wei < 1e18).
//
// This means MultiCondition + self-reading sub-conditions do NOT work end-to-end with the
// current deployed contracts. The CDR validators will observe the same revert/false in
// production. The vaults are correctly seeded; this is an architectural constraint of the
// self-reading pattern — sub-condition contracts need their own vault UUIDs to self-read from,
// which is not possible inside a MultiCondition composition.
//
// Verification below calls MultiCondition directly to show the actual on-chain behaviour.

// checkReadCondition(uint32 uuid, bytes conditionData, bytes accessAuxData, address reader)
// selector: 0x8db3eb17
async function verifyMultiCondition(publicClient, uuid, reader) {
  // Call MultiCondition contract directly (not CDR precompile — that's validator-only)
  const calldata =
    '0x8db3eb17' +
    encodeAbiParameters(
      parseAbiParameters('uint32, bytes, bytes, address'),
      [uuid, '0x', '0x', reader]
    ).slice(2)

  const result = await publicClient.call({
    to: MULTI_COND,
    data: calldata,
  })
  if (!result.data || result.data === '0x') return { ok: false, raw: '0x' }
  return { ok: result.data.endsWith('1'), raw: result.data }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('Initializing CDR WASM...')
await initWasm()

const account      = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient    = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })
const storage      = new PinataStorage()

console.log(`Seed wallet: ${account.address}`)

const results = []

for (const vault of VAULTS) {
  console.log(`\n--- Vault ${vault.id}: "${vault.title}" ---`)
  console.log(`  readConditionAddr: ${vault.readConditionAddr}`)
  console.log(`  readConditionData (first 66 chars): ${vault.readConditionData.slice(0, 66)}...`)

  try {
    const { uuid } = await cdrClient.uploader.uploadFile({
      content: new TextEncoder().encode(vault.content),
      storageProvider: storage,
      updatable: false,
      writeConditionAddr: OPEN_WRITE,
      writeConditionData: '0x',
      readConditionAddr: vault.readConditionAddr,
      readConditionData: vault.readConditionData,
      accessAuxData: '0x',
    })
    console.log(`  UUID: ${uuid}`)

    await pinMeta({ uuid, title: vault.title, conditionPreview: vault.conditionPreview })
    console.log(`  Metadata pinned.`)

    // Verify by calling MultiCondition directly (CDR precompile is validator-only)
    console.log(`  Verifying: calling MultiCondition directly for ${account.address}...`)
    let verifyResult = { ok: false, raw: '0x' }
    let verifyError = null
    try {
      verifyResult = await verifyMultiCondition(publicClient, uuid, account.address)
    } catch (verifyErr) {
      verifyError = verifyErr.message?.slice(0, 200)
      console.warn(`  MultiCondition call reverted: ${verifyError}`)
      console.warn('  (Expected: self-reading sub-conditions read the parent vault blob, not their own params)')
    }
    if (!verifyError) {
      console.log(`  MultiCondition.checkReadCondition = ${verifyResult.ok}  (raw: ${verifyResult.raw})`)
    }

    results.push({ vault: vault.id, uuid, canRead: verifyResult.ok, verifyError })
  } catch (err) {
    console.error(`  FAILED: ${err.message?.slice(0, 300)}`)
    if (err.cause) console.error(`    Cause: ${err.cause?.message?.slice(0, 200)}`)
    results.push({ vault: vault.id, uuid: null, canRead: false, error: err.message })
  }
}

console.log('\n========== RESULTS ==========')
for (const r of results) {
  if (r.uuid !== null) {
    const verifyNote = r.verifyError
      ? `verify=REVERTED (self-reading sub-conditions read parent vault blob)`
      : `MultiCondition.checkReadCondition=${r.canRead}`
    console.log(`Vault ${r.vault}: UUID=${r.uuid}  ${verifyNote}`)
  } else {
    console.log(`Vault ${r.vault}: SEEDING FAILED — ${r.error?.slice(0, 200)}`)
  }
}
console.log('\nNote: CDR validators call MultiCondition → MultiCondition calls sub-conditions with')
console.log('parent UUID. Self-reading sub-conditions then read the parent vault blob (MultiCondition')
console.log('ABI data) instead of their own params, causing revert/false. This is a known constraint')
console.log('of the self-reading pattern when used as MultiCondition sub-conditions.')
console.log('\nDone.')
