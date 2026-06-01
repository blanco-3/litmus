'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ensureWasm, createCDRClient, LitmusStorageProvider, getPinataJwt, getVaultMeta, type VaultMeta } from '@/lib/cdr'
import { ALWAYS_TRUE_CONDITION, decodeHybridData } from '@/lib/conditions'
import { decodeAbiParameters, parseAbiParameters, formatEther } from 'viem'
import addresses from '../../../deployments/addresses.json'
import type { Hex } from 'viem'

type VerifyState = 'idle' | 'checking' | 'proven' | 'failed' | 'decrypting' | 'decrypted' | 'error'

const CDR_ADDR = '0xcccccc0000000000000000000000000000000005' as Hex

const VAULT_ABI = [
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

const CONDITION_ABI = [
  {
    name: 'checkReadCondition',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'uuid', type: 'uint32' },
      { name: 'conditionData', type: 'bytes' },
      { name: 'accessAuxData', type: 'bytes' },
      { name: 'reader', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export default function ReadContent() {
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const uuid = searchParams.get('uuid') ?? ''
  const [verifyState, setVerifyState] = useState<VerifyState>('idle')
  const [decryptedContent, setDecryptedContent] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [paymentInfo, setPaymentInfo] = useState<{ gateAddr: Hex; requiredWei: bigint } | null>(null)
  const [payState, setPayState] = useState<'idle' | 'paying' | 'paid'>('idle')
  const [litmusProgress, setLitmusProgress] = useState(0)
  const [litmusColor, setLitmusColor] = useState<'#1A1AFF' | '#CC0000' | '#444'>('#444')
  const [vaultMeta, setVaultMeta] = useState<VaultMeta | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [dots, setDots] = useState('')
  const animFrameRef = useRef<number | null>(null)
  const decryptTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dotsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Pre-fetched vault data — eliminates one RPC round-trip when verify is clicked
  const vaultCacheRef = useRef<{ readConditionAddr: Hex; readConditionData: Hex } | null>(null)
  // Pre-created CDR client — ready before verify is clicked
  const cdrClientRef = useRef<ReturnType<typeof createCDRClient> | null>(null)

  function animateLitmus(targetColor: '#1A1AFF' | '#CC0000') {
    setLitmusColor(targetColor)
    setLitmusProgress(0)
    let start: number | null = null

    function step(ts: number) {
      if (!start) start = ts
      const elapsed = ts - start
      const progress = Math.min(elapsed / 1200, 1)
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
      if (decryptTimerRef.current) clearInterval(decryptTimerRef.current)
      if (dotsTimerRef.current) clearInterval(dotsTimerRef.current)
    }
  }, [])

  // Pre-init WASM on mount so it's ready before the user clicks Verify
  useEffect(() => {
    ensureWasm().catch(() => {})
  }, [])

  // Pre-create CDR client when walletClient becomes available
  useEffect(() => {
    if (!publicClient || !walletClient) return
    cdrClientRef.current = createCDRClient(publicClient, walletClient)
  }, [publicClient, walletClient])

  // Pre-fetch vault struct so verify click skips the first RPC call
  useEffect(() => {
    if (!uuid || !publicClient) return
    publicClient.readContract({
      address: CDR_ADDR,
      abi: VAULT_ABI,
      functionName: 'vaults',
      args: [Number(uuid) as never],
    }).then((v) => {
      vaultCacheRef.current = v as { readConditionAddr: Hex; readConditionData: Hex }
    }).catch(() => {})
  }, [uuid, publicClient])

  // Load vault metadata from Pinata on mount
  useEffect(() => {
    if (!uuid) return
    try {
      const jwt = getPinataJwt()
      getVaultMeta(jwt, Number(uuid)).then(setVaultMeta).catch(() => {})
    } catch {
      // JWT not set — skip metadata
    }
  }, [uuid])

  const PAYMENT_GATE_PAY_ABI = [{
    name: 'pay', type: 'function', stateMutability: 'payable',
    inputs: [{ name: 'uuid', type: 'uint32' }], outputs: [],
  }] as const

  async function handlePay() {
    if (!walletClient || !publicClient || !paymentInfo || !uuid) return
    setPayState('paying')
    try {
      const hash = await walletClient.writeContract({
        address: paymentInfo.gateAddr,
        abi: PAYMENT_GATE_PAY_ABI,
        functionName: 'pay',
        args: [Number(uuid) as never],
        value: paymentInfo.requiredWei,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setPayState('paid')
      // Auto re-verify after payment confirmed
      setTimeout(() => handleVerify(), 300)
    } catch (err: unknown) {
      setPayState('idle')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleVerify() {
    if (!uuid.trim()) return setErrorMsg('Enter a UUID.')
    if (!publicClient || !walletClient || !address) return setErrorMsg('Connect your wallet first.')

    setErrorMsg('')
    setPaymentInfo(null)
    setPayState('idle')
    setVerifyState('checking')
    setLitmusProgress(0)
    setLitmusColor('#444')

    try {
      // ensureWasm() was already called on mount — this is a no-op if WASM is ready
      await ensureWasm()

      // 1. Use pre-fetched vault data or fall back to a live RPC call
      const vault = (vaultCacheRef.current ?? await publicClient.readContract({
        address: CDR_ADDR,
        abi: VAULT_ABI,
        functionName: 'vaults',
        args: [Number(uuid) as never],
      })) as {
        readConditionAddr: Hex
        readConditionData: Hex
      }

      // 2. Determine the real condition to check.
      //    Hybrid format: readConditionAddr = always-true contract,
      //    readConditionData = abi.encode(realConditionAddr, realConditionData).
      //    Fallback: old-format vault uses readConditionAddr directly.
      let conditionAddr = vault.readConditionAddr
      let conditionData = vault.readConditionData

      if (vault.readConditionAddr.toLowerCase() === ALWAYS_TRUE_CONDITION.toLowerCase()) {
        const decoded = decodeHybridData(vault.readConditionData)
        if (decoded) {
          conditionAddr = decoded.conditionAddr
          conditionData = decoded.conditionData
        }
      }

      // 3. Off-chain condition check for Litmus animation
      let canRead: boolean
      try {
        canRead = await publicClient.readContract({
          address: conditionAddr,
          abi: CONDITION_ABI,
          functionName: 'checkReadCondition',
          args: [Number(uuid), conditionData, '0x', address],
        }) as boolean
      } catch {
        // Old vault with incompatible condition contract interface — treat as not verified
        throw new Error(
          `This vault was published before the latest update and cannot be verified. ` +
          `Please publish a new vault at /publish — conditions will work correctly.`
        )
      }

      if (!canRead) {
        // Detect PaymentGate condition — show Pay button instead of generic failure
        const pgAddr = (addresses.contracts.PaymentGateCondition as string).toLowerCase()
        if (conditionAddr.toLowerCase() === pgAddr) {
          try {
            const [gateAddr, requiredWei] = decodeAbiParameters(
              parseAbiParameters('address, uint256'),
              conditionData
            )
            setPaymentInfo({ gateAddr: gateAddr as Hex, requiredWei: requiredWei as bigint })
          } catch { /* ignore */ }
        }
        setVerifyState('failed')
        animateLitmus('#CC0000')
        return
      }

      // Condition passed — animate blue, then decrypt
      setVerifyState('proven')
      animateLitmus('#1A1AFF')

      await new Promise((r) => setTimeout(r, 300))
      setVerifyState('decrypting')
      setElapsedSec(0)
      setDots('')
      decryptTimerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000)
      dotsTimerRef.current = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 400)

      // 3. Download + decrypt via CDR SDK (validators provide the data key)
      const pinataJwt = getPinataJwt()
      const storageProvider = new LitmusStorageProvider(pinataJwt)
      const client = cdrClientRef.current ?? createCDRClient(publicClient, walletClient)

      const { content } = await client.consumer.downloadFile({
        uuid: Number(uuid),
        accessAuxData: '0x',
        storageProvider,
        timeoutMs: 120_000,
      })

      if (decryptTimerRef.current) { clearInterval(decryptTimerRef.current); decryptTimerRef.current = null }
      if (dotsTimerRef.current) { clearInterval(dotsTimerRef.current); dotsTimerRef.current = null }
      setDecryptedContent(new TextDecoder().decode(content))
      setVerifyState('decrypted')
    } catch (err: unknown) {
      if (decryptTimerRef.current) { clearInterval(decryptTimerRef.current); decryptTimerRef.current = null }
      if (dotsTimerRef.current) { clearInterval(dotsTimerRef.current); dotsTimerRef.current = null }
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setVerifyState('error')
      animateLitmus('#CC0000')
    }
  }

  const canVerify = isConnected && uuid.trim().length > 0

  // No UUID in URL → redirect to board
  if (!uuid) {
    return (
      <main style={styles.page}>
        <a href="/board" style={styles.back}>← LITMUS</a>
        <h1 style={styles.title}>[ Read ]</h1>
        <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#555', margin: 0 }}>
          No content selected.{' '}
          <a href="/board" style={{ color: '#fff' }}>Browse the board →</a>
        </p>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <a href="/board" style={styles.back}>← Board</a>
      <h1 style={styles.title}>[ Read ]</h1>

      {/* Vault info */}
      <section style={styles.section}>
        <div style={styles.sectionLabel}>VAULT #{uuid}</div>
        {vaultMeta ? (
          <>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
              {vaultMeta.title}
            </div>
            {vaultMeta.conditionPreview && (
              <div style={{
                borderLeft: `2px solid ${vaultMeta.conditionPreview.toLowerCase().startsWith('pay ') ? '#F0A800' : '#1A1AFF'}`,
                paddingLeft: '10px',
                marginTop: '4px',
              }}>
                <div style={{
                  fontSize: '9px',
                  color: vaultMeta.conditionPreview.toLowerCase().startsWith('pay ') ? '#F0A800' : '#1A1AFF',
                  letterSpacing: '0.15em',
                  marginBottom: '4px',
                }}>
                  {vaultMeta.conditionPreview.toLowerCase().startsWith('pay ') ? 'PAID ACCESS' : 'ACCESS CONDITION'}
                </div>
                <pre style={{ margin: 0, fontSize: '11px', color: '#888', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {vaultMeta.conditionPreview}
                </pre>
              </div>
            )}
            {vaultMeta.createdAt > 0 && (
              <div style={{ fontSize: '10px', color: '#444' }}>
                {new Date(vaultMeta.createdAt).toLocaleDateString('en-CA')}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '13px', color: '#555' }}>UUID {uuid}</div>
        )}
      </section>

      {/* Litmus strip */}
      <section style={styles.section}>
        <div style={styles.sectionLabel}>LITMUS TEST</div>
        <div style={styles.litmusOuter}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${litmusProgress * 100}%`,
              backgroundColor: litmusColor,
              transition: 'width 0ms',
            }}
          />
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

        {(verifyState === 'idle' || verifyState === 'error') && canVerify ? (
          <button onClick={handleVerify} style={{ ...styles.btn, marginTop: '16px' }}>
            [ Verify & Decrypt ]
          </button>
        ) : (verifyState === 'idle' || verifyState === 'error') && !canVerify ? (
          <div style={{ color: '#444', fontFamily: 'monospace', fontSize: '12px', marginTop: '16px' }}>
            Connect wallet to verify.
          </div>
        ) : verifyState === 'checking' ? (
          <div style={{ color: '#666', fontFamily: 'monospace', fontSize: '12px', marginTop: '16px' }}>
            Checking on-chain conditions...
          </div>
        ) : verifyState === 'decrypting' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <div style={{ fontFamily: 'monospace', fontSize: '13px', color: '#1A1AFF', letterSpacing: '0.08em' }}>
              Collecting validator partial decryptions{dots}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#555', lineHeight: 1.8 }}>
              {elapsedSec}s elapsed · Threshold decryption in progress<br />
              Validators are independently verifying your access and providing decryption shares.<br />
              This typically takes 15–40 seconds. Please wait.
            </div>
            <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
              {[0,1,2,3,4,5,6,7].map((i) => (
                <div
                  key={i}
                  style={{
                    width: '6px',
                    height: '6px',
                    backgroundColor: '#1A1AFF',
                    opacity: ((elapsedSec + i) % 8 === 0) ? 1 : 0.15,
                    transition: 'opacity 0.3s',
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Error */}
      {errorMsg && (
        <div style={{ color: '#CC0000', fontSize: '12px', fontFamily: 'monospace', paddingLeft: '16px' }}>
          ERROR: {errorMsg}
        </div>
      )}

      {/* Failed state */}
      {verifyState === 'failed' && (
        <section style={{ ...styles.section, borderLeftColor: '#CC0000' }}>
          <div style={{ ...styles.sectionLabel, color: '#CC0000' }}>CONDITIONS NOT MET</div>
          {paymentInfo ? (
            <>
              <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ccc', lineHeight: 1.8, margin: 0 }}>
                This article requires a payment of{' '}
                <strong style={{ color: '#fff' }}>{formatEther(paymentInfo.requiredWei)} IP</strong>{' '}
                to unlock. Payment goes directly to the publisher.
              </p>
              <button
                onClick={handlePay}
                disabled={payState === 'paying' || payState === 'paid'}
                style={{ ...styles.btnSmall, marginTop: '12px', borderColor: '#F0A800', color: '#F0A800' }}
              >
                {payState === 'paying' ? '[ sending... ]' : payState === 'paid' ? '[ paid — verifying... ]' : `[ Pay ${formatEther(paymentInfo.requiredWei)} IP ]`}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#ccc', lineHeight: 1.8, margin: 0 }}>
                Your wallet did not pass the access conditions set by the publisher.
              </p>
              <button onClick={handleVerify} style={{ ...styles.btnSmall, marginTop: '8px' }}>
                Retry
              </button>
            </>
          )}
        </section>
      )}

      {/* Decrypted content — rendered as markdown */}
      {verifyState === 'decrypted' && (
        <section style={{ ...styles.section, borderLeftColor: '#1A1AFF' }}>
          <div style={{ ...styles.sectionLabel, color: '#1A1AFF' }}>DECRYPTED CONTENT</div>
          <div style={styles.contentBox}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{decryptedContent}</ReactMarkdown>
          </div>
        </section>
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
  back: { color: '#fff', textDecoration: 'none', fontSize: '12px', letterSpacing: '0.05em' },
  title: { fontSize: '32px', fontWeight: 900, margin: 0, fontFamily: 'monospace' },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderLeft: '2px solid #333',
    paddingLeft: '16px',
  },
  sectionLabel: { fontSize: '10px', color: '#666', letterSpacing: '0.15em', marginBottom: '4px' },
  mono: { fontFamily: 'monospace', fontSize: '12px', color: '#ccc' },
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
    color: '#e0e0e0',
    borderTop: '1px solid #222',
    paddingTop: '12px',
  },
}
