/**
 * Negative test with funded wallet: UUID 4993 (Story IP License gate).
 * Condition check returned FAIL for this wallet — CDR should block download.
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const JWT = process.env.NEXT_PUBLIC_PINATA_JWT
const PK  = process.env.SEED_PRIVATE_KEY
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: ['https://aeneid.storyrpc.io'] } }, testnet: true,
})

class PinataStorage {
  async upload() { throw new Error('not needed') }
  async download(cid) {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    throw new Error(`IPFS: ${cid}`)
  }
}

await initWasm()
const account      = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http() })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http() })
const cdrClient    = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })

console.log(`\nWallet: ${account.address}`)
console.log('Target: UUID 4993 (Story IP License gate — wallet has no license)')
console.log('Attempting download — expect FAILURE from CDR validators...\n')

const start = Date.now()
try {
  const { content } = await cdrClient.consumer.downloadFile({
    uuid: 4993,
    accessAuxData: '0x',
    storageProvider: new PinataStorage(),
    timeoutMs: 90_000,
  })
  const text = new TextDecoder().decode(content)
  console.log('⚠ UNEXPECTED SUCCESS — condition not enforced!')
  console.log(text.slice(0, 100))
} catch (err) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`✓ BLOCKED by CDR validators (${elapsed}s)`)
  console.log(`  Error: ${err.message?.slice(0, 300)}`)
}
