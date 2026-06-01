import type { Metadata } from 'next'
import './globals.css'
import { Web3Provider } from '@/components/Web3Provider'
import { Header } from '@/components/Header'

export const metadata: Metadata = {
  title: 'Litmus — Prove to Read',
  description: 'On-chain activity gated content vault powered by CDR on Story Protocol',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#000' }}>
        <Web3Provider>
          <Header />
          <div style={{ paddingTop: '56px' }}>{children}</div>
        </Web3Provider>
      </body>
    </html>
  )
}
