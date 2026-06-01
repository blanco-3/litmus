import Link from 'next/link'

function TestTube({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left'
  const colorRgb = isLeft ? '26,26,255' : '204,0,0'
  const id = isLeft ? 'L' : 'R'
  const floatAnim = isLeft
    ? 'tubeFloatLeft 5s ease-in-out infinite'
    : 'tubeFloatRight 5s ease-in-out infinite 0.7s'
  const waveAnim = `waveShift ${isLeft ? '2.8' : '3.4'}s linear infinite`

  // Inner tube silhouette — straight sides, proper semicircular bottom
  const tubeInner = 'M11,18 L11,202 Q11,244 36,244 Q61,244 61,202 L61,18 Z'

  return (
    <div style={{ width: 72, height: 260, animation: floatAnim, position: 'relative' }}>
      <svg viewBox="0 0 72 260" width={72} height={260} style={{ overflow: 'visible' }}>
        <defs>
          {/* Clip path constrains liquid + glow to tube interior */}
          <clipPath id={`tube${id}`}>
            <path d={tubeInner} />
          </clipPath>

          {/* Glass material: bright left edge, dark center, slight right edge */}
          <linearGradient id={`glassGrad${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.22)" />
            <stop offset="18%"  stopColor="rgba(255,255,255,0.04)" />
            <stop offset="75%"  stopColor="rgba(255,255,255,0.01)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.09)" />
          </linearGradient>

          {/* Liquid: lighter at top (meniscus area), deeper at bottom */}
          <linearGradient id={`liqGrad${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={`rgba(${colorRgb},0.48)`} />
            <stop offset="100%" stopColor={`rgba(${colorRgb},0.92)`} />
          </linearGradient>

          {/* Soft glow for bottom-of-tube inner light */}
          <filter id={`glow${id}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* ── Cap: narrow neck + wider collar ── */}
        <rect x="20" y="0" width="32" height="9" rx="3"
          fill="rgba(255,255,255,0.10)"
          stroke="rgba(255,255,255,0.24)" strokeWidth="1.5" />
        <rect x="11" y="7" width="50" height="12" rx="2"
          fill="rgba(255,255,255,0.06)"
          stroke="rgba(255,255,255,0.18)" strokeWidth="1" />

        {/* ── Liquid fill (clipped inside tube) ── */}
        <g clipPath={`url(#tube${id})`}>
          {/* Main liquid body */}
          <rect x="0" y="120" width="72" height="130" fill={`url(#liqGrad${id})`} />

          {/* Animated wave at surface — sin-curve path that slides left */}
          <path
            d="M-72,120 Q-54,110 -36,120 Q-18,130 0,120 Q18,110 36,120 Q54,130 72,120 Q90,110 108,120 Q126,130 144,120 L144,260 L-72,260 Z"
            fill={`rgba(${colorRgb},0.55)`}
            style={{ animation: waveAnim }}
          />

          {/* Inner bottom glow (gives sense of luminous depth) */}
          <ellipse cx="36" cy="236" rx="18" ry="5"
            fill={`rgba(${colorRgb},0.55)`}
            filter={`url(#glow${id})`} />

          {/* Bubbles rising */}
          {([
            { cx: 22, delay: '0s',   r: 2.8 },
            { cx: 50, delay: '1.5s', r: 1.8 },
            { cx: 35, delay: '2.9s', r: 2.3 },
          ] as const).map((b, i) => (
            <circle key={i} cx={b.cx} cy="232" r={b.r}
              fill="rgba(255,255,255,0.55)"
              style={{ animation: `bubbleRise 2.8s ease-in infinite ${b.delay}` }}
            />
          ))}
        </g>

        {/* ── Glass tube outline drawn on top of liquid ── */}
        <path
          d={tubeInner}
          fill={`url(#glassGrad${id})`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="1.5"
        />

        {/* Left glass highlight — thick soft strip */}
        <path
          d="M17,22 Q15,120 18,200 Q21,230 27,239"
          fill="none"
          stroke="rgba(255,255,255,0.20)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* Thin bright edge line */}
        <path
          d="M14,22 L14,200"
          fill="none"
          stroke="rgba(255,255,255,0.11)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Meniscus highlight at liquid surface (moves with liquidMove) */}
        <ellipse cx="36" cy="120" rx="22" ry="3.5"
          fill="rgba(255,255,255,0.28)"
          clipPath={`url(#tube${id})`}
          style={{ animation: `liquidMove 3.2s ease-in-out infinite${isLeft ? '' : ' 0.9s'}` }}
        />
      </svg>

      {/* External bottom glow (outside SVG) */}
      <div style={{
        position: 'absolute',
        bottom: -14,
        left: '18%',
        right: '18%',
        height: 22,
        background: `rgba(${colorRgb},0.30)`,
        filter: 'blur(14px)',
        borderRadius: '50%',
      }} />
    </div>
  )
}

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
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background test tubes */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 6%',
      }}>
        <TestTube side="left" />
        <TestTube side="right" />
      </div>

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '48px',
      }}>
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
            <span style={{ color: '#1A1AFF' }}>LIT</span>
            <span style={{ color: '#CC0000' }}>MUS</span>
          </h1>
          <p style={{ fontSize: '16px', margin: 0, color: '#fff', letterSpacing: '0.05em' }}>
            Prove you qualify. Read what others can&apos;t.
          </p>
          <p style={{ fontSize: '12px', margin: 0, color: '#666' }}>
            Prove-to-Read · Powered by CDR · Story Testnet
          </p>
        </div>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/board" style={{ ...btnStyle, backgroundColor: '#fff', color: '#000' }}>
            [ Browse Board ]
          </Link>
          <Link href="/publish" style={btnStyle}>
            [ Publish Content ]
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
      </div>
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
