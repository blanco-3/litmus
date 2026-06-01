'use client'

import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi'
import { formatEther } from 'viem'

const WALLET_LABELS: Record<string, string> = {
  MetaMask: 'MetaMask',
  'Injected': 'Browser Wallet',
  WalletConnect: 'WalletConnect (QR / Mobile)',
  'Coinbase Wallet': 'Coinbase Wallet',
}

export function WalletSection() {
  const { address, isConnected } = useAccount()
  const { connectors, connect, isPending, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: balance } = useBalance({ address })

  // Deduplicate connectors that share the same human-readable name
  const seen = new Set<string>()
  const uniqueConnectors = connectors.filter((c) => {
    if (seen.has(c.name)) return false
    seen.add(c.name)
    return true
  })

  if (isConnected) {
    const ip = balance ? `${parseFloat(formatEther(balance.value)).toFixed(2)} IP` : '...'
    return (
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={styles.address}>{address}</span>
        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1A1AFF' }}>{ip}</span>
        <button onClick={() => disconnect()} style={styles.btnSmall}>Disconnect</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {uniqueConnectors.map((c) => (
          <button
            key={c.uid}
            onClick={() => connect({ connector: c })}
            disabled={isPending}
            style={{
              ...styles.btn,
              opacity: isPending ? 0.5 : 1,
            }}
          >
            {WALLET_LABELS[c.name] ?? c.name}
          </button>
        ))}
      </div>
      {connectError && (
        <div style={{ color: '#CC0000', fontSize: '11px', fontFamily: 'monospace' }}>
          {connectError.message}
        </div>
      )}
      <div style={{ color: '#444', fontSize: '10px', fontFamily: 'monospace', lineHeight: 1.6 }}>
        Story Aeneid Testnet · Chain ID 1315 · Add network manually if prompted
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  address: { fontFamily: 'monospace', fontSize: '12px', color: '#ccc' },
  btn: {
    fontFamily: 'monospace',
    fontSize: '13px',
    fontWeight: 700,
    padding: '10px 20px',
    border: '2px solid #fff',
    color: '#fff',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  btnSmall: {
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '4px 12px',
    border: '1px solid #444',
    color: '#fff',
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
}
