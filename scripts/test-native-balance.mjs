/**
 * Test NativeBalanceCondition — two variants:
 * A) with proper conditionData (encoded uint256)
 * B) with empty conditionData '0x' to see if precompile passes it through correctly
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain, encodeAbiParameters, parseAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const RPC_URL = 'https://aeneid.storyrpc.io'
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

const ALWAYS_TRUE_BYTECODE = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'
const NATIVE_BAL = '0x7fd61F73255375b2D7FC29de0a64F002A34391fe'

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

const conditionData = encodeAbiParameters(parseAbiParameters('uint256 minWei'), [BigInt('1000000000000000')])

// Test A: NativeBalanceCondition with proper conditionData (encoded uint256)
console.log('=== Test A: NativeBalanceCondition with proper conditionData ===')
const { uuid: uuidA } = await cdrClient.uploader.uploadFile({
  content: new TextEncoder().encode('test A'),
  storageProvider: storage, updatable: false,
  writeConditionAddr: ALWAYS_TRUE_BYTECODE, writeConditionData: '0x',
  readConditionAddr: NATIVE_BAL,
  readConditionData: conditionData,  // proper encoded uint256
  accessAuxData: '0x',
})
console.log('UUID A:', uuidA)
try {
  const { content } = await cdrClient.consumer.downloadFile({ uuid: uuidA, accessAuxData: '0x', storageProvider: storage, timeoutMs: 90_000 })
  console.log('A: SUCCESS —', new TextDecoder().decode(content))
} catch (err) {
  console.log('A: FAILED —', err.message?.slice(0, 150))
}

// Test B: NativeBalanceCondition with empty conditionData '0x' (would cause abi.decode revert)
console.log('\n=== Test B: NativeBalanceCondition with empty conditionData ===')
const { uuid: uuidB } = await cdrClient.uploader.uploadFile({
  content: new TextEncoder().encode('test B'),
  storageProvider: storage, updatable: false,
  writeConditionAddr: ALWAYS_TRUE_BYTECODE, writeConditionData: '0x',
  readConditionAddr: NATIVE_BAL,
  readConditionData: '0x',  // empty — abi.decode will revert
  accessAuxData: '0x',
})
console.log('UUID B:', uuidB)
try {
  const { content } = await cdrClient.consumer.downloadFile({ uuid: uuidB, accessAuxData: '0x', storageProvider: storage, timeoutMs: 90_000 })
  console.log('B: SUCCESS —', new TextDecoder().decode(content))
} catch (err) {
  console.log('B: FAILED —', err.message?.slice(0, 150))
}
