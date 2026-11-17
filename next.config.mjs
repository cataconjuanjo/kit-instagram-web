/** @type {import('next').NextConfig} */

// Las imágenes pueden venir de cualquier dominio externo:
// bodegas, Square/Weebly, PDFs importados, XLSX de proveedor, etc.
// Usar https: (cualquier HTTPS) es la opción correcta para un SaaS multi-tenant.
// La protección anti-XSS real está en script-src y connect-src, no en img-src.
const IMG_SOURCES = ["'self'", 'https:', 'data:', 'blob:'].join(' ')

// APIs que el JS del cliente puede llamar con fetch/XHR
// connect-src es la protección más importante contra exfiltración de datos en caso de XSS
const CONNECT_SOURCES = [
  "'self'",
  'https://*.supabase.co',
  'https://*.supabase.in',
  'wss://*.supabase.co',      // Supabase Realtime
  'https://api.stripe.com',
  'https://hooks.stripe.com',
  'https://vitals.vercel-insights.com', // Vercel Analytics (si lo usas)
].join(' ')

// Dominios desde los que se puede cargar JS externo
// 'unsafe-inline' es necesario para Next.js App Router (scripts de hidratación)
// 'unsafe-eval' solo en dev — React lo necesita para source maps y call stacks
const isDev = process.env.NODE_ENV === 'development'
const SCRIPT_SOURCES = [
  "'self'",
  "'unsafe-inline'",
  'https://js.stripe.com',
  ...(isDev ? ["'unsafe-eval'"] : []),
].join(' ')

// Estilos: Next.js inyecta estilos inline en algunos casos
const STYLE_SOURCES = ["'self'", "'unsafe-inline'"].join(' ')

const CSP = [
  `default-src 'self'`,
  `script-src ${SCRIPT_SOURCES}`,
  `style-src ${STYLE_SOURCES}`,
  `img-src ${IMG_SOURCES}`,
  `font-src 'self' data:`,
  `connect-src ${CONNECT_SOURCES}`,
  `media-src 'self'`,
  `worker-src 'self' blob:`,
  `frame-src https://js.stripe.com https://hooks.stripe.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `form-action 'self'`,
  `upgrade-insecure-requests`,
].join('; ')

const nextConfig = {
  productionBrowserSourceMaps: false,
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
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'Content-Security-Policy', value: CSP },
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
      {
        source: '/kiosko/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
      {
        source: '/kiosko-admin/:path*',
        headers: noIndexPrivate,
      },
    ]
  },
}

export default nextConfig
