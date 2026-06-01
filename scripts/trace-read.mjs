/**
 * Trace: send real read() tx for UUID 4310, then debug_traceTransaction to find revert reason
 * Run: node --env-file=.env.local scripts/trace-read.mjs [uuid]
 */

import { createPublicClient, createWalletClient, http, defineChain, parseAbiParameters, encodeAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const PK      = process.env.SEED_PRIVATE_KEY
const API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'
const RPC_URL = 'https://aeneid.storyrpc.io'
const UUID    = Number(process.argv[2] ?? 4310)

if (!PK) { console.error('Missing SEED_PRIVATE_KEY'); process.exit(1) }

const storyAeneid = defineChain({
  id: 1315,
  name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
})

const CDR_ADDR = '0xcccccc0000000000000000000000000000000005'

const VAULT_ABI = [{
  name: 'vaults', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'uuid', type: 'uint32' }],
  outputs: [{ name: 'vault', type: 'tuple', components: [
    { name: 'updatable', type: 'bool' },
    { name: 'writeConditionAddr', type: 'address' },
    { name: 'readConditionAddr', type: 'address' },
    { name: 'writeConditionData', type: 'bytes' },
    { name: 'readConditionData', type: 'bytes' },
    { name: 'encryptedData', type: 'bytes' },
  ]}],
}]

const READ_ABI = [{
  name: 'read', type: 'function', stateMutability: 'nonpayable',
  inputs: [
    { name: 'uuid', type: 'uint32' },
    { name: 'accessAuxData', type: 'bytes' },
    { name: 'pubKey', type: 'bytes' },
  ],
  outputs: [],
}]

// Also try old-style read (2-param)
const READ_ABI_OLD = [{
  name: 'read', type: 'function', stateMutability: 'nonpayable',
  inputs: [
    { name: 'uuid', type: 'uint32' },
    { name: 'accessAuxData', type: 'bytes' },
  ],
  outputs: [],
}]

const account = privateKeyToAccount(PK.startsWith('0x') ? PK : `0x${PK}`)
const publicClient  = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
const walletClient  = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })

console.log(`\n=== CDR Read Trace for UUID ${UUID} ===`)
console.log(`Wallet: ${account.address}\n`)

// Step 1: Check DKG state
console.log('[1] Checking DKG state...')
try {
  const res = await fetch(`${API_URL}/cdr/v1/dkg_round`)
  if (res.ok) {
    const data = await res.json()
    console.log(`  Round: ${data.round?.round_id}, Stage: ${data.round?.stage}, Resharing: ${data.round?.is_resharing}`)
    const pubKey = data.round?.group_public_key
    console.log(`  Group pubkey (first 40 chars): ${pubKey?.slice(0, 40)}...`)
    console.log(`  Group pubkey length: ${pubKey?.length}`)

    // Save pubKey for read call
    globalThis.DKG_PUBKEY = pubKey
  } else {
    console.log(`  DKG API returned ${res.status}`)
  }
} catch (e) {
  console.log(`  DKG API error: ${e.message}`)
}

// Also try /cdr/v1/dkg_group_public_key
console.log('\n[1b] Trying alternate DKG endpoints...')
for (const endpoint of ['/cdr/v1/dkg_group_public_key', '/cdr/v1/state', '/cdr/v1/dkg_state']) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`)
    if (res.ok) {
      const text = await res.text()
      console.log(`  ${endpoint}: ${text.slice(0, 200)}`)
    } else {
      console.log(`  ${endpoint}: ${res.status}`)
    }
  } catch (e) {
    console.log(`  ${endpoint}: ${e.message}`)
  }
}

// Step 2: Read vault
console.log('\n[2] Reading vault from chain...')
let vault
try {
  vault = await publicClient.readContract({
    address: CDR_ADDR, abi: VAULT_ABI, functionName: 'vaults', args: [UUID],
  })
  console.log(`  readConditionAddr: ${vault.readConditionAddr}`)
  console.log(`  writeConditionAddr: ${vault.writeConditionAddr}`)
  console.log(`  encryptedData length: ${vault.encryptedData.length} bytes`)
  console.log(`  encryptedData (first 66 bytes): ${vault.encryptedData.slice(0, 66)}`)
} catch (err) {
  console.error(`  FAILED: ${err.message}`)
  process.exit(1)
}

// Step 3: Simulate read with various pubkey formats
console.log('\n[3] Simulating read() call...')

const pubKeyHex = globalThis.DKG_PUBKEY ?
  (globalThis.DKG_PUBKEY.startsWith('0x') ? globalThis.DKG_PUBKEY : `0x${globalThis.DKG_PUBKEY}`)
  : '0x'

console.log(`  Using pubkey: ${pubKeyHex.slice(0, 42)}... (length=${pubKeyHex.length})`)

// Try simulate
try {
  const result = await publicClient.simulateContract({
    address: CDR_ADDR,
    abi: READ_ABI,
    functionName: 'read',
    args: [UUID, '0x', pubKeyHex],
    account: account.address,
  })
  console.log('  Simulation SUCCESS:', result)
} catch (err) {
  console.log(`  Simulation FAILED: ${err.shortMessage ?? err.message}`)
  if (err.cause?.data) console.log(`  revert data: ${err.cause.data}`)
}

// Also try with empty pubkey
console.log('\n[3b] Simulating read() with empty pubkey...')
try {
  await publicClient.simulateContract({
    address: CDR_ADDR,
    abi: READ_ABI,
    functionName: 'read',
    args: [UUID, '0x', '0x'],
    account: account.address,
  })
  console.log('  Simulation SUCCESS (empty pubkey)')
} catch (err) {
  console.log(`  FAILED: ${err.shortMessage ?? err.message}`)
}

// Step 4: Check what the CDR SDK actually sends as pubkey
console.log('\n[4] Checking CDR partials API (to understand expected flow)...')
try {
  const res = await fetch(`${API_URL}/cdr/v1/dkg_partials?uuid=${UUID}`)
  if (res.ok) {
    const data = await res.json()
    console.log(`  partials response: ${JSON.stringify(data).slice(0, 300)}`)
  } else {
    console.log(`  partials ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`)
  }
} catch (e) {
  console.log(`  error: ${e.message}`)
}

// Step 5: Send actual read tx and get trace
console.log('\n[5] Sending real read() transaction (with DKG pubkey)...')
let txHash
try {
  txHash = await walletClient.writeContract({
    address: CDR_ADDR,
    abi: READ_ABI,
    functionName: 'read',
    args: [UUID, '0x', pubKeyHex],
    gas: 500000n,
  })
  console.log(`  TX hash: ${txHash}`)

  // Wait for receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30000 })
  console.log(`  Status: ${receipt.status}`)
  console.log(`  Gas used: ${receipt.gasUsed}`)

  if (receipt.status === 'reverted') {
    console.log('  TX REVERTED — fetching trace...')
    // Try debug_traceTransaction
    try {
      const traceRes = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'debug_traceTransaction',
          params: [txHash, { tracer: 'callTracer', tracerConfig: { withLog: true } }],
        }),
      })
      const trace = await traceRes.json()
      if (trace.error) {
        console.log(`  trace error: ${JSON.stringify(trace.error)}`)
      } else {
        const t = trace.result
        console.log('\n  === Call Trace ===')
        function printTrace(call, depth = 0) {
          const indent = '  '.repeat(depth + 2)
          console.log(`${indent}[${call.type}] to=${call.to} input=${call.input?.slice(0,10)} output=${call.output?.slice(0,20)} error=${call.error ?? 'none'}`)
          if (call.calls) call.calls.forEach(c => printTrace(c, depth + 1))
        }
        printTrace(t)
      }
    } catch (e) {
      console.log(`  trace fetch error: ${e.message}`)
    }
  } else {
    console.log('  TX SUCCEEDED!')
  }
} catch (err) {
  console.log(`  FAILED to send: ${err.shortMessage ?? err.message}`)
}
