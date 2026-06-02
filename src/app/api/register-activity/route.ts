import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, defineChain, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC_URL = 'https://aeneid.storyrpc.io'
const ACTIVITY_REGISTRY = '0xC2e9C0c8178B28bafc750ad5557EF7d13aFA0e35'

const REGISTRY_ABI = [
  {
    name: 'setTxCount',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'wallet', type: 'address' }, { name: 'count', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'txCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

const storyAeneid = defineChain({
  id: 1315,
  name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
})

export async function POST(req: NextRequest) {
  const { address } = await req.json().catch(() => ({}))

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 })
  }

  const pk = process.env.SEED_PRIVATE_KEY
  if (!pk) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })

  try {
    const account = privateKeyToAccount(pk.startsWith('0x') ? pk as `0x${string}` : `0x${pk}`)
    const publicClient = createPublicClient({ chain: storyAeneid, transport: http(RPC_URL) })
    const walletClient = createWalletClient({ account, chain: storyAeneid, transport: http(RPC_URL) })

    // Get actual tx count from chain (nonce = total txs sent)
    const onchainCount = await publicClient.getTransactionCount({ address, blockTag: 'latest' })

    // Check current stored value — skip write if already up to date
    const stored = await publicClient.readContract({
      address: ACTIVITY_REGISTRY, abi: REGISTRY_ABI,
      functionName: 'txCount', args: [address],
    })

    if (stored >= onchainCount) {
      return NextResponse.json({ address, txCount: Number(onchainCount), updated: false })
    }

    const hash = await walletClient.writeContract({
      address: ACTIVITY_REGISTRY, abi: REGISTRY_ABI,
      functionName: 'setTxCount', args: [address, BigInt(onchainCount)],
    })

    return NextResponse.json({ address, txCount: onchainCount, updated: true, tx: hash })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
