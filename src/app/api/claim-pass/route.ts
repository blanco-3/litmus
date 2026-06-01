import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, createWalletClient, http, defineChain, isAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC_URL   = 'https://aeneid.storyrpc.io'
const PASS_ADDR = '0xdde0fee35f6f4b4ea411b5f657bb4d12d2f0035f'

const PASS_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
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

    // One pass per wallet
    const balance = await publicClient.readContract({
      address: PASS_ADDR, abi: PASS_ABI,
      functionName: 'balanceOf', args: [address],
    })
    if (balance > 0n) {
      return NextResponse.json({ alreadyClaimed: true, address })
    }

    const hash = await walletClient.writeContract({
      address: PASS_ADDR, abi: PASS_ABI,
      functionName: 'mint', args: [address],
    })

    await publicClient.waitForTransactionReceipt({ hash })

    return NextResponse.json({ success: true, address, tx: hash })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
