import Link from 'next/link'

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        backgroundColor: '#000',
        color: '#fff',
        fontFamily: 'monospace',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        gap: '48px',
      }}
    >
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h1
          style={{
            fontSize: '72px',
            fontWeight: 900,
            letterSpacing: '0.1em',
            margin: 0,
            fontFamily: 'monospace',
          }}
        >
          LITMUS
        </h1>
        <p style={{ fontSize: '16px', margin: 0, color: '#fff', letterSpacing: '0.05em' }}>
          Prove you qualify. Read what others can&apos;t.
        </p>
        <p style={{ fontSize: '12px', margin: 0, color: '#666' }}>
          Prove-to-Read · Powered by CDR · Story Testnet
        </p>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/publish" style={btnStyle}>
          [ Publish Content ]
        </Link>
        <Link href="/read" style={{ ...btnStyle, backgroundColor: '#fff', color: '#000' }}>
          [ Read Content ]
        </Link>
      </div>

      <div
        style={{
          width: '320px',
          height: '2px',
          background: 'linear-gradient(to right, #1A1AFF 50%, #CC0000 50%)',
        }}
      />

      <p style={{ fontSize: '11px', color: '#444', textAlign: 'center', maxWidth: '480px', lineHeight: 1.6 }}>
        Gate your content behind on-chain conditions — token holdings, NFT ownership,
        transaction history, IP licenses. Not a paywall. A proof wall.
      </p>
    </main>
  )
}

const btnStyle: React.CSSProperties = {
  display: 'inline-block',
  fontFamily: 'monospace',
  fontSize: '14px',
  fontWeight: 700,
  padding: '16px 32px',
  border: '2px solid #fff',
  color: '#fff',
  backgroundColor: 'transparent',
  textDecoration: 'none',
  letterSpacing: '0.05em',
  cursor: 'pointer',
}
