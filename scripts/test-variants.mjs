/**
 * Test different condition contract variants to pinpoint which causes CDR precompile revert.
 */
import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import { createPublicClient, createWalletClient, http, defineChain, encodeAbiParameters, parseAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const JWT     = process.env.NEXT_PUBLIC_PINATA_JWT
const PK      = process.env.SEED_PRIVATE_KEY
const RPC_URL = 'https://aeneid.storyrpc.io'
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

const ALWAYS_TRUE_BYTECODE = '0xd019fA1e1E5e5731D18C633f1aE890022cf090cd'
const ALWAYS_TRUE_PURE   = '0x4399832F841b2e670BA54b187CCD83d0467154A0' // pure, no args used
const ALWAYS_TRUE_VIEW   = '0xdEF9eCd95Bf18a0cE322DA9A204aBcC4b5478813' // view, no args used
const DECODE_ONLY        = '0x95BCE3dEbc5624A9A3659f41A728386508cae357' // pure, decodes uint256
const BALANCE_CHECK      = '0xc3566B53204f6bBBBC480f7153a2Bc5325eaa337' // view, balance check

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

const variants = [
  { name: 'AlwaysTruePure   (pure, no body)',          addr: ALWAYS_TRUE_PURE,  data: '0x'         },
  { name: 'AlwaysTrueView   (view, no body)',          addr: ALWAYS_TRUE_VIEW,  data: '0x'         },
  { name: 'DecodeOnly        (pure, abi.decode)',       addr: DECODE_ONLY,       data: conditionData },
  { name: 'BalanceCheck      (view, balance >= min)',   addr: BALANCE_CHECK,     data: conditionData },
]

for (const v of variants) {
  process.stdout.write(`\n[${v.name}] uploading... `)
  const { uuid } = await cdrClient.uploader.uploadFile({
    content: new TextEncoder().encode(`test: ${v.name}`),
    storageProvider: storage, updatable: false,
    writeConditionAddr: ALWAYS_TRUE_BYTECODE, writeConditionData: '0x',
    readConditionAddr: v.addr, readConditionData: v.data,
    accessAuxData: '0x',
  })
  process.stdout.write(`UUID ${uuid}, reading... `)
  try {
    await cdrClient.consumer.downloadFile({ uuid, accessAuxData: '0x', storageProvider: storage, timeoutMs: 90_000 })
    console.log('SUCCESS ✓')
  } catch (err) {
    console.log('FAILED ✗ —', err.message?.slice(0, 80))
  }
}
