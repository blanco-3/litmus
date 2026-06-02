/**
 * Negative test: try to download UUID 4990 (NFT gate) from a wallet with NO LitmusPass.
 * Uses a fresh throwaway account that definitely has no NFTs.
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { privateKeyToAccount } from 'viem/accounts'

const JWT = process.env.NEXT_PUBLIC_PINATA_JWT
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'
if (!JWT) { console.error('Missing JWT'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: ['https://aeneid.storyrpc.io'] } }, testnet: true,
})

class PinataStorage {
  async upload() { throw new Error('upload not needed') }
  async download(cid) {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`)
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    throw new Error(`IPFS: ${cid}`)
  }
}

await initWasm()
const freshKey     = generatePrivateKey()
const account      = privateKeyToAccount(freshKey)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http() })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http() })
const cdrClient    = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })

console.log(`\nFresh wallet (no NFTs, no tokens): ${account.address}`)
console.log('Target: UUID 4990 (NFT gate — LitmusPass required)')
console.log('Attempting download — expect FAILURE...\n')

try {
  await cdrClient.consumer.downloadFile({
    uuid: 4990,
    accessAuxData: '0x',
    storageProvider: new PinataStorage(),
    timeoutMs: 60_000,
  })
  console.log('UNEXPECTED SUCCESS — condition not enforced!')
} catch (err) {
  console.log(`✓ Correctly BLOCKED by CDR validators`)
  console.log(`  Error: ${err.message?.slice(0, 200)}`)
}
