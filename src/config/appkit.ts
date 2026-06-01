'use client'

import { createAppKit } from '@reown/appkit/react'
import { defineChain } from '@reown/appkit/networks'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

// Story Aeneid testnet — custom chain with CAIP fields required by AppKit
export const storyAeneid = defineChain({
  id: 1315,
  caipNetworkId: 'eip155:1315',
  chainNamespace: 'eip155',
  name: 'Story Aeneid Testnet',
  nativeCurrency: { name: 'IP', symbol: 'IP', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://aeneid.storyrpc.io'] },
  },
  blockExplorers: {
    default: { name: 'StoryScan', url: 'https://aeneid.storyscan.xyz' },
  },
  testnet: true,
})

export const wagmiAdapter = new WagmiAdapter({
  networks: [storyAeneid],
  projectId,
  ssr: true,
})

createAppKit({
  adapters: [wagmiAdapter],
  networks: [storyAeneid],
  projectId,
  metadata: {
    name: 'Litmus',
    description: 'Prove-to-Read gated content vault powered by CDR on Story Protocol',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://litmus.app',
    icons: [],
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-font-family': 'monospace',
    '--w3m-accent': '#ffffff',
    '--w3m-color-mix': '#000000',
    '--w3m-color-mix-strength': 40,
    '--w3m-border-radius-master': '0px',
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
})
