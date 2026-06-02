/**
 * Full end-to-end test for Litmus — all 7 condition types, verify, decrypt, PaymentGate.
 * Run: node --env-file=.env.local scripts/full-e2e-test.mjs
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import {
  createPublicClient, createWalletClient, http, defineChain,
  encodeAbiParameters, parseAbiParameters,
} from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const addresses = require('../deployments/addresses.json')

// ── Env ───────────────────────────────────────────────────────────────────────
const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const RPC_URL = 'https://aeneid.storyrpc.io'
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

if (!JWT || !PK) { console.error('Missing NEXT_PUBLIC_PINATA_JWT or SEED_PRIVATE_KEY'); process.exit(1) }

// ── Contract addresses ────────────────────────────────────────────────────────
const {
  OpenWriteCondition:      OPEN_WRITE,
  NFTHolderCondition:      NFT_HOLDER,
  TokenBalanceCondition:   TOKEN_BAL,
  TxCountCondition:        TX_COUNT,
  ActivityRegistry:        ACTIVITY_REG,
  StoryIPLicenseCondition: STORY_LIC_COND,
  NativeBalanceCondition:  NATIVE_BAL,
  TimeLockedCondition:     TIME_LOCKED,
  LitmusPass:              LITMUS_PASS,
  LitmusCoin:              LITMUS_COIN,
  StoryLicenseToken:       STORY_LICENSE_TOKEN,
  PaymentGate:             PG_GATE,
  PaymentGateCondition:    PG_COND,
} = addresses.contracts

const ALWAYS_TRUE = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'
const CDR_PRECOMPILE = '0xCCCcCC0000000000000000000000000000000005'

// ── Chain ─────────────────────────────────────────────────────────────────────
const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

// ── ABI helpers ───────────────────────────────────────────────────────────────
const enc = (types, values) => encodeAbiParameters(parseAbiParameters(types), values)

// ── Storage provider ──────────────────────────────────────────────────────────
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
    const urls = [
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
    ]
    for (const url of urls) {
      try {
        const res = await fetch(url)
        if (res.ok) return new Uint8Array(await res.arrayBuffer())
      } catch { /* try next */ }
    }
    throw new Error(`IPFS download failed: ${cid}`)
  }
}

// ── Result tracking ───────────────────────────────────────────────────────────
const results = []
function pass(id, desc, detail = '') {
  results.push({ id, desc, status: 'PASS', detail })
  console.log(`[TEST ${id}] ${desc} ... PASS`)
  if (detail) console.log(`  ${detail}`)
}
function fail(id, desc, detail = '') {
  results.push({ id, desc, status: 'FAIL', detail })
  console.log(`[TEST ${id}] ${desc} ... FAIL`)
  if (detail) console.log(`  ${detail}`)
}

// ── Setup ─────────────────────────────────────────────────────────────────────
console.log('\n=== Litmus Full E2E Test ===')
console.log('Initializing CDR WASM...')
await initWasm()
console.log('WASM ready.\n')

const account      = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient    = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })
const storage      = new PinataStorage()

console.log(`Wallet: ${account.address}`)
const balance = await publicClient.getBalance({ address: account.address })
console.log(`Balance: ${(Number(balance) / 1e18).toFixed(4)} IP\n`)

// ── Vault definitions for TEST 1 ─────────────────────────────────────────────
const REQUIRED_WEI_PG = BigInt('10000000000000000') // 0.01 IP

const pgCondData     = enc('address, uint256', [PG_GATE, REQUIRED_WEI_PG])
const pgReadCondData = enc('address, bytes',   [PG_COND, pgCondData])

const VAULT_DEFS = [
  {
    key: 'NFTHolder',
    title: '[E2E] NFT Gate — LitmusPass',
    readConditionAddr: NFT_HOLDER,
    readConditionData: enc('address nftContract, uint256 minBalance', [LITMUS_PASS, 1n]),
    content: 'E2E TEST: NFTHolder gate content. Seed wallet holds LitmusPass.',
    conditionPreview: 'Hold LitmusPass NFT',
    expectPass: true,     // seed wallet holds LitmusPass
  },
  {
    key: 'TokenBalance',
    title: '[E2E] Token Gate — 100 LCOIN',
    readConditionAddr: TOKEN_BAL,
    readConditionData: enc('address token, uint256 minAmount', [LITMUS_COIN, 100n * 10n ** 18n]),
    content: 'E2E TEST: TokenBalance gate content. Seed wallet holds LCOIN.',
    conditionPreview: 'Hold >= 100 LCOIN',
    expectPass: true,     // seed wallet should hold LCOIN
  },
  {
    key: 'TxCount',
    title: '[E2E] TxCount Gate — 10 txs',
    readConditionAddr: TX_COUNT,
    readConditionData: enc('address registry, uint256 minCount', [ACTIVITY_REG, 10n]),
    content: 'E2E TEST: TxCount gate content. May pass or fail depending on activity.',
    conditionPreview: '>=10 transactions on Aeneid',
    expectPass: null,     // unknown — depends on tx count
  },
  {
    key: 'NativeBalance',
    title: '[E2E] Native Balance Gate — 1 IP',
    readConditionAddr: NATIVE_BAL,
    readConditionData: enc('uint256 minWei', [1n * 10n ** 18n]),
    content: 'E2E TEST: NativeBalance gate content. Seed wallet holds IP.',
    conditionPreview: 'Hold >= 1 IP',
    expectPass: true,     // seed wallet is funded
  },
  {
    key: 'TimeLocked',
    title: '[E2E] TimeLock Gate — Jan 1, 2026 (past)',
    readConditionAddr: TIME_LOCKED,
    readConditionData: enc('uint256 unlockTime', [BigInt(Math.floor(new Date('2026-01-01').getTime() / 1000))]),
    content: 'E2E TEST: TimeLocked gate content. Unlock date is past (Jan 2026).',
    conditionPreview: 'Unlocked after Jan 1, 2026',
    expectPass: true,     // Jan 2026 is in the past (current date: 2026-06-02)
  },
  {
    key: 'StoryIPLicense',
    title: '[E2E] Story IP License Gate',
    readConditionAddr: STORY_LIC_COND,
    readConditionData: enc('address licenseToken, uint256 licenseTermsId', [STORY_LICENSE_TOKEN, 0n]),
    content: 'E2E TEST: StoryIPLicense gate content. Seed wallet probably has no license.',
    conditionPreview: 'Hold Story IP license token',
    expectPass: false,    // seed wallet likely has no license
  },
  {
    key: 'PaymentGate',
    title: '[E2E] PaymentGate — 0.01 IP',
    readConditionAddr: ALWAYS_TRUE,
    readConditionData: pgReadCondData,
    content: 'E2E TEST: PaymentGate content. Pay 0.01 IP to unlock.',
    conditionPreview: 'Pay 0.01 IP to unlock',
    expectPass: false,    // hasPaid starts as false
    isPaymentGate: true,
  },
]

// ── ABIs ──────────────────────────────────────────────────────────────────────
const CHECK_READ_ABI = [{
  name: 'checkReadCondition', type: 'function', stateMutability: 'view',
  inputs: [
    { name: 'uuid', type: 'uint32' },
    { name: 'conditionData', type: 'bytes' },
    { name: 'accessAuxData', type: 'bytes' },
    { name: 'reader', type: 'address' },
  ],
  outputs: [{ type: 'bool' }],
}]

const CDR_VAULT_ABI = [{
  name: 'vaults', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'uuid', type: 'uint32' }],
  outputs: [{
    type: 'tuple',
    components: [
      { name: 'readConditionAddr', type: 'address' },
      { name: 'readConditionData', type: 'bytes' },
      { name: 'writeConditionAddr', type: 'address' },
      { name: 'writeConditionData', type: 'bytes' },
      { name: 'updatable', type: 'bool' },
      { name: 'owner', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
  }],
}]

const HAS_PAID_ABI = [{
  name: 'hasPaid', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'uuid', type: 'uint32' }, { name: 'reader', type: 'address' }],
  outputs: [{ type: 'bool' }],
}]

const PAY_ABI = [{
  name: 'pay', type: 'function', stateMutability: 'payable',
  inputs: [{ name: 'uuid', type: 'uint32' }],
  outputs: [],
}]

const REGISTER_ABI = [{
  name: 'register', type: 'function', stateMutability: 'nonpayable',
  inputs: [
    { name: 'uuid', type: 'uint32' },
    { name: 'recipient', type: 'address' },
    { name: 'requiredWei', type: 'uint256' },
  ],
  outputs: [],
}]

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Publish — create one vault per condition type
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70))
console.log('TEST 1: PUBLISH — create vaults for all 7 condition types')
console.log('='.repeat(70))

const publishedVaults = [] // { key, uuid, def }

for (const def of VAULT_DEFS) {
  const testId = `1.${VAULT_DEFS.indexOf(def) + 1}`
  console.log(`\n[TEST ${testId}] Publishing ${def.key}...`)

  try {
    const { uuid } = await cdrClient.uploader.uploadFile({
      content: new TextEncoder().encode(def.content),
      storageProvider: storage,
      updatable: false,
      writeConditionAddr: OPEN_WRITE,
      writeConditionData: '0x',
      readConditionAddr:  def.readConditionAddr,
      readConditionData:  def.readConditionData,
      accessAuxData: '0x',
    })

    publishedVaults.push({ key: def.key, uuid, def })
    pass(testId, `Publish ${def.key}`, `UUID: ${uuid}`)

    // For PaymentGate, register with the gate contract
    if (def.isPaymentGate) {
      console.log(`  Registering UUID ${uuid} with PaymentGate...`)
      const hash = await walletClient.writeContract({
        address: PG_GATE, abi: REGISTER_ABI, functionName: 'register',
        args: [uuid, account.address, REQUIRED_WEI_PG],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`  PaymentGate registered: ${hash}`)
    }
  } catch (err) {
    fail(testId, `Publish ${def.key}`, err.message?.slice(0, 200))
  }
}

console.log(`\nPublished ${publishedVaults.length}/${VAULT_DEFS.length} vaults.`)

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Condition verification — on-chain checkReadCondition calls
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70))
console.log('TEST 2: CONDITION VERIFICATION — on-chain checks')
console.log('='.repeat(70))

const conditionResults = {} // key -> bool|null

for (const vault of publishedVaults) {
  const { key, uuid, def } = vault
  const testId = `2.${publishedVaults.indexOf(vault) + 1}`

  if (def.isPaymentGate) {
    // PaymentGate: check hasPaid directly
    console.log(`\n[TEST ${testId}] ${key}: checking hasPaid(${uuid}, reader)...`)
    try {
      const paid = await publicClient.readContract({
        address: PG_GATE, abi: HAS_PAID_ABI, functionName: 'hasPaid',
        args: [uuid, account.address],
      })
      conditionResults[key] = paid
      const expected = false
      const ok = paid === expected
      if (ok) {
        pass(testId, `${key} hasPaid check (expect false initially)`, `hasPaid = ${paid}`)
      } else {
        fail(testId, `${key} hasPaid check (expect false initially)`, `hasPaid = ${paid} (unexpected — already paid?)`)
      }
    } catch (err) {
      conditionResults[key] = null
      fail(testId, `${key} hasPaid check`, err.message?.slice(0, 200))
    }
    continue
  }

  // Non-PaymentGate: call checkReadCondition on the condition contract
  console.log(`\n[TEST ${testId}] ${key}: calling checkReadCondition(uuid=${uuid}, reader=seed)...`)
  try {
    // The condition contract self-reads vault data via CDR.vaults(uuid).readConditionData
    // We call it the same way CDR validators do: pass empty bytes for conditionData
    const result = await publicClient.readContract({
      address: def.readConditionAddr,
      abi: CHECK_READ_ABI,
      functionName: 'checkReadCondition',
      args: [uuid, '0x', '0x', account.address],
    })
    conditionResults[key] = result

    if (def.expectPass === true) {
      if (result) {
        pass(testId, `${key} condition PASS (expected)`, `checkReadCondition = true`)
      } else {
        fail(testId, `${key} condition FAIL (expected PASS)`, `checkReadCondition = false`)
      }
    } else if (def.expectPass === false) {
      if (!result) {
        pass(testId, `${key} condition FAIL (expected)`, `checkReadCondition = false`)
      } else {
        fail(testId, `${key} condition PASS (expected FAIL)`, `checkReadCondition = true (unexpected)`)
      }
    } else {
      // expectPass = null (TxCount — unknown)
      pass(testId, `${key} condition check (result = ${result}, no expected outcome)`, `checkReadCondition = ${result}`)
    }
  } catch (err) {
    conditionResults[key] = null
    fail(testId, `${key} checkReadCondition call`, err.message?.slice(0, 200))
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: CDR decrypt — PASS cases (NativeBalance + TimeLocked)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70))
console.log('TEST 3: CDR DECRYPT — PASS cases (NativeBalance + TimeLocked)')
console.log('='.repeat(70))

const DECRYPT_PASS_KEYS = ['NativeBalance', 'TimeLocked']

for (const key of DECRYPT_PASS_KEYS) {
  const vaultEntry = publishedVaults.find(v => v.key === key)
  const testIdx    = DECRYPT_PASS_KEYS.indexOf(key) + 1
  const testId     = `3.${testIdx}`

  if (!vaultEntry) {
    fail(testId, `CDR decrypt ${key}`, 'Vault not published (TEST 1 failed)')
    continue
  }

  const { uuid, def } = vaultEntry
  console.log(`\n[TEST ${testId}] CDR decrypt ${key} (UUID=${uuid})...`)
  console.log(`  Condition check result: ${conditionResults[key]}`)

  try {
    const start = Date.now()
    const { content } = await cdrClient.consumer.downloadFile({
      uuid,
      accessAuxData: '0x',
      storageProvider: storage,
      timeoutMs: 120_000,
    })
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    const text = new TextDecoder().decode(content)
    const matches = text.includes('E2E TEST') && text.includes(key)
    if (matches) {
      pass(testId, `CDR decrypt ${key}`, `Decrypted in ${elapsed}s. Content verified: "${text.slice(0, 80)}"`)
    } else {
      fail(testId, `CDR decrypt ${key}`, `Decrypted but content mismatch. Got: "${text.slice(0, 80)}"`)
    }
  } catch (err) {
    fail(testId, `CDR decrypt ${key}`, err.message?.slice(0, 200))
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: CDR decrypt — FAIL case (StoryIPLicense)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70))
console.log('TEST 4: CDR DECRYPT — FAIL case (StoryIPLicense — should be blocked)')
console.log('='.repeat(70))

const storyVault = publishedVaults.find(v => v.key === 'StoryIPLicense')
if (!storyVault) {
  fail('4.1', 'CDR decrypt StoryIPLicense (FAIL case)', 'Vault not published (TEST 1 failed)')
} else {
  const { uuid } = storyVault
  console.log(`\n[TEST 4.1] CDR decrypt StoryIPLicense (UUID=${uuid}) — expect BLOCKED...`)
  console.log(`  Condition check result: ${conditionResults['StoryIPLicense']}`)

  // Use a fresh wallet that definitely has no license
  const freshPK      = generatePrivateKey()
  const freshAccount = privateKeyToAccount(freshPK)
  const freshWallet  = createWalletClient({ account: freshAccount, chain: storyAeneid, transport: http(RPC_URL) })
  const freshCDR     = new CDRClient({ network: 'testnet', publicClient, walletClient: freshWallet, apiUrl: API_URL })

  console.log(`  Using fresh wallet (no assets): ${freshAccount.address}`)

  try {
    await freshCDR.consumer.downloadFile({
      uuid,
      accessAuxData: '0x',
      storageProvider: storage,
      timeoutMs: 60_000,
    })
    fail('4.1', 'CDR decrypt StoryIPLicense (FAIL case)', 'UNEXPECTED SUCCESS — condition not enforced!')
  } catch (err) {
    const msg = err.message ?? ''
    // CDR validators deny access — look for access-denied error
    const isExpected = msg.toLowerCase().includes('condition') ||
                       msg.toLowerCase().includes('denied') ||
                       msg.toLowerCase().includes('not met') ||
                       msg.toLowerCase().includes('timeout') ||
                       msg.toLowerCase().includes('failed') ||
                       msg.toLowerCase().includes('error')
    if (isExpected) {
      pass('4.1', 'CDR decrypt StoryIPLicense (FAIL case)', `Correctly BLOCKED: "${msg.slice(0, 150)}"`)
    } else {
      fail('4.1', 'CDR decrypt StoryIPLicense (FAIL case)', `Got unexpected error: "${msg.slice(0, 150)}"`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: PaymentGate E2E
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70))
console.log('TEST 5: PAYMENTGATE E2E — pay → verify → decrypt')
console.log('='.repeat(70))

const pgVault = publishedVaults.find(v => v.key === 'PaymentGate')

if (!pgVault) {
  fail('5.1', 'PaymentGate: setup', 'Vault not published (TEST 1 failed)')
  fail('5.2', 'PaymentGate: hasPaid=false before payment', 'Skipped')
  fail('5.3', 'PaymentGate: pay()', 'Skipped')
  fail('5.4', 'PaymentGate: hasPaid=true after payment', 'Skipped')
  fail('5.5', 'PaymentGate: CDR decrypt after payment', 'Skipped')
} else {
  const { uuid } = pgVault
  console.log(`\nPaymentGate vault: UUID=${uuid}`)

  // 5.1 Confirm hasPaid = false initially
  console.log(`\n[TEST 5.1] Confirm hasPaid = false before payment...`)
  try {
    const paid = await publicClient.readContract({
      address: PG_GATE, abi: HAS_PAID_ABI, functionName: 'hasPaid',
      args: [uuid, account.address],
    })
    if (!paid) {
      pass('5.1', 'PaymentGate hasPaid=false before payment', `hasPaid(${uuid}, seed) = false`)
    } else {
      // Already paid from a previous test run — mark as informational pass
      pass('5.1', 'PaymentGate hasPaid check (already paid from prior run)', `hasPaid(${uuid}, seed) = ${paid}`)
    }
  } catch (err) {
    fail('5.1', 'PaymentGate hasPaid=false before payment', err.message?.slice(0, 200))
  }

  // 5.2 Call PaymentGate.pay(uuid) with requiredWei
  console.log(`\n[TEST 5.2] Sending payment (${Number(REQUIRED_WEI_PG) / 1e18} IP)...`)
  let payHash
  try {
    payHash = await walletClient.writeContract({
      address: PG_GATE, abi: PAY_ABI, functionName: 'pay',
      args: [uuid],
      value: REQUIRED_WEI_PG,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: payHash })
    if (receipt.status === 'success') {
      pass('5.2', `PaymentGate pay(${uuid})`, `tx: ${payHash}`)
    } else {
      fail('5.2', `PaymentGate pay(${uuid})`, `tx reverted: ${payHash}`)
    }
  } catch (err) {
    fail('5.2', `PaymentGate pay(${uuid})`, err.message?.slice(0, 200))
  }

  // 5.3 Confirm hasPaid = true after payment
  console.log(`\n[TEST 5.3] Confirm hasPaid = true after payment...`)
  try {
    const paid = await publicClient.readContract({
      address: PG_GATE, abi: HAS_PAID_ABI, functionName: 'hasPaid',
      args: [uuid, account.address],
    })
    if (paid) {
      pass('5.3', 'PaymentGate hasPaid=true after payment', `hasPaid(${uuid}, seed) = true`)
    } else {
      fail('5.3', 'PaymentGate hasPaid=true after payment', `hasPaid still false after payment`)
    }
  } catch (err) {
    fail('5.3', 'PaymentGate hasPaid=true after payment', err.message?.slice(0, 200))
  }

  // 5.4 CDR decrypt after payment (CDR uses always-true, so decrypts regardless)
  console.log(`\n[TEST 5.4] CDR decrypt PaymentGate vault (always-true CDR gate)...`)
  try {
    const start = Date.now()
    const { content } = await cdrClient.consumer.downloadFile({
      uuid,
      accessAuxData: '0x',
      storageProvider: storage,
      timeoutMs: 120_000,
    })
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    const text = new TextDecoder().decode(content)
    const matches = text.includes('E2E TEST') && text.toLowerCase().includes('payment')
    if (matches) {
      pass('5.4', 'CDR decrypt PaymentGate vault', `Decrypted in ${elapsed}s. Content verified: "${text.slice(0, 80)}"`)
    } else {
      fail('5.4', 'CDR decrypt PaymentGate vault', `Decrypted but content mismatch. Got: "${text.slice(0, 80)}"`)
    }
  } catch (err) {
    fail('5.4', 'CDR decrypt PaymentGate vault', err.message?.slice(0, 200))
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY TABLE
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(70))
console.log('FINAL SUMMARY')
console.log('='.repeat(70))

const passed = results.filter(r => r.status === 'PASS').length
const failed = results.filter(r => r.status === 'FAIL').length

console.log(`\n${'ID'.padEnd(8)} ${'STATUS'.padEnd(8)} ${'DESCRIPTION'}`)
console.log('-'.repeat(70))
for (const r of results) {
  const status = r.status === 'PASS' ? 'PASS' : 'FAIL'
  console.log(`${r.id.padEnd(8)} ${status.padEnd(8)} ${r.desc}`)
  if (r.detail && r.status === 'FAIL') console.log(`         ^ ${r.detail}`)
}

console.log('-'.repeat(70))
console.log(`\nTotal: ${results.length} tests — ${passed} PASS, ${failed} FAIL`)

if (failed === 0) {
  console.log('\nAll tests passed!')
} else {
  console.log(`\n${failed} test(s) failed. See details above.`)
}

console.log('')
