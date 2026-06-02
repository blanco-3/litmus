/**
 * Seed English-language vaults for all condition types.
 * Uses real condition contracts directly as readConditionAddr (v1 interface).
 * Run: node --env-file=.env.local scripts/seed-english-vaults.mjs
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
  OpenWriteCondition: OPEN_WRITE,
  NFTHolderCondition: NFT_HOLDER,
  TokenBalanceCondition: TOKEN_BAL,
  TxCountCondition: TX_COUNT,
  ActivityRegistry: ACTIVITY_REG,
  StoryIPLicenseCondition: STORY_LIC_COND,
  NativeBalanceCondition: NATIVE_BAL,
  TimeLockedCondition: TIME_LOCKED,
  LitmusPass: LITMUS_PASS,
  LitmusCoin: LITMUS_COIN,
  StoryLicenseToken: STORY_LICENSE_TOKEN,
} = addresses.contracts

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

const enc = (types, values) => encodeAbiParameters(parseAbiParameters(types), values)

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
        keyvalues: { litmus: '1', uuid: String(uuid), title: title.slice(0, 200), conditionPreview: conditionPreview.slice(0, 500), createdAt: String(createdAt) },
      },
    }),
  })
  if (!res.ok) throw new Error(`Pinata meta (${res.status}): ${await res.text()}`)
}

const POSTS = [
  // ── 1. LitmusPass NFT holder ─────────────────────────────────────────────
  {
    title: '[NFT Gate] Litmus Pass Holders Only',
    conditionPreview: `Hold a Litmus Pass NFT (${LITMUS_PASS})`,
    readConditionAddr: NFT_HOLDER,
    readConditionData: enc('address nftContract, uint256 minBalance', [LITMUS_PASS, 1n]),
    content: `# Litmus Pass Holders Only

You're reading this because you hold a **Litmus Pass NFT**.

Contract: \`${LITMUS_PASS}\`

---

## NFT Gating on Litmus

Litmus lets you gate content behind ERC-721 ownership.
Any NFT collection works — blue-chip PFPs, protocol passes, membership tokens.

**Use cases:**
- Holder-only alpha and research
- Community reports for verified members
- Roadmap details for NFT holders
- Private channel content without Discord

The NFT is your key. No passwords, no accounts — just on-chain proof.

---

You hold the pass. You earned the read.
`,
  },

  // ── 2. LitmusCoin ERC-20 holder ─────────────────────────────────────────
  {
    title: '[Token Gate] Hold 100 LCOIN',
    conditionPreview: `Hold >= 100 LCOIN (${LITMUS_COIN})`,
    readConditionAddr: TOKEN_BAL,
    readConditionData: enc('address token, uint256 minAmount', [LITMUS_COIN, 100n * 10n ** 18n]),
    content: `# Token Gated Content — 100 LCOIN Required

You're in because your wallet holds at least **100 LCOIN**.

Token contract: \`${LITMUS_COIN}\`

---

## Token Gating on Litmus

Any ERC-20 token can serve as an access key.
Project tokens, governance tokens, utility tokens — set a minimum balance and only qualifying wallets get in.

**Use cases:**
- DeFi protocols: governance token holders get research reports
- GameFi: in-game token threshold unlocks strategy content
- DAOs: membership token required to read internal docs

Token holdings become **access rights**, not just financial assets.

---

Welcome, LCOIN holder.
`,
  },

  // ── 3. TxCount — 10 txs on Aeneid ───────────────────────────────────────
  {
    title: '[On-Chain OG] 10+ Transactions on Aeneid',
    conditionPreview: `Sent >= 10 transactions on Aeneid (ActivityRegistry: ${ACTIVITY_REG})`,
    readConditionAddr: TX_COUNT,
    readConditionData: enc('address registry, uint256 minCount', [ACTIVITY_REG, 10n]),
    content: `# OG-Gated Content — 10 Transactions Required

This content is unlocked for wallets with **10 or more transactions** on Aeneid testnet.

Not just a balance check — actual on-chain activity.

---

## Activity-Based Access

\`\`\`
ActivityRegistry.txCount(your_address) >= 10
\`\`\`

Litmus reads transaction count from the chain and stores it in \`ActivityRegistry\`.

---

## Why on-chain activity matters

Balances can be faked. NFTs can be borrowed.
But **transaction history is accumulated**.

"Someone who has actually used this chain" is a stronger signal than any token balance.
It's the foundation of Sybil resistance — not zero, but real participation.

---

You've been here. You have the receipts.
`,
  },

  // ── 4. Story IP License ──────────────────────────────────────────────────
  {
    title: '[Story Protocol] IP License Holders',
    conditionPreview: `Hold any Story Protocol IP License (LicenseToken: ${STORY_LICENSE_TOKEN})`,
    readConditionAddr: STORY_LIC_COND,
    readConditionData: enc('address licenseToken, uint256 licenseTermsId', [STORY_LICENSE_TOKEN, 0n]),
    content: `# Story Protocol IP License Gate

You're reading this because you hold a **Story Protocol IP License Token**.

LicenseToken: \`${STORY_LICENSE_TOKEN}\`

---

## Story Protocol + Litmus

CDR (Confidential Data Rails) is a core component of Story Protocol's infrastructure.
Litmus is built on top of CDR — one of the first content gating apps on this stack.

When a creator registers IP on Story Protocol and issues licenses:
- **License holders can be given exclusive content access**
- Example: "Only holders of my novel's remix license can read the original draft"
- Example: "Music stem files unlocked for remix license holders"

---

IP licensing becomes a **content access mechanism**.
Not just financial rights — but a key to exclusive creative work.
`,
  },

  // ── 5. Native Balance — 1 IP ─────────────────────────────────────────────
  {
    title: '[Balance Gate] Hold 1 IP',
    conditionPreview: 'Hold >= 1 IP (native token)',
    readConditionAddr: NATIVE_BAL,
    readConditionData: enc('uint256 minWei', [1n * 10n ** 18n]),
    content: `# Native Balance Gate — 1 IP Required

Your wallet holds at least **1 IP** on the Story Aeneid testnet.

---

## Native Token Gating

The simplest possible gate: do you have the network's native token?

This can serve as a basic Sybil filter — empty wallets don't get in.
Combined with other conditions via MultiCondition, it adds a soft economic barrier.

---

You have skin in the game. The gate is open.
`,
  },

  // ── 6. TimeLocked — past date ────────────────────────────────────────────
  {
    title: '[Time Lock] Unlocked After Jan 1, 2026',
    conditionPreview: 'Unlocks after 2026-01-01 (embargo gate)',
    readConditionAddr: TIME_LOCKED,
    readConditionData: enc('uint256 unlockTime', [BigInt(Math.floor(new Date('2026-01-01').getTime() / 1000))]),
    content: `# Time-Locked Content — Embargo Gate

This content was locked until **January 1, 2026**.
That date has passed — you can read it now.

---

## Time-Based Access on Litmus

\`block.timestamp >= unlockTime\` is all it takes.

**Use cases:**
- Embargoed announcements (unlock on launch day)
- Scheduled research releases
- Post-event content that unlocks automatically
- Vesting-style content access tied to time

No manual unlock needed. The chain handles it.

---

## What makes this different

Traditional embargo tools require trusting a platform to "flip the switch."
Here, the unlock is encoded in the contract — immutable and automatic.

The publisher sets the date once. After that, it's out of their hands.
`,
  },
]

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('Initializing CDR WASM...')
await initWasm()

const account      = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient    = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })
const storage      = new PinataStorage()

for (const post of POSTS) {
  console.log(`\nPublishing "${post.title}"...`)
  try {
    const { uuid } = await cdrClient.uploader.uploadFile({
      content: new TextEncoder().encode(post.content),
      storageProvider: storage,
      updatable: false,
      writeConditionAddr: OPEN_WRITE,
      writeConditionData: '0x',
      readConditionAddr: post.readConditionAddr,   // real contract, no always-true
      readConditionData: post.readConditionData,
      accessAuxData: '0x',
    })
    console.log(`  UUID: ${uuid}`)
    await pinMeta({ uuid, title: post.title, conditionPreview: post.conditionPreview })
    console.log(`  Pinned.`)
  } catch (err) {
    console.error(`  FAILED: ${err.message?.slice(0, 300)}`)
    if (err.cause) console.error(`    ${err.cause?.message?.slice(0, 200)}`)
  }
}

console.log('\nDone.')
