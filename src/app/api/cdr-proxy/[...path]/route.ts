import { NextRequest, NextResponse } from 'next/server'

const CDR_API = 'http://172.192.41.96:1317'

function upstreamUrl(req: NextRequest): string {
  const prefix = '/api/cdr-proxy'
  const pathname = req.nextUrl.pathname
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname
  return `${CDR_API}${rest}${req.nextUrl.search}`
}

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(upstreamUrl(req))
    const data = await res.text()
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const res = await fetch(upstreamUrl(req), {
      method: 'POST',
      headers: { 'Content-Type': req.headers.get('Content-Type') ?? 'application/json' },
      body,
    })
    const data = await res.text()
    return new NextResponse(data, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
