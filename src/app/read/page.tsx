'use client'

import { Suspense } from 'react'
import ReadContent from './ReadContent'

export default function ReadPage() {
  return (
    <Suspense fallback={<div style={{ color: '#fff', fontFamily: 'monospace', padding: '48px' }}>Loading...</div>}>
      <ReadContent />
    </Suspense>
  )
}
