/**
 * Simulate condition checking for all 7 seeded vaults (4990-4996).
 * Uses real RPC calls — no CDR SDK needed.
 */
import {
  createPublicClient, http, defineChain,
  decodeAbiParameters, parseAbiParameters,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const addresses = require('/Users/blanco/litmus/deployments/addresses.json')
const PK = process.env.SEED_PRIVATE_KEY

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: ['https://aeneid.storyrpc.io'] } }, testnet: true,
})

const publicClient = createPublicClient({ chain: storyAeneid, transport: http() })
const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const reader = account.address

const CDR_ADDR = '0xCCCcCC0000000000000000000000000000000005'
const VAULT_ABI = [{
  name: 'vaults', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'uuid', type: 'uint32' }],
  outputs: [{ name: '', type: 'tuple', components: [
    { name: 'updatable', type: 'bool' },
    { name: 'writeConditionAddr', type: 'address' },
    { name: 'readConditionAddr', type: 'address' },
    { name: 'writeConditionData', type: 'bytes' },
    { name: 'readConditionData', type: 'bytes' },
    { name: 'encryptedData', type: 'bytes' },
  ]}],
}]
const COND_ABI = [{
  name: 'checkReadCondition', type: 'function', stateMutability: 'view',
  inputs: [
    { name: 'uuid', type: 'uint32' },
    { name: 'conditionData', type: 'bytes' },
    { name: 'accessAuxData', type: 'bytes' },
    { name: 'reader', type: 'address' },
  ],
  outputs: [{ name: '', type: 'bool' }],
}]
const HAS_PAID_ABI = [{
  name: 'hasPaid', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'uuid', type: 'uint32' }, { name: 'reader', type: 'address' }],
  outputs: [{ name: '', type: 'bool' }],
}]

const ALWAYS_TRUE = '0xd019fa1e1e5e5731d18c633f1ae890022cf090cd'
const PG_COND = addresses.contracts.PaymentGateCondition.toLowerCase()

const VAULT_LABELS = {
  4990: 'NFT gate (LitmusPass)',
  4991: 'Token gate (100 LCOIN)',
  4992: 'TxCount gate (≥10 txs)',
  4993: 'Story IP License gate',
  4994: 'Native balance gate (≥1 IP)',
  4995: 'Time lock (unlocked Jan 1 2026)',
  4996: 'PaymentGate (0.01 IP)',
}

console.log(`\nReader: ${reader}`)
const balance = await publicClient.getBalance({ address: reader })
console.log(`Balance: ${Number(balance) / 1e18} IP\n`)

for (const uuid of [4990,4991,4992,4993,4994,4995,4996]) {
  const label = VAULT_LABELS[uuid]
  process.stdout.write(`UUID ${uuid} [${label}] ... `)

  try {
    const vault = await publicClient.readContract({
      address: CDR_ADDR, abi: VAULT_ABI, functionName: 'vaults',
      args: [uuid],
    })

    let condAddr = vault.readConditionAddr
    let condData = vault.readConditionData
    let isHybrid = false

    if (condAddr.toLowerCase() === ALWAYS_TRUE) {
      isHybrid = true
      try {
        const [realAddr, realData] = decodeAbiParameters(
          parseAbiParameters('address, bytes'), condData
        )
        condAddr = realAddr
        condData = realData
      } catch {}
    }

    let result
    if (isHybrid && condAddr.toLowerCase() === PG_COND) {
      // PaymentGate: check hasPaid
      const [gateAddr] = decodeAbiParameters(parseAbiParameters('address, uint256'), condData)
      result = await publicClient.readContract({
        address: gateAddr, abi: HAS_PAID_ABI, functionName: 'hasPaid',
        args: [uuid, reader],
      })
      process.stdout.write(`hasPaid=${result}`)
    } else {
      result = await publicClient.readContract({
        address: condAddr, abi: COND_ABI, functionName: 'checkReadCondition',
        args: [uuid, condData, '0x', reader],
      })
    }

    const status = result ? '✓ PASS' : '✗ FAIL'
    const hybrid = isHybrid ? ' [hybrid/PaymentGate]' : ' [self-reading]'
    console.log(`${status}${hybrid}`)
    console.log(`       conditionAddr: ${condAddr}`)
  } catch (err) {
    console.log(`ERROR: ${err.message?.slice(0,120)}`)
  }
}

console.log('\nDone.')
