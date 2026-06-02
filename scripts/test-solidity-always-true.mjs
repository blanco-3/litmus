/**
 * Test: upload vault with a Solidity always-true contract (v2 interface) as readConditionAddr.
 * This is the definitive test: if CDR validators can call ANY Solidity v2 contract.
 * Run: node --env-file=.env.local scripts/test-solidity-always-true.mjs
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const RPC_URL = 'https://aeneid.storyrpc.io'
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

const ALWAYS_TRUE_BYTECODE = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd' // 11-byte always-true
const ALWAYS_TRUE_SOLIDITY = '0x4399832F841b2e670BA54b187CCD83d0467154A0' // Solidity v2, always true
const OPEN_WRITE = '0xb5888acA35A9bc7C08F636aBC81eBbEE0345A389'

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
    if (!res.ok) throw new Error(`Pinata: ${res.status}`)
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
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })
const cdrClient    = new CDRClient({ network: 'testnet', publicClient, walletClient, apiUrl: API_URL })
const storage      = new PinataStorage()

console.log('Uploading vault with Solidity always-true (v2 interface) as readConditionAddr...')
const { uuid } = await cdrClient.uploader.uploadFile({
  content: new TextEncoder().encode('Solidity always-true v2 test'),
  storageProvider: storage,
  updatable: false,
  writeConditionAddr: ALWAYS_TRUE_BYTECODE,
  writeConditionData: '0x',
  readConditionAddr: ALWAYS_TRUE_SOLIDITY,   // Solidity contract, v2, always true
  readConditionData: '0x',
  accessAuxData: '0x',
})
console.log('UUID:', uuid)

console.log('\nAttempting download (validators must call Solidity always-true v2)...')
try {
  const { content } = await cdrClient.consumer.downloadFile({
    uuid,
    accessAuxData: '0x',
    storageProvider: storage,
    timeoutMs: 120_000,
  })
  console.log('\nSUCCESS — CDR validators CAN call real Solidity v2 contracts!')
  console.log('Content:', new TextDecoder().decode(content))
} catch (err) {
  console.log('\nFAILED — CDR validators CANNOT call real Solidity contracts (even always-true)')
  console.log('Error:', err.message?.slice(0, 200))
}
