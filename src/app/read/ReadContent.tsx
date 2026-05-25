'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from 'wagmi'
import { ensureWasm, createCDRClient, decryptContent } from '@/lib/cdr'
import addresses from '../../../deployments/addresses.json'
import type { Hex } from 'viem'

type VerifyState = 'idle' | 'checking' | 'proven' | 'failed' | 'decrypting' | 'decrypted' | 'error'

export default function ReadContent() {
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [uuid, setUuid] = useState(searchParams.get('uuid') ?? '')
  const [encryptedData, setEncryptedData] = useState(searchParams.get('data') ?? '')
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [decryptedContent, setDecryptedContent] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [litmusProgress, setLitmusProgress] = useState(0)
  const [litmusColor, setLitmusColor] = useState<'#1A1AFF' | '#CC0000' | '#444'>('#444')
  const animFrameRef = useRef<number | null>(null)

  // Animate litmus strip fill
  function animateLitmus(targetColor: '#1A1AFF' | '#CC0000') {
    setLitmusColor(targetColor)
    setLitmusProgress(0)
    let start: number | null = null

    function step(ts: number) {
      if (!start) start = ts
      const elapsed = ts - start
      const progress = Math.min(elapsed / 1200, 1) // 1.2s animation
      setLitmusProgress(progress)
      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step)
      }
    }

    animFrameRef.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  async function handleVerify() {
    if (!uuid.trim()) return setErrorMsg('Enter a UUID.')
    if (!encryptedData.trim()) return setErrorMsg('No encrypted content found. Check the share link.')
    if (!publicClient || !walletClient || !address) return setErrorMsg('Connect your wallet first.')

    setErrorMsg('')
    setVerifyState('checking')
    setLitmusProgress(0)
    setLitmusColor('#444')

    try {
      await ensureWasm()
      const client = createCDRClient(publicClient, walletClient)

      // Read vault to get the read condition addr + condition data
      const cdrAddr = '0xcccccc0000000000000000000000000000000005' as Hex
      const vaultAbi = [
        {
          name: 'vaults',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'uuid', type: 'uint32' }],
          outputs: [
            {
              name: 'vault',
              type: 'tuple',
              components: [
                { name: 'updatable', type: 'bool' },
                { name: 'writeConditionAddr', type: 'address' },
                { name: 'readConditionAddr', type: 'address' },
                { name: 'writeConditionData', type: 'bytes' },
                { name: 'readConditionData', type: 'bytes' },
                { name: 'encryptedData', type: 'bytes' },
              ],
            },
          ],
        },
      ] as const

      const vault = await publicClient.readContract({
        address: cdrAddr,
        abi: vaultAbi,
        functionName: 'vaults',
        args: [Number(uuid) as never],
      }) as {
        readConditionAddr: Hex
        readConditionData: Hex
      }

      // Call checkReadCondition on the vault's condition contract
      const conditionAbi = [
        {
          name: 'checkReadCondition',
          type: 'function',
          stateMutability: 'view',
          inputs: [
            { name: 'reader', type: 'address' },
            { name: 'conditionData', type: 'bytes' },
            { name: 'accessAuxData', type: 'bytes' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ] as const

      const canRead = await publicClient.readContract({
        address: vault.readConditionAddr,
        abi: conditionAbi,
        functionName: 'checkReadCondition',
        args: [address, vault.readConditionData, '0x'],
      })

      if (!canRead) {
        setVerifyState('failed')
        animateLitmus('#CC0000')
        return
      }

      // Proven — animate blue, then decrypt
      setVerifyState('proven')
      animateLitmus('#1A1AFF')

      // Wait for animation to mostly complete before decrypting
      await new Promise((r) => setTimeout(r, 800))
      setVerifyState('decrypting')

      const { dataKey } = await client.consumer.accessCDR({
        uuid: Number(uuid),
        accessAuxData: '0x',
      })

      const plaintext = await decryptContent(encryptedData, dataKey)
      setDecryptedContent(plaintext)
      setVerifyState('decrypted')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setVerifyState('error')
      animateLitmus('#CC0000')
    }
  }

  const isDeployed = addresses.deployed

  return (
    <main style={styles.page}>
      <a href="/" style={styles.back}>← LITMUS</a>
      <h1 style={styles.title}>[ Read ]</h1>

      {/* Wallet */}
      <section style={styles.section}>
        <div style={styles.sectionLabel}>WALLET</div>
        {isConnected ? (
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={styles.mono}>{address}</span>
            <button onClick={() => disconnect()} style={styles.btnSmall}>Disconnect</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {connectors.map((c) => (
              <button key={c.uid} onClick={() => connect({ connector: c })} style={styles.btn}>
                Connect {c.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* UUID + data input */}
      <section style={styles.section}>
        <div style={styles.sectionLabel}>CONTENT UUID</div>
        <input
          type="text"
          value={uuid}
          onChange={(e) => setUuid(e.target.value)}
          placeholder="Enter UUID from share link..."
          style={styles.input}
        />
        {!encryptedData && (
          <>
            <div style={{ ...styles.sectionLabel, marginTop: '16px' }}>ENCRYPTED CONTENT (from share link)</div>
            <input
              type="text"
              value={encryptedData}
              onChange={(e) => setEncryptedData(e.target.value)}
              placeholder="Paste encrypted data from share link..."
              style={styles.input}
            />
          </>
        )}
      </section>

      {/* Litmus strip */}
      <section style={styles.section}>
        <div style={styles.sectionLabel}>LITMUS TEST</div>
        <div style={styles.litmusOuter}>
          {/* Fill bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${litmusProgress * 100}%`,
              backgroundColor: litmusColor,
              transition: 'width 0ms', // driven by rAF
            }}
          />
          {/* Label */}
          <span style={styles.litmusLabel}>
            {verifyState === 'idle' && 'AWAITING VERIFICATION'}
            {verifyState === 'checking' && 'CHECKING CONDITIONS...'}
            {verifyState === 'proven' && 'PROVEN ✓'}
            {verifyState === 'failed' && 'NOT PROVEN ✗'}
            {verifyState === 'decrypting' && 'DECRYPTING...'}
            {verifyState === 'decrypted' && 'DECRYPTED ✓'}
            {verifyState === 'error' && 'ERROR'}
          </span>
        </div>

        {(isConnected && verifyState === 'idle') || verifyState === 'error' ? (
          <button
            onClick={handleVerify}
            style={{ ...styles.btn, marginTop: '16px' }}
          >
            [ Verify & Decrypt ]
          </button>
        ) : verifyState === 'checking' || verifyState === 'decrypting' ? (
          <div style={{ color: '#666', fontFamily: 'monospace', fontSize: '12px', marginTop: '16px' }}>
            {verifyState === 'checking' ? 'Checking on-chain conditions...' : 'Requesting decryption from validators...'}
          </div>
        ) : null}
      </section>

      {/* Error */}
      {errorMsg && (
        <div style={{ color: '#CC0000', fontSize: '12px', fontFamily: 'monospace', paddingLeft: '16px' }}>
          ERROR: {errorMsg}
        </div>
      )}

      {/* Fail state — show requirements */}
      {verifyState === 'failed' && (
        <section style={{ ...styles.section, borderLeftColor: '#CC0000' }}>
          <div style={{ ...styles.sectionLabel, color: '#CC0000' }}>CONDITIONS NOT MET</div>
          <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ccc', lineHeight: 1.8, margin: 0 }}>
            Your wallet did not pass the access conditions set by the publisher.
            <br />
            Check the conditions on the publish page and qualify before trying again.
          </p>
          <button onClick={handleVerify} style={{ ...styles.btnSmall, marginTop: '8px' }}>
            Retry
          </button>
        </section>
      )}

      {/* Decrypted content */}
      {verifyState === 'decrypted' && (
        <section style={{ ...styles.section, borderLeftColor: '#1A1AFF' }}>
          <div style={{ ...styles.sectionLabel, color: '#1A1AFF' }}>DECRYPTED CONTENT</div>
          <pre style={styles.contentBox}>{decryptedContent}</pre>
        </section>
      )}

      {!isDeployed && (
        <div style={{ color: '#666', fontSize: '11px', fontFamily: 'monospace', paddingLeft: '16px' }}>
          ⚠ Contracts not yet deployed. Run <code>DEPLOYER_PRIVATE_KEY=0x... bash contracts/deploy.sh</code>
        </div>
      )}
    </main>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#000',
    color: '#fff',
    fontFamily: 'monospace',
    padding: '48px 24px',
    maxWidth: '800px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  back: {
    color: '#fff',
    textDecoration: 'none',
    fontSize: '12px',
    letterSpacing: '0.05em',
  },
  title: {
    fontSize: '32px',
    fontWeight: 900,
    margin: 0,
    fontFamily: 'monospace',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderLeft: '2px solid #333',
    paddingLeft: '16px',
  },
  sectionLabel: {
    fontSize: '10px',
    color: '#666',
    letterSpacing: '0.15em',
    marginBottom: '4px',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#ccc',
  },
  input: {
    backgroundColor: '#000',
    color: '#fff',
    border: '1px solid #333',
    fontFamily: 'monospace',
    fontSize: '13px',
    padding: '10px 12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  litmusOuter: {
    position: 'relative' as const,
    width: '100%',
    height: '48px',
    border: '1px solid #333',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  litmusLabel: {
    position: 'relative' as const,
    zIndex: 1,
    fontFamily: 'monospace',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#fff',
    mixBlendMode: 'difference' as const,
  },
  btn: {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 700,
    padding: '12px 24px',
    border: '2px solid #fff',
    color: '#fff',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    letterSpacing: '0.05em',
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
  contentBox: {
    fontFamily: 'monospace',
    fontSize: '13px',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    color: '#e0e0e0',
    margin: 0,
    borderTop: '1px solid #222',
    paddingTop: '12px',
  },
}
