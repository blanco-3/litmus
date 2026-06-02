/**
 * Simulate CDR download for UUID 4994 (NativeBalance ≥1 IP — seed wallet should pass).
 * This tests the full CDR flow: condition check → partial decryptions → decrypt.
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const JWT = process.env.NEXT_PUBLIC_PINATA_JWT
const PK  = process.env.SEED_PRIVATE_KEY
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

if (!JWT || !PK) { console.error('Missing JWT or PK'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: ['https://aeneid.storyrpc.io'] } }, testnet: true,
})

class PinataStorage {
  async upload(data) {
    const form = new FormData()
    form.append('file', new Blob([data.buffer]), 'content.bin')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST', headers: { Authorization: `Bearer ${JWT}` }, body: form,
    })
    if (!res.ok) throw new Error(`Pinata upload: ${res.status}`)
    return (await res.json()).IpfsHash
  }
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
const storage      = new PinataStorage()

console.log(`\nReader: ${account.address}`)
console.log('Target: UUID 4994 (NativeBalance ≥1 IP gate)')
console.log('Requesting partial decryptions from CDR validators...\n')

const start = Date.now()
const { content } = await cdrClient.consumer.downloadFile({
  uuid: 4994,
  accessAuxData: '0x',
  storageProvider: storage,
  timeoutMs: 120_000,
})

const elapsed = ((Date.now() - start) / 1000).toFixed(1)
const text = new TextDecoder().decode(content)
console.log(`✓ Decrypted in ${elapsed}s`)
console.log('─'.repeat(60))
console.log(text.slice(0, 400))
console.log('─'.repeat(60))
