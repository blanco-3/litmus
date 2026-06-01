/**
 * Creates real CDR vaults on Story Aeneid testnet + pins public metadata.
 * Run:  node --env-file=.env.local scripts/seed-vaults.mjs
 */

import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createRequire } from 'module'

// ── Config ──────────────────────────────────────────────────────────────────

const require = createRequire(import.meta.url)
const addresses = require('../deployments/addresses.json')

const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const RPC_URL = 'https://aeneid.storyrpc.io'
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

if (!JWT) { console.error('Missing NEXT_PUBLIC_PINATA_JWT'); process.exit(1) }
if (!PK)  { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const OWNER_WRITE    = addresses.contracts.OwnerWriteCondition
const NATIVE_BALANCE = addresses.contracts.NativeBalanceCondition
const TIME_LOCKED    = addresses.contracts.TimeLockedCondition
const MULTI_COND     = addresses.contracts.MultiCondition

// "Always true" contract — CDR precompile compatible read condition gate.
// Real condition is packed into readConditionData via encodeHybridData().
const ALWAYS_TRUE = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'

function encodeHybridData(conditionAddr, conditionData) {
  return encodeAbiParameters(
    parseAbiParameters('address conditionAddr, bytes conditionData'),
    [conditionAddr, conditionData]
  )
}

const storyAeneid = defineChain({
  id: 1315,
  name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
})

// ── Condition helpers ────────────────────────────────────────────────────────

const enc = (types, values) => encodeAbiParameters(parseAbiParameters(types), values)

const ownerWrite = (addr) => ({
  address: OWNER_WRITE,
  conditionData: enc('address owner', [addr]),
})

const nativeBalance = (minWei) => ({
  address: NATIVE_BALANCE,
  conditionData: enc('uint256 minWei', [BigInt(minWei)]),
})

const timeLocked = (isoDate) => ({
  address: TIME_LOCKED,
  conditionData: enc('uint256 unlockTime', [BigInt(Math.floor(new Date(isoDate).getTime() / 1000))]),
})

const multi = (conditions, isAnd) => ({
  address: MULTI_COND,
  conditionData: enc(
    'address[] conditions, bytes[] conditionDatas, bool[] isAnd',
    [conditions.map(c => c.address), conditions.map(c => c.conditionData), isAnd],
  ),
})

// ── Pinata storage + metadata ────────────────────────────────────────────────

class PinataStorage {
  async upload(data) {
    const form = new FormData()
    form.append('file', new Blob([data.buffer], { type: 'application/octet-stream' }), 'content.bin')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${JWT}` },
      body: form,
    })
    if (!res.ok) throw new Error(`Pinata upload failed (${res.status}): ${await res.text()}`)
    return (await res.json()).IpfsHash
  }
  async download(cid) {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    throw new Error(`IPFS download failed: ${cid}`)
  }
}

async function pinMeta({ uuid, title, conditionPreview }) {
  const createdAt = Date.now()
  const body = {
    pinataContent: { uuid, title, conditionPreview, createdAt },
    pinataMetadata: {
      name: `litmus-meta-${uuid}`,
      keyvalues: { litmus: '1', uuid: String(uuid), title: title.slice(0, 200), conditionPreview: conditionPreview.slice(0, 500), createdAt: String(createdAt) },
    },
  }
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Pinata meta failed (${res.status}): ${await res.text()}`)
}

// ── Posts ─────────────────────────────────────────────────────────────────────

// Write condition for all seed posts — OpenWriteCondition (anyone can write once).
// OwnerWriteCondition uses v2 Solidity interface which the CDR precompile cannot call.
const openWrite = () => ({ address: addresses.contracts.OpenWriteCondition, conditionData: '0x' })

const makePosts = (walletAddr) => [
  {
    title: 'Litmus: How Prove-to-Read Works',
    conditionPreview: 'Hold ≥ 1 wei IP (open to anyone on testnet)',
    writeCond: openWrite(),
    readCond: nativeBalance('1'),
    content: `# Litmus: How Prove-to-Read Works

**Litmus** is a content gating platform built on Story Protocol's Confidential Data Rails (CDR).
Instead of a paywall, it uses a **proof wall** — access is determined by your on-chain state.

## The Flow

### Publisher
1. Write content (markdown)
2. Set an access condition (token balance, NFT, time-lock…)
3. Click **Encrypt & Publish**
   - Content is AES-encrypted client-side with a random data key
   - Encrypted file → IPFS via Pinata
   - Data key is TDH2-wrapped and stored in a CDR vault on-chain
   - A UUID is returned as the share handle

### Reader
1. Open a board post
2. Click **Verify & Decrypt**
   - Off-chain pre-check: your wallet is tested against the read condition
   - Litmus strip animates blue (pass) or red (fail)
   - If pass: CDR validators each verify the condition on-chain independently
   - Threshold of partial decryptions collected → data key reconstructed
   - IPFS file downloaded → decrypted → content displayed

## Why CDR?

No trusted server. The content stays encrypted forever on IPFS.
Only the CDR validator network can provide decryption — and only when your
wallet satisfies the condition at the moment of the request.
`,
  },
  {
    title: 'Story Aeneid Testnet: Getting IP Tokens',
    conditionPreview: 'Hold ≥ 1000000000000000000 wei IP (≥ 1 IP)',
    writeCond: openWrite(),
    readCond: nativeBalance('1000000000000000000'),
    content: `# Story Aeneid Testnet: Getting IP Tokens

This post is gated behind **holding at least 1 IP token** on the Story Aeneid testnet.

## Faucet

The official faucet for Aeneid testnet IP tokens:

**URL**: https://faucet.story.foundation/

Requires a GitHub or Twitter account. Provides enough IP for gas and CDR vault creation.

## Network Config

| Field | Value |
|-------|-------|
| Chain ID | 1315 |
| RPC | https://aeneid.storyrpc.io |
| Explorer | https://aeneid.storyscan.xyz |
| Symbol | IP |

## Adding to MetaMask

1. Open MetaMask → Networks → Add Network
2. Enter the values above
3. Save and switch to Story Aeneid

Now you can request IP from the faucet and interact with Litmus.
`,
  },
  {
    title: 'CDR Deep Dive: TDH2 Threshold Encryption',
    conditionPreview: 'Hold ≥ 5000000000000000000 wei IP (≥ 5 IP)',
    writeCond: openWrite(),
    readCond: nativeBalance('5000000000000000000'),
    content: `# CDR Deep Dive: TDH2 Threshold Encryption

You need **5 IP** to access this. Here's why threshold crypto matters.

## TDH2 — Threshold Decryption Scheme

CDR uses **TDH2** (Threshold Decryption with Hashed ElGamal):

- **Threshold**: t-of-n validators must cooperate to decrypt
- **Non-interactive**: validators don't talk to each other — you collect partial decryptions
- **Verifiable**: each partial decryption includes a zero-knowledge proof

## Vault Lifecycle

\`\`\`
Upload:
  data key (random AES-256)
    → TDH2 encrypt with committee public key
    → store ciphertext in CDR vault (on-chain)

Download:
  request partial decrypt from each validator
    ← validator checks readCondition(reader) on-chain
    ← if pass: returns partial_decrypt + ZK proof
  verify proofs, combine t partials
    → recover data key
  IPFS download → AES decrypt → plaintext
\`\`\`

## Why Not Lit Protocol?

CDR validators ARE Story Protocol's consensus nodes — no separate oracle network.
The read condition is your own contract, verified on-chain, not bridged.
The encryption key never touches any server.
`,
  },
  {
    title: 'Sealed Roadmap — Opens 2026-08-01',
    conditionPreview: 'Unlocks after 2026-08-01 (UTC)',
    writeCond: openWrite(),
    readCond: timeLocked('2026-08-01'),
    content: `# Sealed Roadmap

This content will be readable on **August 1, 2026**.

The TimeLocked condition uses block.timestamp — not an oracle, not a multisig.
No one can release this early, including the publisher.

When the date arrives, any wallet can read it without any action from anyone.

---

*[This demonstrates time-lock gating — a publisher can schedule content to unlock in the future.]*
`,
  },
  {
    title: 'OG Vault — 10 IP + Time Gate (AND)',
    conditionPreview: 'Hold ≥ 10000000000000000000 wei IP (≥ 10 IP)\nAND Unlocks after 2025-01-01 (UTC)',
    writeCond: openWrite(),
    readCond: multi(
      [nativeBalance('10000000000000000000'), timeLocked('2025-01-01')],
      [true]
    ),
    content: `# OG Vault — Multi-Condition Access

You passed both conditions:
- **Hold ≥ 10 IP on testnet**
- **Time gate opened** (2025-01-01)

This is a **MultiCondition** vault — two independent on-chain checks combined with AND logic.

## How MultiCondition Works

\`\`\`solidity
function checkReadCondition(
    uint32 uuid,
    bytes calldata conditionData,
    bytes calldata accessAuxData,
    address reader
) external view returns (bool) {
    (address[] memory conds, bytes[] memory datas, bool[] memory isAnd)
        = abi.decode(conditionData, (address[], bytes[], bool[]));

    bool result = IReadCondition(conds[0])
        .checkReadCondition(uuid, datas[0], accessAuxData, reader);

    for (uint i = 1; i < conds.length; i++) {
        bool next = IReadCondition(conds[i])
            .checkReadCondition(uuid, datas[i], accessAuxData, reader);
        result = isAnd[i-1] ? result && next : result || next;
    }
    return result;
}
\`\`\`

Composable. No oracle dependency. Gas-efficient.
`,
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('Initializing CDR WASM...')
await initWasm()

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
console.log(`Wallet: ${account.address}\n`)

const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })
const storage = new PinataStorage()

const POSTS = makePosts(account.address)

for (const post of POSTS) {
  console.log(`Publishing "${post.title}"...`)
  try {
    const { uuid } = await cdrClient.uploader.uploadFile({
      content: new TextEncoder().encode(post.content),
      storageProvider: storage,
      updatable: false,
      writeConditionAddr: post.writeCond.address,
      writeConditionData: post.writeCond.conditionData,
      // Hybrid: ALWAYS_TRUE gates CDR precompile; real condition packed in data
      readConditionAddr: ALWAYS_TRUE,
      readConditionData: encodeHybridData(post.readCond.address, post.readCond.conditionData),
      accessAuxData: '0x',
    })
    console.log(`  ✓ CDR vault UUID: ${uuid}`)
    await pinMeta({ uuid, title: post.title, conditionPreview: post.conditionPreview })
    console.log(`  ✓ Board metadata pinned\n`)
  } catch (err) {
    console.error(`  ✗ ${err.message?.slice(0, 200)}`)
    if (err.cause) console.error(`    ${err.cause?.message?.slice(0, 150)}\n`)
  }
}

console.log('Done. Open /board to see the results.')
