/**
 * Definitive test: does CDR precompile forward stored conditionData to condition contract?
 * If precompile passes empty bytes, abi.decode(bytes, (uint256)) will revert.
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain, encodeAbiParameters, parseAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const RPC_URL = 'https://aeneid.storyrpc.io'
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

const ALWAYS_TRUE_BYTECODE = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'
// BalanceCheck WITH null check → succeeds when CDR passes empty conditionData
const BALANCE_CHECK_NULL = '0xc3566B53204f6bBBBC480f7153a2Bc5325eaa337'
// DecodeOnly WITH null check → succeeds when CDR passes empty conditionData
const DECODE_ONLY_NULL   = '0x95BCE3dEbc5624A9A3659f41A728386508cae357'

const conditionData = encodeAbiParameters(parseAbiParameters('uint256'), [BigInt('1000000000000000')])

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

class PinataStorage {
  async upload(data) {
    const form = new FormData()
    form.append('file', new Blob([data.buffer], { type: 'application/octet-stream' }), 'content.bin')
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', { method: 'POST', headers: { Authorization: `Bearer ${JWT}` }, body: form })
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

// BalanceCheck with conditionData = properly encoded uint256
// If CDR forwards it → abi.decode succeeds → balance check runs
// If CDR passes empty → null check catches it → reader.balance > 0 runs
const { uuid: u1 } = await cdrClient.uploader.uploadFile({
  content: new TextEncoder().encode('conddata test 1'),
  storageProvider: storage, updatable: false,
  writeConditionAddr: ALWAYS_TRUE_BYTECODE, writeConditionData: '0x',
  readConditionAddr: BALANCE_CHECK_NULL, readConditionData: conditionData,
  accessAuxData: '0x',
})
process.stdout.write(`[BalanceCheck + proper conditionData] UUID ${u1}, reading... `)
try {
  await cdrClient.consumer.downloadFile({ uuid: u1, accessAuxData: '0x', storageProvider: storage, timeoutMs: 90_000 })
  console.log('SUCCESS — condition passed')
} catch (err) { console.log('FAILED —', err.message?.slice(0, 80)) }

// Same but with a VERY HIGH threshold (1000 IP) — only passes if CDR ignores conditionData
const highCondData = encodeAbiParameters(parseAbiParameters('uint256'), [1000n * 10n ** 18n])
const { uuid: u2 } = await cdrClient.uploader.uploadFile({
  content: new TextEncoder().encode('conddata test 2 — should fail if balance actually checked'),
  storageProvider: storage, updatable: false,
  writeConditionAddr: ALWAYS_TRUE_BYTECODE, writeConditionData: '0x',
  readConditionAddr: BALANCE_CHECK_NULL, readConditionData: highCondData,
  accessAuxData: '0x',
})
process.stdout.write(`[BalanceCheck + 1000 IP threshold] UUID ${u2}, reading... `)
try {
  const { content } = await cdrClient.consumer.downloadFile({ uuid: u2, accessAuxData: '0x', storageProvider: storage, timeoutMs: 90_000 })
  console.log('SUCCESS — CDR ignored conditionData (passed empty to contract)')
} catch (err) { console.log('FAILED — condition enforced with real conditionData') }
