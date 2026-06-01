/**
 * Test each condition contract with a fresh vault
 * Run: node --env-file=.env.local scripts/test-conditions.mjs
 */

import { CDRClient, initWasm, uuidToLabel } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain, encodeAbiParameters, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const PK      = process.env.SEED_PRIVATE_KEY
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'
const RPC_URL = 'https://aeneid.storyrpc.io'

if (!PK) { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })

// Our deployed contracts
const OPEN_WRITE    = '0xBDEE43Ee09B846077916485A6c3C9dAFBC1677be'
const NATIVE_BAL    = '0x2faF603251a8ae7987DB40818Eb3b37FE2B2BF1f'

await initWasm()
const owner = account.address

async function testCondition(name, readConditionAddr, readConditionData) {
  console.log(`\n--- Testing: ${name} ---`)
  console.log(`  readConditionAddr: ${readConditionAddr}`)

  try {
    // Allocate
    const { uuid } = await cdrClient.uploader.allocate({
      updatable: false,
      writeConditionAddr: OPEN_WRITE,
      writeConditionData: '0x',
      readConditionAddr,
      readConditionData,
      skipConditionValidation: true,
    })
    console.log(`  UUID: ${uuid}`)

    // Encrypt + write
    const secret = `test-${name}-${Date.now()}`
    const globalPubKey = await cdrClient.observer.getGlobalPubKey()
    const label = uuidToLabel(uuid)
    const ciphertext = await cdrClient.uploader.encryptDataKey({
      dataKey: new TextEncoder().encode(secret),
      globalPubKey, label,
    })
    await cdrClient.uploader.write({ uuid, accessAuxData: '0x', encryptedData: toHex(ciphertext.raw) })

    // Read
    const { dataKey: recovered } = await cdrClient.consumer.accessCDR({
      uuid, accessAuxData: '0x', timeoutMs: 60_000,
    })
    console.log(`  ✅ SUCCESS: ${new TextDecoder().decode(recovered)}`)
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.shortMessage ?? err.message}`)
  }
}

console.log(`Wallet: ${owner}\n`)

// Test 1: NativeBalance with 1 wei (should pass for any funded wallet)
await testCondition(
  'NativeBalance(1 wei)',
  NATIVE_BAL,
  encodeAbiParameters([{ type: 'uint256' }], [1n]),
)
