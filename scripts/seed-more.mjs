/**
 * Additional diverse vault seeds — time locks, AND, OR conditions.
 * Run: node --env-file=.env.local scripts/seed-more.mjs
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

if (!JWT) { console.error('Missing NEXT_PUBLIC_PINATA_JWT'); process.exit(1) }
if (!PK)  { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const ALWAYS_TRUE  = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'
const NATIVE_BAL   = addresses.contracts.NativeBalanceCondition
const TIME_LOCKED  = addresses.contracts.TimeLockedCondition
const MULTI_COND   = addresses.contracts.MultiCondition
const OPEN_WRITE   = addresses.contracts.OpenWriteCondition

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

// ── Condition helpers ────────────────────────────────────────────────────────
const enc = (types, values) => encodeAbiParameters(parseAbiParameters(types), values)

const nativeBalance = (minWei) => ({
  address: NATIVE_BAL,
  conditionData: enc('uint256 minWei', [BigInt(minWei)]),
})

const timeLocked = (isoDate) => ({
  address: TIME_LOCKED,
  conditionData: enc('uint256 unlockTime', [BigInt(Math.floor(new Date(isoDate).getTime() / 1000))]),
})

// isAnd: array of booleans between conditions, length = conditions.length - 1
// e.g. [A, B] AND → isAnd=[true], OR → isAnd=[false]
const multi = (conditions, isAnd) => ({
  address: MULTI_COND,
  conditionData: enc(
    'address[] conditions, bytes[] conditionDatas, bool[] isAnd',
    [conditions.map(c => c.address), conditions.map(c => c.conditionData), isAnd],
  ),
})

function encodeHybridData(conditionAddr, conditionData) {
  return encodeAbiParameters(
    parseAbiParameters('address conditionAddr, bytes conditionData'),
    [conditionAddr, conditionData]
  )
}

// ── Pinata ───────────────────────────────────────────────────────────────────
class PinataStorage {
  async upload(data) {
    const form = new FormData()
    form.append('file', new Blob([data.buffer], { type: 'application/octet-stream' }), 'content.bin')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST', headers: { Authorization: `Bearer ${JWT}` }, body: form,
    })
    if (!res.ok) throw new Error(`Pinata upload (${res.status}): ${await res.text()}`)
    return (await res.json()).IpfsHash
  }
  async download(cid) {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    throw new Error(`IPFS download: ${cid}`)
  }
}

async function pinMeta({ uuid, title, conditionPreview }) {
  const createdAt = Date.now()
  const body = {
    pinataContent: { uuid, title, conditionPreview, createdAt },
    pinataMetadata: {
      name: `litmus-meta-${uuid}`,
      keyvalues: {
        litmus: '1', uuid: String(uuid),
        title: title.slice(0, 200),
        conditionPreview: conditionPreview.slice(0, 500),
        createdAt: String(createdAt),
      },
    },
  }
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Pinata meta (${res.status}): ${await res.text()}`)
}

// ── Posts ────────────────────────────────────────────────────────────────────
const POSTS = [
  // ── 1. OR gate: ≥ 5 IP OR unlocked since 2025-01-01 (date has passed → widely accessible) ──
  {
    title: 'The OR Gate — 두 가지 중 하나면 된다',
    conditionPreview: 'Hold ≥ 5000000000000000000 wei IP (≥ 5 IP)\nOR Unlocked after 2025-01-01 (UTC)',
    readCond: multi(
      [nativeBalance('5000000000000000000'), timeLocked('2025-01-01')],
      [false],  // OR
    ),
    content: `# The OR Gate

조건을 만족하는 방법이 꼭 하나일 필요는 없다.

이 글은 **두 가지 방법 중 하나**로 읽을 수 있도록 설계됐다:

- ≥ 5 IP를 보유하거나
- 2025년 1월 1일 이후에 접속하거나

지금 이 글을 읽고 있다면, 그 중 하나를 충족한 것이다.
(아마 날짜 조건일 가능성이 높다.)

---

## OR 조건의 의미

OR은 포용이다.
AND가 "모든 조건을 갖춰라"라고 말한다면,
OR은 "이 중 하나면 된다"고 말한다.

같은 콘텐츠에 서로 다른 경로로 접근할 수 있게 해준다:
- 초기 홀더는 토큰 보유량으로 접근
- 늦게 합류한 사람은 시간이 지나면 접근

---

## 왜 이게 흥미로운가

전통적인 페이월은 하나의 조건만 가진다 — 돈을 내라.

Litmus의 OR 조건은 퍼블리셔에게 묻는다:
*"누구에게 이 글을 공개하고 싶습니까?"*

그 답이 단순할 필요는 없다.
`,
  },

  // ── 2. AND gate: ≥ 1 IP AND unlocked since 2026-01-01 (both easily met) ──
  {
    title: 'The AND Gate — 두 조건이 동시에 충족될 때',
    conditionPreview: 'Hold ≥ 1000000000000000000 wei IP (≥ 1 IP)\nAND Unlocked after 2026-01-01 (UTC)',
    readCond: multi(
      [nativeBalance('1000000000000000000'), timeLocked('2026-01-01')],
      [true],  // AND
    ),
    content: `# The AND Gate

두 자물쇠가 모두 열려야 문이 열린다.

이 글을 읽기 위해선 **두 가지 조건이 모두 충족**되어야 했다:

- 지갑에 ≥ 1 IP를 보유 중이고
- 2026년 1월 1일이 지났어야 한다

둘 다 충족했으니 여기 있는 것이다.

---

## AND 조건의 철학

AND 조건은 **레이어드 접근 제어**다.

시간이 지났다고 무조건 열리는 게 아니다.
토큰을 가졌다고 무조건 열리는 게 아니다.
**둘 다** 있어야 한다.

예시:
- "1년 이상 된 지갑이면서 10 IP 이상 보유"
- "NFT를 가지고 있으면서 특정 날짜 이후"

조건이 겹칠수록 타겟이 좁아진다.
좁은 타겟에게만 전달하고 싶은 내용이 있을 때 유용하다.

---

좁은 문을 통과한 당신에게:
잘 하고 있다. 계속 쌓아가면 된다.
`,
  },

  // ── 3. Near-future lock: unlocks 2026-07-04 (~33 days from now) ──
  {
    title: '[봉인] 7월 4일에 열립니다',
    conditionPreview: 'Unlocks after 2026-07-04 (UTC)',
    readCond: timeLocked('2026-07-04'),
    content: `# 7월 4일의 편지

이 글이 열렸다면, 오늘은 2026년 7월 4일 이후다.

봉인할 때 쓴다:

---

6월의 나는 지금 해커톤 마감을 앞두고 있다.
무언가를 만들고 있고, 그게 잘 됐으면 좋겠다.

한 달 뒤의 나 혹은 당신에게 묻는다:

그래서 어떻게 됐어?
뭔가 변했어?
아직도 블록체인 쪽 일을 하고 있어?

---

미래는 항상 조금 낯설다.
하지만 시간이 지나야만 열리는 것들이 있다.
이 글도 그런 것 중 하나였다.

지금 이 순간을 잘 살길.

— 2026년 6월의 발신자
`,
  },

  // ── 4. Far-future lock: unlocks 2027-01-01 ──
  {
    title: '[봉인] 2027년 새해에 열립니다',
    conditionPreview: 'Unlocks after 2027-01-01 (UTC)',
    readCond: timeLocked('2027-01-01'),
    content: `# 2027년의 당신에게

이 글은 2026년 6월에 쓰였고,
블록체인 위에 잠겨 있다가 2027년 1월 1일에 열렸다.

그 어떤 서버도, 그 어떤 관리자도 일찍 열 수 없었다.
코드가 정한 시간에, 코드가 열었다.

---

2026년에 내가 믿었던 것들:

1. 콘텐츠의 가치는 누가 읽느냐에 달려 있다.
2. 접근 조건이 신뢰를 만든다.
3. 온체인은 중립적이다 — 편애하지 않는다.
4. 암호화는 비밀을 지키는 게 아니라 약속을 지키는 것이다.

---

2027년 당신은 이것들에 동의하는가?

아니라면, 무엇이 달라졌는가?

그 질문을 남기기 위해 이 글을 썼다.

새해 복 많이 받으세요.
`,
  },

  // ── 5. Exclusive AND: ≥ 50 IP AND 2026-06-01 passed (date is met, need 50 IP) ──
  {
    title: '[VIP] 50 IP 이상 보유자 전용',
    conditionPreview: 'Hold ≥ 50000000000000000000 wei IP (≥ 50 IP)\nAND Unlocked after 2026-06-01 (UTC)',
    readCond: multi(
      [nativeBalance('50000000000000000000'), timeLocked('2026-06-01')],
      [true],  // AND
    ),
    content: `# 50 IP 이상 보유자 전용

당신은 테스트넷에서 50 IP 이상을 모았다.
그 노력이 이 문을 열었다.

---

## 여기서만 하는 이야기

Litmus를 만들면서 가장 어려웠던 부분은 UI가 아니었다.
스마트컨트랙트도 아니었다.

**CDR 프리컴파일이 Solidity 조건 컨트랙트를 호출할 수 없다**는 사실을 발견하는 데
며칠이 걸렸다.

공식 문서에는 없었다.
에러 메시지도 없었다.
그냥 조용히 실패했다.

---

해결법은 간단했지만 찾기까지가 길었다:

readConditionAddr에 "always true" 바이트코드 컨트랙트를 넣고,
readConditionData에 실제 조건을 ABI 인코딩해서 넣는다.
프론트엔드가 그걸 디코딩해서 직접 체크한다.

---

이 글을 읽고 있는 당신은 충분히 깊이 들어온 사람이다.
그러니까 솔직하게 말해도 된다고 생각했다.

CDR은 완성된 게 아니다.
하지만 방향은 맞다.

그 방향 위에서 무언가를 만들어본 것, 가치 있었다.
`,
  },
]

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('Initializing CDR WASM...')
await initWasm()

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
console.log(`Wallet: ${account.address}\n`)

const publicClient  = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient  = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient     = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })
const storage       = new PinataStorage()

for (const post of POSTS) {
  console.log(`Publishing "${post.title}"...`)
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
    console.log(`  ✓ UUID: ${uuid}`)
    await pinMeta({ uuid, title: post.title, conditionPreview: post.conditionPreview })
    console.log(`  ✓ Pinned\n`)
  } catch (err) {
    console.error(`  ✗ ${err.message?.slice(0, 200)}`)
    if (err.cause) console.error(`    ${err.cause?.message?.slice(0, 150)}\n`)
  }
}

console.log('Done.')
