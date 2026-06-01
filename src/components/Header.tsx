'use client'

import Link from 'next/link'
import { useAppKit, useAppKitAccount } from '@reown/appkit/react'
import { useBalance } from 'wagmi'
import { formatEther } from 'viem'
import { useEffect, useRef } from 'react'

export function Header() {
  const { open } = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const { data: balance } = useBalance({ address: address as `0x${string}` | undefined })
  const registeredRef = useRef<string | null>(null)

  // Auto-register activity in ActivityRegistry when wallet connects
  useEffect(() => {
    if (!address || registeredRef.current === address) return
    registeredRef.current = address
    fetch('/api/register-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    }).catch(() => {})
  }, [address])

  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''
  const ip = balance ? `${parseFloat(formatEther(balance.value)).toFixed(2)} IP` : ''

  return (
    <header style={styles.header}>
      <Link href="/" style={styles.logoWrap}>
        <span style={styles.logoText}>
          <span style={{ color: '#1A1AFF' }}>LIT</span>
          <span style={{ color: '#CC0000' }}>MUS</span>
        </span>
        <div style={styles.logoBar} />
      </Link>

      <div>
        {isConnected ? (
          <button onClick={() => open({ view: 'Account' })} style={styles.btnOutline}>
            {short}{ip ? ` · ${ip}` : ''}
          </button>
        ) : (
          <button onClick={() => open()} style={styles.btnFill}>
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: '56px',
    borderBottom: '1px solid #1a1a1a',
    backgroundColor: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(8px)',
  },
  logoWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '3px',
    textDecoration: 'none',
  },
  logoText: {
    fontFamily: 'monospace',
    fontWeight: 900,
    fontSize: '16px',
    letterSpacing: '0.15em',
  },
  logoBar: {
    width: '100%',
    height: '2px',
    background: 'linear-gradient(to right, #1A1AFF 50%, #CC0000 50%)',
  },
  btnFill: {
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 700,
    padding: '8px 16px',
    backgroundColor: '#fff',
    color: '#000',
    border: 'none',
    cursor: 'pointer',
    letterSpacing: '0.05em',
  },
  btnOutline: {
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 700,
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: '#e0e0e0',
    border: '1px solid #666',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
}
