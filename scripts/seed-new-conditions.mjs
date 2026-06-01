/**
 * Seed vaults using NFT, ERC20, TxCount, and Story IP License conditions.
 * Run AFTER register-activity.mjs.
 * Run: node --env-file=.env.local scripts/seed-new-conditions.mjs
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
  LitmusPass: LITMUS_PASS,
  LitmusCoin: LITMUS_COIN,
  StoryLicenseToken: STORY_LICENSE_TOKEN,
} = addresses.contracts

const ALWAYS_TRUE = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

const enc = (types, values) => encodeAbiParameters(parseAbiParameters(types), values)

function encodeHybridData(conditionAddr, conditionData) {
  return encodeAbiParameters(
    parseAbiParameters('address conditionAddr, bytes conditionData'),
    [conditionAddr, conditionData]
  )
}

// ── Condition builders ───────────────────────────────────────────────────────

const nftHolder = (nftContract, minBalance = 1n) => ({
  address: NFT_HOLDER,
  conditionData: enc('address nftContract, uint256 minBalance', [nftContract, minBalance]),
})

const tokenBalance = (token, minAmount) => ({
  address: TOKEN_BAL,
  conditionData: enc('address token, uint256 minAmount', [token, minAmount]),
})

const txCount = (registry, minCount) => ({
  address: TX_COUNT,
  conditionData: enc('address registry, uint256 minCount', [registry, minCount]),
})

const storyLicense = (licenseToken, licenseTermsId = 0n) => ({
  address: STORY_LIC_COND,
  conditionData: enc('address licenseToken, uint256 licenseTermsId', [licenseToken, licenseTermsId]),
})

// ── Pinata ───────────────────────────────────────────────────────────────────
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

// ── Posts ────────────────────────────────────────────────────────────────────
const POSTS = [
  // ── 1. LitmusPass NFT holder ─────────────────────────────────────────────
  {
    title: '[Litmus Pass] NFT 홀더 전용',
    conditionPreview: `Hold a Litmus Pass NFT (${LITMUS_PASS})`,
    readCond: nftHolder(LITMUS_PASS, 1n),
    content: `# Litmus Pass 홀더 전용

이 글은 **Litmus Pass NFT**를 보유한 사람만 읽을 수 있다.

Litmus Pass는 Aeneid 테스트넷에 배포된 ERC-721 컬렉션이다.
컨트랙트 주소: \`${LITMUS_PASS}\`

---

## NFT 게이팅이란?

Litmus는 ERC-721 NFT 보유 여부를 접근 조건으로 설정할 수 있다.

BAYC, Pudgy Penguins 같은 블루칩 컬렉션,
또는 프로젝트가 직접 발행한 패스 NFT — 어떤 ERC-721이든 조건으로 쓸 수 있다.

NFT를 가진 사람에게만 전달하고 싶은 내용이 있다면:
알파 정보, 커뮤니티 리포트, 홀더 전용 로드맵…

Litmus는 그 채널이 될 수 있다.

---

Litmus Pass를 가지고 있어서 이 글을 읽고 있는 당신: 환영합니다.
`,
  },

  // ── 2. LitmusCoin ERC-20 holder ─────────────────────────────────────────
  {
    title: '[Litmus Coin] 100 LCOIN 이상 보유자',
    conditionPreview: `Hold >= 100 LCOIN (${LITMUS_COIN})`,
    readCond: tokenBalance(LITMUS_COIN, 100n * 10n ** 18n),
    content: `# Litmus Coin 보유자 전용

이 글은 **100 LCOIN 이상**을 보유한 지갑에게 열린다.

Litmus Coin은 Aeneid 테스트넷의 ERC-20 토큰이다.
컨트랙트 주소: \`${LITMUS_COIN}\`

---

## 토큰 게이팅이란?

프로젝트 토큰, 유틸리티 토큰, 거버넌스 토큰 — ERC-20이라면 무엇이든 접근 조건으로 쓸 수 있다.

보유량 기준도 자유롭게 설정 가능하다.
"100개 이상", "1000개 이상" 같은 허들을 만들어 콘텐츠의 희소성을 조절한다.

---

## 활용 예시

- DeFi 프로토콜: 거버넌스 토큰 100개 이상 보유자에게 분석 리포트 제공
- GameFi: 인게임 토큰 일정량 보유 시 공략 콘텐츠 오픈
- DAO: 멤버십 토큰 보유자만 내부 문서 접근 가능

토큰이 단순한 금융 자산을 넘어 **접근권**이 되는 구조다.
`,
  },

  // ── 3. TxCount — 10 txs on Aeneid ───────────────────────────────────────
  {
    title: '[온체인 경력] Aeneid 트랜잭션 10회 이상',
    conditionPreview: `Sent >= 10 transactions on Aeneid (ActivityRegistry: ${ACTIVITY_REG})`,
    readCond: txCount(ACTIVITY_REG, 10n),
    content: `# 온체인 경력자 전용

이 글은 Aeneid 테스트넷에서 **10회 이상 트랜잭션을 전송**한 지갑에게 열린다.

단순히 토큰을 가지고 있는 게 아니라, **실제로 체인 위에서 무언가를 해본 사람**.

---

## ActivityRegistry

Litmus의 TxCountCondition은 우리가 배포한 ActivityRegistry에서 데이터를 읽는다.

\`\`\`
ActivityRegistry.txCount(your_address) >= 10
\`\`\`

레지스트리는 온체인 tx count(= nonce)를 읽어서 저장한다.
오라클 방식 — 아직 완전히 탈중앙화되지 않은 부분이다.

---

## 왜 온체인 활동을 조건으로 쓰는가?

잔고는 만들 수 있다. 토큰은 살 수 있다.
하지만 **트랜잭션 히스토리는 축적된다.**

"이 체인에서 실제로 무언가를 해온 사람" —
그 증명은 잔고보다 더 강한 신호다.

Sybil resistance의 시작은 활동 기록이다.
`,
  },

  // ── 4. Story IP License — any license holder ────────────────────────────
  {
    title: '[Story IP] 라이선스 보유자 전용',
    conditionPreview: `Hold any Story Protocol IP License (LicenseToken: ${STORY_LICENSE_TOKEN})`,
    readCond: storyLicense(STORY_LICENSE_TOKEN, 0n),  // 0 = any license
    content: `# Story Protocol 라이선스 보유자 전용

이 글은 **Story Protocol의 IP 라이선스 토큰**을 보유한 지갑에게 열린다.

Story Protocol은 IP(지식재산권)를 온체인에 등록하고 라이선스를 발행할 수 있는 프로토콜이다.
LicenseToken 주소: \`${STORY_LICENSE_TOKEN}\`

---

## Story Protocol + Litmus

CDR(Confidential Data Rails)은 Story Protocol의 핵심 인프라다.
Litmus는 CDR 위에 구축된 첫 번째 콘텐츠 게이팅 앱 중 하나다.

Story Protocol에서 IP를 등록하고 라이선스를 발행하면:
- 해당 라이선스 토큰 보유자에게만 콘텐츠를 공개할 수 있다
- 예: "내 소설의 2차 창작 라이선스를 가진 사람에게만 원고 초안 공개"
- 예: "내 음악의 리믹스 라이선스 홀더에게 스템 파일 제공"

---

IP 라이선스가 **콘텐츠 접근권**이 되는 세계.
Litmus + CDR + Story Protocol이 만드는 새로운 레이어다.
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
      readConditionAddr: ALWAYS_TRUE,
      readConditionData: encodeHybridData(post.readCond.address, post.readCond.conditionData),
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
