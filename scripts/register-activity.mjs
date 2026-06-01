/**
 * ActivityRegistry oracle — reads on-chain tx counts from Aeneid and writes
 * them into our ActivityRegistry contract so TxCountCondition vaults work.
 *
 * Usage:
 *   node --env-file=.env.local scripts/register-activity.mjs 0xADDR1 0xADDR2 ...
 *   (no args → registers seed wallet + user wallet)
 */
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const addresses = require('../deployments/addresses.json')

const PK      = process.env.SEED_PRIVATE_KEY
const RPC_URL = 'https://aeneid.storyrpc.io'

if (!PK) { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const REGISTRY = addresses.contracts.ActivityRegistry

const REGISTRY_ABI = [
  {
    name: 'batchSetTxCount',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'wallets', type: 'address[]' },
      { name: 'counts',  type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    name: 'txCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
]

const storyAeneid = defineChain({
  id: 1315, name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } }, testnet: true,
})

const account      = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })

// Addresses to register: from CLI args or defaults
const DEFAULT_WALLETS = [
  account.address,                                     // seed wallet
  '0x7B9846c4aC8E0bBc620d6a321A3b5c109A0350Bf',       // user wallet
]
const wallets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : DEFAULT_WALLETS

console.log(`Registering activity for ${wallets.length} wallet(s)...\n`)

// Fetch tx counts in parallel (nonce = total txs sent from address)
const counts = await Promise.all(
  wallets.map((addr) =>
    publicClient.getTransactionCount({ address: addr, blockTag: 'latest' })
  )
)

for (let i = 0; i < wallets.length; i++) {
  console.log(`  ${wallets[i]}  →  ${counts[i]} txs`)
}

// Write to ActivityRegistry
console.log('\nWriting to ActivityRegistry...')
const hash = await walletClient.writeContract({
  address: REGISTRY,
  abi: REGISTRY_ABI,
  functionName: 'batchSetTxCount',
  args: [wallets, counts.map(BigInt)],
})
console.log(`  tx: ${hash}`)

await publicClient.waitForTransactionReceipt({ hash })
console.log('  confirmed.\n')

// Verify
for (const wallet of wallets) {
  const stored = await publicClient.readContract({
    address: REGISTRY, abi: REGISTRY_ABI,
    functionName: 'txCount', args: [wallet],
  })
  console.log(`  registry[${wallet.slice(0,8)}...] = ${stored}`)
}

console.log('\nDone. TxCountCondition vaults will now work for these wallets.')
