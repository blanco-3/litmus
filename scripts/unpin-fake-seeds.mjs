/**
 * Unpins fake seed board entries (UUIDs 9001–9005) from Pinata.
 * Run: node --env-file=.env.local scripts/unpin-fake-seeds.mjs
 */

const JWT = process.env.NEXT_PUBLIC_PINATA_JWT
if (!JWT) { console.error('Missing NEXT_PUBLIC_PINATA_JWT'); process.exit(1) }

const FAKE_UUIDS = new Set(['9001', '9002', '9003', '9004', '9005'])

// List all litmus pins
const filter = JSON.stringify({ litmus: { value: '1', op: 'eq' } })
const url = `https://api.pinata.cloud/data/pinList?metadata[keyvalues]=${encodeURIComponent(filter)}&pageLimit=100&status=pinned`

console.log('Fetching litmus pins...')
const res = await fetch(url, { headers: { Authorization: `Bearer ${JWT}` } })
if (!res.ok) { console.error(`pinList failed (${res.status})`); process.exit(1) }

const { rows } = await res.json()
console.log(`Found ${rows.length} total litmus pins.\n`)

const toUnpin = rows.filter(r => FAKE_UUIDS.has(r.metadata?.keyvalues?.uuid))
console.log(`Fake seeds to remove: ${toUnpin.length}`)

for (const row of toUnpin) {
  const cid = row.ipfs_pin_hash
  const uuid = row.metadata?.keyvalues?.uuid
  const title = row.metadata?.keyvalues?.title ?? '(untitled)'
  process.stdout.write(`  Unpinning UUID ${uuid} "${title}" (${cid})... `)
  const del = await fetch(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${JWT}` },
  })
  console.log(del.ok ? 'OK' : `FAILED (${del.status})`)
}

console.log('\nDone.')
