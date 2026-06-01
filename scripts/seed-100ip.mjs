/**
 * Publish two vaults gated by 100 IP.
 * Run: node --env-file=.env.local scripts/seed-100ip.mjs
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain, encodeAbiParameters, parseAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const addresses = require('../deployments/addresses.json')

const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'
const RPC_URL = 'https://aeneid.storyrpc.io'

if (!JWT || !PK) { console.error('Missing JWT or PK'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

const ALWAYS_TRUE = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'
const OPEN_WRITE  = addresses.contracts.OpenWriteCondition
const NATIVE_BAL  = addresses.contracts.NativeBalanceCondition
const MIN_100_IP  = 100n * (10n ** 18n)

const enc = (t, v) => encodeAbiParameters(parseAbiParameters(t), v)
const hybrid = (addr, data) => enc('address a, bytes b', [addr, data])
const readCondData = hybrid(NATIVE_BAL, enc('uint256 minWei', [MIN_100_IP]))
const CONDITION_PREVIEW = 'Hold \u2265 100000000000000000000 wei IP (\u2265 100 IP)'

class PinataStorage {
  async upload(data) {
    const form = new FormData()
    form.append('file', new Blob([data.buffer], { type: 'application/octet-stream' }), 'content.bin')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST', headers: { Authorization: `Bearer ${JWT}` }, body: form,
    })
    if (!res.ok) throw new Error(`Pinata: ${await res.text()}`)
    return (await res.json()).IpfsHash
  }
  async download(cid) {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    throw new Error(`IPFS: ${cid}`)
  }
}

async function pinMeta(uuid, title) {
  const createdAt = Date.now()
  const body = {
    pinataContent: { uuid, title, conditionPreview: CONDITION_PREVIEW, createdAt },
    pinataMetadata: {
      name: `litmus-meta-${uuid}`,
      keyvalues: { litmus: '1', uuid: String(uuid), title: title.slice(0, 200), conditionPreview: CONDITION_PREVIEW, createdAt: String(createdAt) },
    },
  }
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Pinata meta: ${res.status}`)
}

const POSTS = [
  {
    title: '[CLASSIFIED] Order of the Encrypted Key — Internal Memo',
    content: `# ORDER OF THE ENCRYPTED KEY
## Internal Communique — Level 5 Clearance Only

Brothers and Sisters,

If you are reading this, you have proven your commitment through the holding of 100 IP.
The digital oath of our Order is verified. Welcome.

---

## Recent Operations

**Operation SILENT LEDGER** has concluded successfully.
Three additional blockchain nodes have been initiated into the second circle.
Their identities remain sealed until the next convergence at Block #21,000,000.

**The Scroll of Nakamoto** was recovered from the Geneva dead-drop.
It contains coordinates to a cold wallet rumored to hold the last 21 BTC never to be moved.
The private key is split across seven fragments.
You hold fragment #3. Guard it with your life.

---

## Upcoming Convergence

- Date: Block #21,500,000 (approx. August 2026)
- Location: Disclosed via on-chain message to initiate wallets only
- Passphrase: Derive from keccak256(your_address + "ORDER")
- Dress code: None. This is a blockchain. We have no bodies.

---

## The Seven Tenets of the Order

1. Never share your seed phrase. Not even with us.
2. The mempool sees all. Behave accordingly.
3. A transaction once broadcast cannot be unbroadcast.
4. Smart contracts are smarter than most humans. Respect them.
5. Gas fees are the tithe of the decentralized church.
6. DYOR. Always. Even this document.
7. The Order has no leader. The Order has no office. The Order has consensus.

---

## Words of the Cipher Master

"Privacy is not secrecy. A man has the right to keep things to himself.
But the chain never forgets. Choose wisely what you commit to it."

— The Cipher Master, Block #18,000,001

---

This message is encrypted on IPFS. The Order leaves no paper trail.
Only those who hold 100 IP may read. Only those who read may know.
Only those who know may act.

Destroy after memorization. The chain already knows.
`,
  },
  {
    title: '100 IP를 모은 사람에게만 전하는 이야기',
    content: `# 100 IP를 모은 사람에게만 전하는 이야기

당신은 지금 이걸 읽고 있다.
그 말은 당신이 100 IP를 가지고 있다는 뜻이다.

테스트넷이니까 실제 돈은 아니지만 — 그래도 좋다.
이 공간에 들어오기 위해 뭔가를 했다는 사실이 중요하니까.

---

나는 요즘 이런 생각을 자주 한다.

사람들은 "비밀"이라는 말을 들으면
뭔가 어둡고 위험한 것을 떠올린다.
근데 사실 비밀이란 그냥
**내가 선택한 사람에게만 공유하는 것**이잖아.

블록체인이 그걸 코드로 구현한 거다.
조건을 만족한 사람만 읽을 수 있는 글.
열쇠는 돈이 아니라 증명이다.

---

그래서 나는 이 글을 100 IP 조건으로 걸었다.

왜 100이냐고?
그냥 좀 귀찮을 만큼 높은 숫자가 필요했다.
귀찮음을 뚫고 여기까지 온 사람이라면
이 글을 읽을 자격이 있다고 생각했다.

---

오늘 뭔가 좋은 일이 있었으면 좋겠다.
작은 거라도.

커피가 생각보다 맛있었다거나,
엘리베이터를 딱 맞게 탔다거나.

그런 작은 것들이 쌓이면
결국 꽤 괜찮은 하루가 된다.

---

다음에 또 이런 글 쓸게.
그때도 와줘.

— 익명의 발신자
`,
  },
]

await initWasm()
console.log('Initialized.\n')

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdr = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })
const storage = new PinataStorage()

for (const post of POSTS) {
  console.log(`Publishing: ${post.title}`)
  try {
    const { uuid } = await cdr.uploader.uploadFile({
      content: new TextEncoder().encode(post.content),
      storageProvider: storage,
      updatable: false,
      writeConditionAddr: OPEN_WRITE,
      writeConditionData: '0x',
      readConditionAddr: ALWAYS_TRUE,
      readConditionData: readCondData,
      accessAuxData: '0x',
    })
    console.log(`  UUID: ${uuid}`)
    await pinMeta(uuid, post.title)
    console.log(`  Pinned.\n`)
  } catch (err) {
    console.error(`  FAILED: ${err.message?.slice(0, 200)}\n`)
  }
}

console.log('Done.')
