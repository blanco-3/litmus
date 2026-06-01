'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPinataJwt, listPublishedContent, type VaultMeta } from '@/lib/cdr'

export default function BoardPage() {
  const [vaults, setVaults] = useState<VaultMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const jwt = getPinataJwt()
        const list = await listPublishedContent(jwt)
        setVaults(list)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <main style={styles.page}>
      <a href="/" style={styles.back}>← LITMUS</a>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={styles.title}>[ Board ]</h1>
        <Link href="/publish" style={styles.publishBtn}>+ Publish</Link>
      </div>

      {loading && (
        <p style={styles.dim}>Loading...</p>
      )}

      {error && (
        <p style={{ color: '#CC0000', fontFamily: 'monospace', fontSize: '12px' }}>ERROR: {error}</p>
      )}

      {!loading && !error && vaults.length === 0 && (
        <div style={styles.empty}>
          <p style={styles.dim}>No content published yet.</p>
          <Link href="/publish" style={styles.emptyLink}>Be the first to publish →</Link>
        </div>
      )}

      <div style={styles.grid}>
        {vaults.map((v) => (
          <VaultCard key={v.uuid} vault={v} />
        ))}
      </div>
    </main>
  )
}

function VaultCard({ vault }: { vault: VaultMeta }) {
  const date = vault.createdAt
    ? new Date(vault.createdAt).toLocaleDateString('en-CA') // YYYY-MM-DD
    : ''

  return (
    <article style={styles.card}>
      <div style={styles.cardTop}>
        <span style={styles.uuid}>#{vault.uuid}</span>
        <span style={styles.date}>{date}</span>
      </div>

      <h2 style={styles.cardTitle}>{vault.title}</h2>

      {vault.conditionPreview && (
        <div style={styles.conditionBox}>
          <div style={styles.conditionLabel}>ACCESS CONDITION</div>
          <pre style={styles.conditionText}>{vault.conditionPreview}</pre>
        </div>
      )}

      <div style={styles.cardFooter}>
        <div style={styles.lockBadge}>🔒 GATED</div>
        <Link href={`/read?uuid=${vault.uuid}`} style={styles.readBtn}>
          [ Verify & Read ]
        </Link>
      </div>
    </article>
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
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  back: { color: '#666', textDecoration: 'none', fontSize: '12px', letterSpacing: '0.05em' },
  title: { fontSize: '32px', fontWeight: 900, margin: 0, fontFamily: 'monospace' },
  publishBtn: {
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 700,
    padding: '6px 14px',
    border: '1px solid #fff',
    color: '#fff',
    textDecoration: 'none',
    letterSpacing: '0.05em',
  },
  dim: { color: '#555', fontFamily: 'monospace', fontSize: '13px', margin: 0 },
  empty: { display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'flex-start' },
  emptyLink: { color: '#fff', fontFamily: 'monospace', fontSize: '13px' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
  },
  card: {
    border: '1px solid #222',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    backgroundColor: '#050505',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  uuid: { fontSize: '10px', color: '#444', fontFamily: 'monospace' },
  date: { fontSize: '10px', color: '#444', fontFamily: 'monospace' },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 700,
    margin: 0,
    fontFamily: 'monospace',
    color: '#fff',
    lineHeight: 1.4,
  },
  conditionBox: {
    borderLeft: '2px solid #1A1AFF',
    paddingLeft: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  conditionLabel: { fontSize: '9px', color: '#1A1AFF', letterSpacing: '0.15em' },
  conditionText: {
    margin: 0,
    fontSize: '11px',
    color: '#888',
    whiteSpace: 'pre-wrap',
    lineHeight: 1.6,
    fontFamily: 'monospace',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '4px',
    borderTop: '1px solid #111',
    paddingTop: '12px',
  },
  lockBadge: {
    fontSize: '10px',
    color: '#444',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
  },
  readBtn: {
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 700,
    padding: '6px 14px',
    border: '1px solid #333',
    color: '#fff',
    textDecoration: 'none',
    letterSpacing: '0.05em',
  },
}
