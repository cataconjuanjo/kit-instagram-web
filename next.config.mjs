/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const noIndexProposal = [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
    ]

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
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
