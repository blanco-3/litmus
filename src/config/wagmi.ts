import { http, createConfig, createStorage, cookieStorage } from 'wagmi'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'

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

export const config = createConfig({
  chains: [storyAeneid],
  connectors: [
    injected(),
  ],
  transports: {
    [storyAeneid.id]: http(),
  },
  ssr: true,
})
