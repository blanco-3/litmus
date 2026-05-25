'use client'

import { CDRClient, initWasm } from '@piplabs/cdr-sdk'
import type { PublicClient, WalletClient } from 'viem'

const STORY_API_URL = process.env.NEXT_PUBLIC_STORY_API_URL ?? 'https://api.aeneid.storyrpc.io'

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

// ── Content encryption / decryption (AES-GCM, Web Crypto) ──────────────────

export async function encryptContent(content: string, dataKey: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', dataKey.slice(0, 32), 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(content)
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyMaterial, encoded)
  // Prepend IV (12 bytes) to ciphertext
  const combined = new Uint8Array(12 + cipherBuf.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipherBuf), 12)
  return uint8ToBase64url(combined)
}

export async function decryptContent(encryptedBase64: string, dataKey: Uint8Array): Promise<string> {
  const combined = base64urlToUint8(encryptedBase64)
  const iv = combined.slice(0, 12)
  const cipherBuf = combined.slice(12)
  const keyMaterial = await crypto.subtle.importKey('raw', dataKey.slice(0, 32), 'AES-GCM', false, ['decrypt'])
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keyMaterial, cipherBuf)
  return new TextDecoder().decode(plainBuf)
}

export function generateDataKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

// ── Base64url helpers ───────────────────────────────────────────────────────

function uint8ToBase64url(buf: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlToUint8(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - (str.length % 4)) % 4, '=')
  const binary = atob(base64)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf
}
