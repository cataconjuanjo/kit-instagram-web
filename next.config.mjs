/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const noIndexProposal = [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
    ]
    const noIndexPrivate = [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
    ]

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        ],
      },
      {
        source: '/admin/:path*',
        headers: noIndexPrivate,
      },
      {
        source: '/dashboard/:path*',
        headers: noIndexPrivate,
      },
      {
        source: '/login',
        headers: noIndexPrivate,
      },
      {
        source: '/bienvenida',
        headers: noIndexPrivate,
      },
      {
        source: '/carta/propuesta-:slug',
        headers: noIndexProposal,
      },
      {
        source: '/camarero/propuesta-:slug',
        headers: noIndexProposal,
      },
    ]
  },
}

export default nextConfig
