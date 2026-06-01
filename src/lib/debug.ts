/**
 * Litmus debug utilities — 브라우저 콘솔에서 직접 실행 가능
 *
 * 사용법:
 *   import { debugCDR } from '@/lib/debug'
 *   await debugCDR.checkVault(publicClient, 42)
 */

import { createPublicClient, http } from 'viem'
import { storyAeneid } from '@/config/wagmi'

const CDR_ADDR = '0xcccccc0000000000000000000000000000000005' as const

const VAULT_ABI = [
  {
    name: 'vaults',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'uuid', type: 'uint32' }],
    outputs: [
      {
        name: 'vault',
        type: 'tuple',
        components: [
          { name: 'updatable', type: 'bool' },
          { name: 'writeConditionAddr', type: 'address' },
          { name: 'readConditionAddr', type: 'address' },
          { name: 'writeConditionData', type: 'bytes' },
          { name: 'readConditionData', type: 'bytes' },
          { name: 'encryptedData', type: 'bytes' },
        ],
      },
    ],
  },
  {
    name: 'allocateFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'readFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'writeFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const CONDITION_ABI = [
  {
    name: 'checkReadCondition',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'reader', type: 'address' },
      { name: 'conditionData', type: 'bytes' },
      { name: 'accessAuxData', type: 'bytes' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

function makeClient() {
  return createPublicClient({ chain: storyAeneid, transport: http() })
}

export const debugCDR = {
  /** CDR 컨트랙트의 fee 정보 확인 */
  async checkFees() {
    const client = makeClient()
    const [allocate, write, read] = await Promise.all([
      client.readContract({ address: CDR_ADDR, abi: VAULT_ABI, functionName: 'allocateFee' }),
      client.readContract({ address: CDR_ADDR, abi: VAULT_ABI, functionName: 'writeFee' }),
      client.readContract({ address: CDR_ADDR, abi: VAULT_ABI, functionName: 'readFee' }),
    ])
    const fmt = (v: bigint) => `${Number(v) / 1e18} IP`
    console.table({ allocateFee: fmt(allocate), writeFee: fmt(write), readFee: fmt(read) })
    return { allocate, write, read }
  },

  /** 특정 UUID의 볼트 정보 확인 */
  async checkVault(uuid: number) {
    const client = makeClient()
    const vault = await client.readContract({
      address: CDR_ADDR,
      abi: VAULT_ABI,
      functionName: 'vaults',
      args: [uuid as never],
    })
    console.log(`Vault #${uuid}:`, vault)
    const encLen = (vault as { encryptedData: `0x${string}` }).encryptedData.length / 2 - 1
    console.log(`  encryptedData size: ${encLen} bytes`)
    return vault
  },

  /** 특정 주소가 특정 볼트의 read condition을 통과하는지 확인 */
  async checkCondition(uuid: number, reader: `0x${string}`) {
    const client = makeClient()
    const vault = await client.readContract({
      address: CDR_ADDR,
      abi: VAULT_ABI,
      functionName: 'vaults',
      args: [uuid as never],
    }) as {
      readConditionAddr: `0x${string}`
      readConditionData: `0x${string}`
    }

    const canRead = await client.readContract({
      address: vault.readConditionAddr,
      abi: CONDITION_ABI,
      functionName: 'checkReadCondition',
      args: [reader, vault.readConditionData, '0x'],
    })

    console.log(`Vault #${uuid} — reader ${reader}: canRead = ${canRead}`)
    console.log(`  readConditionAddr: ${vault.readConditionAddr}`)
    console.log(`  readConditionData: ${vault.readConditionData}`)
    return canRead
  },

  /** Pinata IPFS 업로드/다운로드 왕복 테스트 */
  async testPinata(jwt: string) {
    const testData = new TextEncoder().encode('litmus-pinata-test-' + Date.now())
    console.log('Uploading test data to Pinata...')

    const form = new FormData()
    form.append('file', new Blob([testData.buffer as ArrayBuffer], { type: 'application/octet-stream' }), 'test.bin')
    const uploadRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    })

    if (!uploadRes.ok) {
      const text = await uploadRes.text()
      console.error('Upload failed:', uploadRes.status, text)
      return null
    }

    const { IpfsHash } = await uploadRes.json()
    console.log('Uploaded! CID:', IpfsHash)

    // Download and verify
    await new Promise((r) => setTimeout(r, 1000)) // brief propagation delay
    const dlRes = await fetch(`https://gateway.pinata.cloud/ipfs/${IpfsHash}`)
    if (!dlRes.ok) {
      console.error('Download failed:', dlRes.status)
      return null
    }

    const downloaded = new Uint8Array(await dlRes.arrayBuffer())
    const match = downloaded.every((b, i) => b === testData[i])
    console.log('Download OK:', match, '— bytes match:', match)
    return { cid: IpfsHash, verified: match }
  },
}

// ── 테스트 시나리오 메타데이터 (수동 실행 가이드) ────────────────────────────

export const TEST_SCENARIOS = [
  {
    id: 'T-01',
    name: 'NativeBalance — Aeneid IP 보유 조건',
    description: 'IP 토큰을 보유한 지갑만 읽을 수 있는 컨텐츠 게이팅',
    condition: { type: 'NativeBalance', params: { minWei: '1000000000000000000' } }, // 1 IP
    publishSteps: [
      '1. /publish 접속, 지갑 연결',
      '2. 컨텐츠 작성: "## 테스트\n비밀 내용입니다."',
      '3. Condition: NativeBalance, Min IP Balance = 1000000000000000000 (1 IP)',
      '4. [ Encrypt & Publish ] 클릭 → UUID 기록',
      '5. 공유 링크 복사',
    ],
    readSteps: [
      '1. /read?uuid=<UUID> 접속',
      '2. 1 IP 이상 보유 지갑 연결 → [ Verify & Decrypt ] → 파란색 Litmus + 컨텐츠 표시',
      '3. IP 미보유 지갑 연결 → [ Verify & Decrypt ] → 빨간색 Litmus + "CONDITIONS NOT MET"',
    ],
    expectedBehavior: 'Aeneid 테스트넷 IP faucet에서 IP를 받아 테스트',
    faucet: 'https://aeneid.storyscan.xyz (우상단 Faucet 버튼)',
  },
  {
    id: 'T-02',
    name: 'TokenBalance — ERC-20 토큰 게이팅',
    description: '특정 ERC-20 토큰을 보유한 지갑만 읽기 가능',
    condition: {
      type: 'TokenBalance',
      params: {
        token: '<ERC20_CONTRACT_ADDRESS>',
        minAmount: '1000000000000000000',
      },
    },
    publishSteps: [
      '1. Story Aeneid testnet에서 테스트용 ERC-20 컨트랙트 주소 준비',
      '2. Condition: TokenBalance, Token Contract = <주소>, Min Amount = 1000000000000000000',
      '3. 나머지는 T-01과 동일',
    ],
    readSteps: [
      '1. 해당 토큰 보유 지갑 → 파란색 Litmus',
      '2. 미보유 지갑 → 빨간색 Litmus',
    ],
    expectedBehavior: 'Token balance 조회는 외부 ERC-20 컨트랙트에 의존',
    debugNote: '토큰 컨트랙트가 Story 체인에 없으면 revert → 빨간색 처리됨 (정상)',
  },
  {
    id: 'T-03',
    name: 'TimeLocked — 시간 기반 공개',
    description: '특정 날짜 이후에만 읽기 가능 (embargo)',
    condition: { type: 'TimeLocked', params: { unlockTime: '2025-06-01' } },
    publishSteps: [
      '1. Condition: TimeLocked, Unlock Date = 2025-06-01 (과거 날짜 → 즉시 공개)',
      '2. 또는 미래 날짜 (예: 2030-01-01) → 항상 잠김 상태로 테스트',
    ],
    readSteps: [
      '1. 과거 날짜 설정 시 → 어떤 지갑이든 파란색 Litmus',
      '2. 미래 날짜 설정 시 → 어떤 지갑이든 빨간색 Litmus',
    ],
    expectedBehavior: '날짜 비교는 block.timestamp 기반 (체인 시간 기준)',
  },
  {
    id: 'T-04',
    name: 'MultiCondition — AND 조합',
    description: 'IP 보유 AND 특정 날짜 이후 — 두 조건 동시 충족',
    publishSteps: [
      '1. Condition 1: NativeBalance, 1 IP',
      '2. [ + Add condition ] → AND 선택',
      '3. Condition 2: TimeLocked, 과거 날짜 (이미 해제)',
      '4. 두 조건 모두 충족해야 읽기 가능',
    ],
    readSteps: [
      '1. IP 보유 지갑 + 날짜 조건 통과 → 파란색',
      '2. IP 미보유 → 빨간색',
    ],
    expectedBehavior: 'MultiCondition 컨트랙트가 isAnd=true로 두 조건 체크',
  },
  {
    id: 'T-05',
    name: 'MultiCondition — OR 조합',
    description: 'IP 보유 OR NFT 보유 — 둘 중 하나만 충족해도 읽기 가능',
    publishSteps: [
      '1. Condition 1: NativeBalance, 1 IP',
      '2. [ + Add condition ] → OR 선택',
      '3. Condition 2: NFTHolder, <NFT주소>, Min Balance = 1',
    ],
    readSteps: [
      '1. IP만 보유 → 파란색',
      '2. NFT만 보유 → 파란색',
      '3. 둘 다 없음 → 빨간색',
    ],
    expectedBehavior: 'MultiCondition 컨트랙트가 isAnd=false로 OR 체크',
  },
  {
    id: 'T-06',
    name: 'Error Handling — 잘못된 UUID',
    description: '존재하지 않는 UUID로 읽기 시도',
    readSteps: [
      '1. /read?uuid=999999 접속',
      '2. 지갑 연결 후 [ Verify & Decrypt ]',
      '3. zero address를 read condition으로 가진 빈 볼트이거나 revert',
    ],
    expectedBehavior: 'ERROR 상태 + 빨간 Litmus + 에러 메시지 표시',
  },
  {
    id: 'T-07',
    name: 'Wallet — WalletConnect QR 연결',
    description: '모바일 지갑으로 QR 코드 스캔 연결 테스트',
    steps: [
      '1. "WalletConnect (QR / Mobile)" 버튼 클릭',
      '2. QR 코드 모달 표시 확인',
      '3. MetaMask Mobile 앱으로 스캔',
      '4. Story Aeneid 네트워크 수동 추가: chainId 1315, RPC https://aeneid.storyrpc.io',
      '5. 연결 승인 → 지갑 주소 표시 확인',
    ],
    prerequisite: 'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID 설정 필요',
  },
] as const
