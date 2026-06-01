/**
 * Cancel stuck pending transactions by replacing them with 0-value self-transfers
 * at a higher gas price.
 * Run: node --env-file=.env.local scripts/cancel-stuck-txs.mjs
 */
import { createWalletClient, createPublicClient, http, defineChain, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const PK  = process.env.SEED_PRIVATE_KEY
const RPC = 'https://aeneid.storyrpc.io'

const chain = defineChain({
  id: 1315, name: 'Story Aeneid',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } }, testnet: true,
})

const account      = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient = createPublicClient({ chain, transport: http(RPC) })
const walletClient = createWalletClient({ account, chain, transport: http(RPC) })

console.log('Wallet:', account.address)

const confirmed = await publicClient.getTransactionCount({ address: account.address, blockTag: 'latest' })
const pending   = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' })
console.log(`Confirmed nonce: ${confirmed} | Pending nonce: ${pending}`)

if (confirmed === pending) {
  console.log('No stuck txs. Done.')
  process.exit(0)
}

console.log(`Cancelling nonces ${confirmed}..${pending - 1}...`)

for (let nonce = confirmed; nonce < pending; nonce++) {
  try {
    const hash = await walletClient.sendTransaction({
      to: account.address,
      value: 0n,
      nonce,
      maxFeePerGas: parseGwei('100'),
      maxPriorityFeePerGas: parseGwei('50'),
    })
    console.log(`  Nonce ${nonce} → cancel tx: ${hash}`)
  } catch (e) {
    console.log(`  Nonce ${nonce} error: ${e.shortMessage ?? e.message.slice(0, 100)}`)
  }
}

console.log('\nWaiting 20s for confirmations...')
await new Promise(r => setTimeout(r, 20000))

const finalConfirmed = await publicClient.getTransactionCount({ address: account.address, blockTag: 'latest' })
const finalPending   = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' })
console.log(`Done. Confirmed: ${finalConfirmed} | Pending: ${finalPending}`)
