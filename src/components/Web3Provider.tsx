'use client'

import '@/config/appkit' // initializes AppKit + WagmiAdapter (side-effect import)
import { wagmiAdapter } from '@/config/appkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { WagmiProvider, type Config } from 'wagmi'

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  // wagmiAdapter.wagmiConfig is typed against @wagmi/core v2 internally;
  // wagmi v3's WagmiProvider accepts it at runtime — cast to align types.
  const wagmiConfig = wagmiAdapter.wagmiConfig as unknown as Config

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
