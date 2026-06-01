import { http, createConfig } from 'wagmi'
import { defineChain } from 'viem'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'

export const storyAeneid = defineChain({
  id: 1315,
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

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

export const config = createConfig({
  chains: [storyAeneid],
  connectors: [
    injected({ target: 'metaMask' }),
    injected(), // catches Rabby, Brave, etc.
    walletConnect({
      projectId: wcProjectId,
      metadata: {
        name: 'Litmus',
        description: 'Prove-to-Read gated content vault powered by CDR on Story Protocol',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://litmus.app',
        icons: [],
      },
      showQrModal: true,
    }),
    coinbaseWallet({ appName: 'Litmus' }),
  ],
  transports: {
    [storyAeneid.id]: http(),
  },
  ssr: true,
})
