/**
 * Seed script — uploads test vault metadata to Pinata so the board page is populated.
 * Does NOT create real CDR vaults; clicking "Verify & Read" on seeded entries will
 * show a contract-read error (expected for fake UUIDs).
 *
 * Run:  node --env-file=.env.local scripts/seed-board.mjs
 */

const JWT = process.env.NEXT_PUBLIC_PINATA_JWT
if (!JWT) { console.error('NEXT_PUBLIC_PINATA_JWT not set'); process.exit(1) }

const POSTS = [
  {
    uuid: 9001,
    title: 'The Hidden Alpha: DeFi Strategies That Actually Work',
    conditionPreview: 'Hold ≥ 1000000000000000000 wei of token 0xF1815bd50389c46847f0Bda824eC8da914045D14...',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago
  },
  {
    uuid: 9002,
    title: 'Story Protocol Deep Dive: IP Licensing Mechanics',
    conditionPreview: 'Holds Story IP license (any)',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2, // 2 days ago
  },
  {
    uuid: 9003,
    title: 'OG Members Only: Pre-Launch Notes from the Team',
    conditionPreview: 'First tx before 2025-03-01 (OG gate)',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 1, // 1 day ago
  },
  {
    uuid: 9004,
    title: 'NFT Collector\'s Vault: Unreleased Artwork & Lore',
    conditionPreview: 'Hold ≥ 1 NFT of 0xd516482bef63Ff19Ed40E4C6C2e626ccE04e1cE...\nAND Hold ≥ 1000000000000000000 wei IP',
    createdAt: Date.now() - 1000 * 60 * 60 * 6, // 6 hours ago
  },
  {
    uuid: 9005,
    title: 'Time-Locked Message: Opens June 2026',
    conditionPreview: 'Unlocks after 2026-06-01 (UTC)',
    createdAt: Date.now() - 1000 * 60 * 30, // 30 min ago
  },
]

async function pin(post) {
  const body = {
    pinataContent: post,
    pinataMetadata: {
      name: `litmus-meta-${post.uuid}`,
      keyvalues: {
        litmus: '1',
        uuid: String(post.uuid),
        title: post.title.slice(0, 200),
        conditionPreview: post.conditionPreview.slice(0, 500),
        createdAt: String(post.createdAt),
      },
    },
  }

  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${JWT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json = await res.json()
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`)
  return json.IpfsHash
}

for (const post of POSTS) {
  process.stdout.write(`Pinning #${post.uuid} "${post.title}"... `)
  try {
    const cid = await pin(post)
    console.log(`✓ ${cid}`)
  } catch (err) {
    console.log(`✗ ${err.message}`)
  }
}

console.log('\nDone. Open /board to see the results.')
