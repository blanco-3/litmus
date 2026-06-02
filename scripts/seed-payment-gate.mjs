/**
 * Seed a pay-to-read vault gated by PaymentGate (0.01 IP).
 * CDR uses always-true; frontend checks PaymentGate.hasPaid(uuid, reader) directly.
 * Run: node --env-file=.env.local scripts/seed-payment-gate.mjs
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
  PaymentGate: PG_GATE,
  PaymentGateCondition: PG_COND,
} = addresses.contracts

const ALWAYS_TRUE = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'
const REQUIRED_WEI = BigInt('10000000000000000') // 0.01 IP

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

const CONTENT = `# The Alpha Report

This article is behind a **pay-to-read** gate.

You paid **0.01 IP** directly to the publisher to unlock this content.
No intermediary. No platform cut. Instant settlement on Story Aeneid testnet.

---

## How it works

1. Publisher sets a price per vault (UUID-based)
2. Reader clicks **Pay 0.01 IP** → MetaMask sends IP to the publisher
3. \`PaymentGate.hasPaid(uuid, reader)\` becomes \`true\`
4. Content is decrypted and displayed

This is the simplest form of on-chain content monetization:
- No subscription
- No custody
- No platform middleman

---

## What this unlocks

In production this could be:
- Research reports and alpha
- Newsletter archives
- Exclusive protocol documentation
- Early access content

The price is set by the publisher. Payment is immediate and final on-chain.

You just proved it works.
`

await initWasm()
const account      = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient    = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })
const storage      = new PinataStorage()

// conditionData encodes (paymentGate, requiredWei) — uuid is not needed here
// because frontend calls hasPaid(urlUuid, reader) directly using the vault's uuid from URL
const conditionData     = encodeAbiParameters(parseAbiParameters('address, uint256'), [PG_GATE, REQUIRED_WEI])
// Hybrid: readConditionAddr = always-true, readConditionData = encode(PG_COND, conditionData)
const readConditionData = encodeAbiParameters(parseAbiParameters('address, bytes'), [PG_COND, conditionData])

console.log('Uploading vault...')
const { uuid } = await cdrClient.uploader.uploadFile({
  content: new TextEncoder().encode(CONTENT),
  storageProvider: storage,
  updatable: false,
  writeConditionAddr: OPEN_WRITE,
  writeConditionData: '0x',
  readConditionAddr: ALWAYS_TRUE,
  readConditionData,
  accessAuxData: '0x',
})
console.log('UUID:', uuid)

const REGISTER_ABI = [{
  name: 'register', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'uuid', type: 'uint32' }, { name: 'recipient', type: 'address' }, { name: 'requiredWei', type: 'uint256' }],
  outputs: [],
}]
console.log('Registering with PaymentGate...')
const hash = await walletClient.writeContract({
  address: PG_GATE, abi: REGISTER_ABI, functionName: 'register',
  args: [uuid, account.address, REQUIRED_WEI],
})
await publicClient.waitForTransactionReceipt({ hash })
console.log('Registered:', hash)

const createdAt = Date.now()
const title = '[Pay-to-Read] 0.01 IP — The Alpha Report'
const conditionPreview = 'Pay 0.01 IP to unlock · payment goes directly to publisher'
await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
  method: 'POST',
  headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pinataContent: { uuid, title, conditionPreview, createdAt },
    pinataMetadata: {
      name: `litmus-meta-${uuid}`,
      keyvalues: { litmus: '1', uuid: String(uuid), title, conditionPreview, createdAt: String(createdAt) },
    },
  }),
})
console.log('Pinned metadata.')
console.log('Done. UUID:', uuid)
