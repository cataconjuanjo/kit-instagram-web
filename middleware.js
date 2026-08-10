import { NextResponse } from 'next/server'

// These paths receive server-to-server POST requests (no browser Origin header)
const WEBHOOK_PATHS = ['/api/stripe/webhook', '/api/webhooks/']

// These paths serve public data and may be called from any origin
const PUBLIC_API_PATHS = ['/api/public/', '/api/health']

function getAppOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

function isSameOrigin(origin, request) {
  if (!origin) return true
  try {
    const originHost = new URL(origin).host
    const requestHost = request.headers.get('host') || ''
    return originHost === requestHost
  } catch {
    return false
  }
}

function buildAllowedOrigins() {
  const appOrigin = getAppOrigin()

  const wwwVariant = appOrigin.includes('://www.')
    ? appOrigin.replace('://www.', '://')
    : appOrigin.replace('://', '://www.')

  return new Set([
    appOrigin,
    wwwVariant,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean))
}

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

export function middleware(request) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get('origin')

  // Only apply to API routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Webhooks: server-to-server, bypass origin checks
  if (WEBHOOK_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const isPublicPath = PUBLIC_API_PATHS.some(p => pathname.startsWith(p))
  const allowedOrigins = buildAllowedOrigins()
  const originIsAllowed = !origin || isPublicPath || allowedOrigins.has(origin) || isSameOrigin(origin, request)

  // Preflight (OPTIONS)
  if (request.method === 'OPTIONS') {
    if (!originIsAllowed) {
      return new NextResponse(null, { status: 403 })
    }
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Allow-Origin': origin || getAppOrigin(),
      },
    })
  }

  // Block browser-initiated cross-origin requests to protected routes
  if (!originIsAllowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const response = NextResponse.next()

  // Attach CORS headers when the request has an Origin
  if (origin && (isPublicPath || allowedOrigins.has(origin))) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Vary', 'Origin')
  }

  return response
}

export const config = {
  matcher: '/api/:path*',
}
