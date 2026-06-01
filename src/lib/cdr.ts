'use client'

import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import type { StorageProvider } from '@piplabs/cdr-sdk'
import type { PublicClient, WalletClient } from 'viem'

const STORY_API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'http://172.192.41.96:1317'

let wasmInitialized = false

export async function ensureWasm() {
  if (!wasmInitialized) {
    await initWasm()
    wasmInitialized = true
  }
}

export function createCDRClient(publicClient: PublicClient, walletClient?: WalletClient): CDRClient {
  return new CDRClient({
    network: 'testnet',
    publicClient,
    walletClient,
    apiUrl: STORY_API_URL,
  })
}

// ── Storage provider backed by Pinata IPFS ──────────────────────────────────
// Requires NEXT_PUBLIC_PINATA_JWT env variable.
// Get a free JWT at https://app.pinata.cloud → API Keys.

export class LitmusStorageProvider implements StorageProvider {
  private readonly jwt: string

  constructor(jwt: string) {
    this.jwt = jwt
  }

  async upload(data: Uint8Array): Promise<string> {
    const form = new FormData()
    form.append(
      'file',
      new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' }),
      'content.bin',
    )
    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.jwt}` },
      body: form,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Pinata upload failed (${res.status}): ${text}`)
    }
    const { IpfsHash } = await res.json()
    return IpfsHash as string
  }

  async download(cid: string): Promise<Uint8Array> {
    // Try Pinata gateway first, fall back to public gateway
    const urls = [
      `https://gateway.pinata.cloud/ipfs/${cid}`,
      `https://ipfs.io/ipfs/${cid}`,
    ]
    for (const url of urls) {
      try {
        const res = await fetch(url)
        if (res.ok) return new Uint8Array(await res.arrayBuffer())
      } catch {
        // try next
      }
    }
    throw new Error(`IPFS download failed for CID: ${cid}`)
  }
}

export function getPinataJwt(): string {
  const jwt = process.env.NEXT_PUBLIC_PINATA_JWT
  if (!jwt) throw new Error('NEXT_PUBLIC_PINATA_JWT is not set. See .env.local.example.')
  return jwt
}

// ── Board metadata (public, stored as Pinata JSON pins) ─────────────────────

export interface VaultMeta {
  uuid: number
  title: string
  conditionPreview: string
  createdAt: number
}

export async function publishMetadata(jwt: string, meta: VaultMeta): Promise<void> {
  const body = {
    pinataContent: meta,
    pinataMetadata: {
      name: `litmus-meta-${meta.uuid}`,
      keyvalues: {
        litmus: '1',
        uuid: String(meta.uuid),
        title: meta.title.slice(0, 200),
        conditionPreview: meta.conditionPreview.slice(0, 500),
        createdAt: String(meta.createdAt),
      },
    },
  }
  const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Pinata metadata upload failed (${res.status}): ${text}`)
  }
}

export async function getVaultMeta(jwt: string, uuid: number): Promise<VaultMeta | null> {
  const filter = JSON.stringify({ uuid: { value: String(uuid), op: 'eq' }, litmus: { value: '1', op: 'eq' } })
  const url = `https://api.pinata.cloud/data/pinList?metadata[keyvalues]=${encodeURIComponent(filter)}&pageLimit=1&status=pinned`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } })
  if (!res.ok) return null
  const { rows } = await res.json() as { rows: Array<{ metadata: { keyvalues: Record<string, string> } }> }
  if (!rows.length) return null
  const kv = rows[0].metadata.keyvalues
  return {
    uuid: Number(kv.uuid),
    title: kv.title ?? '(untitled)',
    conditionPreview: kv.conditionPreview ?? '',
    createdAt: Number(kv.createdAt ?? 0),
  }
}

export async function listPublishedContent(jwt: string): Promise<VaultMeta[]> {
  const filter = JSON.stringify({ litmus: { value: '1', op: 'eq' } })
  const url = `https://api.pinata.cloud/data/pinList?metadata[keyvalues]=${encodeURIComponent(filter)}&pageLimit=100&status=pinned`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${jwt}` } })
  if (!res.ok) throw new Error(`Pinata list failed (${res.status})`)
  const { rows } = await res.json() as { rows: Array<{ metadata: { keyvalues: Record<string, string> } }> }
  return rows
    .map((row) => ({
      uuid: Number(row.metadata.keyvalues.uuid),
      title: row.metadata.keyvalues.title ?? '(untitled)',
      conditionPreview: row.metadata.keyvalues.conditionPreview ?? '',
      createdAt: Number(row.metadata.keyvalues.createdAt ?? 0),
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}
