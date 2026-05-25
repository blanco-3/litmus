'use client'

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, usePublicClient, useWalletClient } from 'wagmi'
import {
  CONDITION_PARAMS,
  conditionLabel,
  encodeConditionData,
  encodeMultiCondition,
  type ConditionType,
} from '@/lib/conditions'
import { ensureWasm, createCDRClient, encryptContent, generateDataKey } from '@/lib/cdr'
import { conditions as cdrConditions } from '@piplabs/cdr-sdk'
import type { Hex } from 'viem'
import addresses from '../../../deployments/addresses.json'

// ── Types ──────────────────────────────────────────────────────────────────

interface ConditionEntry {
  id: number
  type: ConditionType
  params: Record<string, string>
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function PublishPage() {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [content, setContent] = useState('')
  const [conditionEntries, setConditionEntries] = useState<ConditionEntry[]>([
    { id: 0, type: 'TokenBalance', params: {} },
  ])
  const [operators, setOperators] = useState<boolean[]>([]) // isAnd between entries
  const [status, setStatus] = useState<'idle' | 'encrypting' | 'uploading' | 'done' | 'error'>('idle')
  const [resultUuid, setResultUuid] = useState<number | null>(null)
  const [resultEncrypted, setResultEncrypted] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // ── Condition builder helpers ─────────────────────────────────────────────

  const addCondition = () => {
    const newId = Date.now()
    setConditionEntries((prev) => [...prev, { id: newId, type: 'TokenBalance', params: {} }])
    setOperators((prev) => [...prev, true]) // default AND
  }

  const removeCondition = (idx: number) => {
    setConditionEntries((prev) => prev.filter((_, i) => i !== idx))
    setOperators((prev) => {
      const next = [...prev]
      if (idx === 0 && next.length > 0) next.shift()
      else if (idx > 0) next.splice(idx - 1, 1)
      return next
    })
  }

  const updateType = (idx: number, type: ConditionType) => {
    setConditionEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, type, params: {} } : e))
    )
  }

  const updateParam = (idx: number, name: string, value: string) => {
    setConditionEntries((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, params: { ...e.params, [name]: value } } : e))
    )
  }

  const toggleOperator = (idx: number) => {
    setOperators((prev) => prev.map((v, i) => (i === idx ? !v : v)))
  }

  // ── Preview string ────────────────────────────────────────────────────────

  const preview = conditionEntries
    .map((e, i) => {
      const label = conditionLabel(e.type, e.params)
      if (i === 0) return label
      return `${operators[i - 1] ? 'AND' : 'OR'} ${label}`
    })
    .join('\n')

  // ── Get condition address from deployed contracts ─────────────────────────

  function getConditionAddress(type: ConditionType): Hex {
    const map: Record<ConditionType, keyof typeof addresses.contracts> = {
      TokenBalance: 'TokenBalanceCondition',
      NFTHolder: 'NFTHolderCondition',
      NativeBalance: 'NativeBalanceCondition',
      TxCount: 'TxCountCondition',
      ContractCallCount: 'ContractCallCountCondition',
      FirstTxBefore: 'FirstTxBeforeCondition',
      MultiCondition: 'MultiCondition',
      TimeLocked: 'TimeLockedCondition',
      StoryIPLicense: 'StoryIPLicenseCondition',
    }
    const addr = addresses.contracts[map[type]]
    if (!addr) throw new Error(`Contract ${type} not deployed yet. Run contracts/deploy.sh first.`)
    return addr as Hex
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!content.trim()) return setErrorMsg('Content is empty.')
    if (!publicClient || !walletClient) return setErrorMsg('Wallet not connected.')
    setErrorMsg('')
    setStatus('encrypting')

    try {
      await ensureWasm()

      // 1. Generate data key and encrypt content
      const dataKey = generateDataKey()
      const encryptedData = await encryptContent(content, dataKey)

      // 2. Build final read condition (MultiCondition if >1 entry, direct if =1)
      let readConditionAddr: Hex
      let readConditionData: Hex

      if (conditionEntries.length === 1) {
        readConditionAddr = getConditionAddress(conditionEntries[0].type)
        readConditionData = encodeConditionData(conditionEntries[0].type, conditionEntries[0].params)
      } else {
        const encoded = conditionEntries.map((e) => ({
          address: getConditionAddress(e.type),
          conditionData: encodeConditionData(e.type, e.params),
        }))
        readConditionAddr = getConditionAddress('MultiCondition')
        readConditionData = encodeMultiCondition(encoded, operators)
      }

      // 3. Write condition = OpenWriteCondition (vault is write-once, updatable=false)
      const openWriteAddr = addresses.contracts.OpenWriteCondition as Hex
      if (!openWriteAddr) throw new Error('OpenWriteCondition not deployed yet. Run contracts/deploy.sh first.')
      const writeCondition = cdrConditions.open({ address: openWriteAddr })

      // 4. Upload to CDR
      setStatus('uploading')
      const client = createCDRClient(publicClient, walletClient)

      const { uuid } = await client.uploader.uploadCDR({
        dataKey,
        updatable: false,
        writeConditionAddr: writeCondition.address,
        readConditionAddr,
        writeConditionData: writeCondition.conditionData,
        readConditionData,
        accessAuxData: '0x',
      })

      setResultUuid(uuid)
      setResultEncrypted(encryptedData)
      setStatus('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setStatus('error')
    }
  }

  const shareUrl =
    resultUuid !== null && typeof window !== 'undefined'
      ? `${window.location.origin}/read?uuid=${resultUuid}&data=${resultEncrypted}`
      : ''

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main style={styles.page}>
      <a href="/" style={styles.back}>← LITMUS</a>

      <h1 style={styles.title}>[ Publish ]</h1>

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

      {isConnected && (
        <>
          {/* Content */}
          <section style={styles.section}>
            <div style={styles.sectionLabel}>CONTENT (markdown)</div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your gated content here..."
              style={styles.textarea}
            />
          </section>

          {/* Condition Builder */}
          <section style={styles.section}>
            <div style={styles.sectionLabel}>ACCESS CONDITIONS</div>

            {conditionEntries.map((entry, idx) => (
              <div key={entry.id}>
                {/* AND/OR toggle between entries */}
                {idx > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0' }}>
                    <button
                      onClick={() => toggleOperator(idx - 1)}
                      style={{
                        ...styles.btnSmall,
                        backgroundColor: operators[idx - 1] ? '#fff' : 'transparent',
                        color: operators[idx - 1] ? '#000' : '#fff',
                        minWidth: '64px',
                      }}
                    >
                      {operators[idx - 1] ? 'AND' : 'OR'}
                    </button>
                  </div>
                )}

                <div style={styles.conditionRow}>
                  {/* Type selector */}
                  <select
                    value={entry.type}
                    onChange={(e) => updateType(idx, e.target.value as ConditionType)}
                    style={styles.select}
                  >
                    {(Object.keys(CONDITION_PARAMS) as ConditionType[]).filter(t => t !== 'MultiCondition').map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  {/* Dynamic params */}
                  {CONDITION_PARAMS[entry.type].map((param) => (
                    <input
                      key={param.name}
                      type="text"
                      placeholder={`${param.label} (${param.placeholder})`}
                      value={entry.params[param.name] ?? ''}
                      onChange={(e) => updateParam(idx, param.name, e.target.value)}
                      style={styles.input}
                    />
                  ))}

                  {conditionEntries.length > 1 && (
                    <button onClick={() => removeCondition(idx)} style={styles.btnSmall}>✕</button>
                  )}
                </div>
              </div>
            ))}

            <button onClick={addCondition} style={{ ...styles.btnSmall, marginTop: '8px' }}>
              + Add condition
            </button>

            {/* Preview */}
            <div style={styles.preview}>
              <div style={{ color: '#666', fontSize: '11px', marginBottom: '8px' }}>CONDITION PREVIEW</div>
              <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{preview}</pre>
            </div>
          </section>

          {/* Upload */}
          <section style={styles.section}>
            {status !== 'done' ? (
              <button
                onClick={handleUpload}
                disabled={status === 'encrypting' || status === 'uploading'}
                style={{ ...styles.btn, opacity: status !== 'idle' && status !== 'error' ? 0.6 : 1 }}
              >
                {status === 'encrypting' && '[ Encrypting... ]'}
                {status === 'uploading' && '[ Uploading to CDR... ]'}
                {(status === 'idle' || status === 'error') && '[ Encrypt & Upload ]'}
              </button>
            ) : (
              <div style={styles.success}>
                <div style={{ color: '#1A1AFF', marginBottom: '16px' }}>✓ PUBLISHED — UUID: {resultUuid}</div>
                <div style={styles.sectionLabel}>SHARE LINK</div>
                <div style={{ ...styles.mono, wordBreak: 'break-all', fontSize: '11px' }}>{shareUrl}</div>
                <button
                  onClick={() => navigator.clipboard.writeText(shareUrl)}
                  style={{ ...styles.btnSmall, marginTop: '8px' }}
                >
                  Copy link
                </button>
              </div>
            )}

            {errorMsg && (
              <div style={{ color: '#CC0000', fontSize: '12px', marginTop: '8px', fontFamily: 'monospace' }}>
                ERROR: {errorMsg}
              </div>
            )}
          </section>
        </>
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
  textarea: {
    width: '100%',
    minHeight: '160px',
    backgroundColor: '#000',
    color: '#fff',
    border: '1px solid #333',
    fontFamily: 'monospace',
    fontSize: '13px',
    padding: '12px',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  },
  conditionRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  select: {
    backgroundColor: '#000',
    color: '#fff',
    border: '1px solid #444',
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '6px 8px',
    outline: 'none',
    minWidth: '180px',
  },
  input: {
    backgroundColor: '#000',
    color: '#fff',
    border: '1px solid #333',
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '6px 8px',
    outline: 'none',
    flex: '1',
    minWidth: '160px',
  },
  preview: {
    marginTop: '16px',
    borderTop: '1px solid #222',
    paddingTop: '12px',
    color: '#fff',
    fontSize: '13px',
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
  success: {
    border: '1px solid #1A1AFF',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
}
