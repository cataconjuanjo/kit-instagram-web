import fs from 'node:fs'
import path from 'node:path'

const API_DIR = path.join('app', 'api')

const PUBLIC_ROUTES = new Map([
  ['app/api/health/route.js', { rateLimit: false, reason: 'public health status' }],
  ['app/api/auth/login/route.js', { rateLimit: true, reason: 'public auth login' }],
  ['app/api/auth/password-reset/route.js', { rateLimit: true, reason: 'public password recovery' }],
  ['app/api/contacto/route.js', { rateLimit: true, reason: 'public contact form' }],
  ['app/api/demo-bookings/route.js', { rateLimit: true, reason: 'public demo booking form' }],
  ['app/api/demo/analytics/route.js', { rateLimit: false, reason: 'consent gated analytics allow-list' }],
  ['app/api/demo/dashboard/route.js', { rateLimit: false, reason: 'fixed demo accounts only' }],
  ['app/api/analisis-carta/route.js', { rateLimit: true, reason: 'public AI demo' }],
  ['app/api/maridaje/route.js', { rateLimit: true, reason: 'public pairing assistant' }],
  ['app/api/perfil/route.js', { rateLimit: true, reason: 'public wine profile helper with quota' }],
  ['app/api/estadisticas/route.js', { rateLimit: true, reason: 'public scan analytics' }],
  ['app/api/camarero/sesion/route.js', { rateLimit: true, reason: 'waiter PIN session' }],
  ['app/api/camarero/datos/route.js', { rateLimit: false, reason: 'waiter session token required' }],
  ['app/api/kiosko/contratar/route.js', { rateLimit: true, reason: 'public Stripe checkout start' }],
  ['app/api/kiosko/lead/unsubscribe/route.js', { rateLimit: false, reason: 'unsubscribe link' }],
  ['app/api/public/restaurante/[slug]/route.js', { rateLimit: false, reason: 'public restaurant read endpoint' }],
  ['app/api/kiosko/[slug]/vinos/route.js', { rateLimit: false, reason: 'public kiosk catalog read' }],
  ['app/api/kiosko/[slug]/meta/route.js', { rateLimit: false, reason: 'public kiosk metadata read' }],
  ['app/api/kiosko/[slug]/gourmet/route.js', { rateLimit: false, reason: 'public kiosk gourmet read' }],
  ['app/api/kiosko/[slug]/stock/route.js', { rateLimit: false, reason: 'public kiosk stock read' }],
  ['app/api/kiosko/[slug]/maridaje/route.js', { rateLimit: true, reason: 'public kiosk AI assistant' }],
  ['app/api/kiosko/[slug]/ficha/[id]/route.js', { rateLimit: true, reason: 'public kiosk AI card generation' }],
  ['app/api/kiosko/[slug]/movil/route.js', { rateLimit: true, reason: 'public mobile intent write' }],
  ['app/api/kiosko/[slug]/movil/[id]/route.js', { rateLimit: true, reason: 'public mobile intent write' }],
  ['app/api/kiosko/[slug]/lead/route.js', { rateLimit: true, reason: 'public lead form' }],
  ['app/api/kiosko/[slug]/feedback/route.js', { rateLimit: true, reason: 'public feedback form' }],
  ['app/api/kiosko/[slug]/pedido/route.js', { rateLimit: true, reason: 'public assisted order form' }],
  ['app/api/stripe/webhook/route.js', { rateLimit: false, reason: 'Stripe signature verified webhook' }],
  ['app/api/webhooks/square/route.js', { rateLimit: false, reason: 'Square signature verified webhook' }],
  ['app/api/cron/square-sync/route.js', { rateLimit: false, reason: 'cron bearer secret' }],
  ['app/api/cron/kiosko-informe-semanal/route.js', { rateLimit: false, reason: 'cron bearer secret' }],
])

const PROTECTION_MARKERS = [
  'requireRestaurantAccess',
  'requireKioskoAccess',
  'getKioskoUser',
  'getUserFromRequest',
  'requireUser',
  'auth.getUser',
  'validarSesionCamarero',
  'validarTokenPruebaCarta',
  'CRON_SECRET',
  'WEBHOOK_SECRET',
  'webhooks.constructEvent',
  'SQUARE_WEBHOOK_SIGNATURE_KEY',
  'verifySquareSignature',
]

const PRIVILEGED_MARKERS = [
  'supabaseAdmin',
  'SUPABASE_SERVICE_ROLE_KEY',
  'serviceRoleKey',
  'STRIPE_SECRET_KEY',
  'RESEND_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'SQUARE_ACCESS_TOKEN',
]

const RATE_LIMIT_MARKERS = [
  'checkRateLimit',
  'rate_limits',
  'RATE_LIMIT',
  'rateLimitResponse',
]

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (entry.name === 'route.js') files.push(full)
  }
  return files
}

function normalize(file) {
  return file.split(path.sep).join('/')
}

function includesAny(source, markers) {
  return markers.some((marker) => source.includes(marker))
}

const failures = []
const reviewedPublic = []

for (const file of walk(API_DIR)) {
  const normalized = normalize(file)
  const source = fs.readFileSync(file, 'utf8')
  const publicConfig = PUBLIC_ROUTES.get(normalized)
  const usesPrivileged = includesAny(source, PRIVILEGED_MARKERS)
  const hasProtection = includesAny(source, PROTECTION_MARKERS)
  const hasRateLimit = includesAny(source, RATE_LIMIT_MARKERS)

  if (publicConfig) {
    reviewedPublic.push(`${normalized} (${publicConfig.reason})`)
    if (publicConfig.rateLimit && !hasRateLimit) {
      failures.push(`${normalized}: public sensitive endpoint without rate-limit marker`)
    }
    continue
  }

  if (usesPrivileged && !hasProtection) {
    failures.push(`${normalized}: uses privileged server capability without known auth marker`)
  }
}

const unknownPublic = [...PUBLIC_ROUTES.keys()].filter((file) => !fs.existsSync(file))
for (const file of unknownPublic) {
  failures.push(`${file}: allow-listed route does not exist`)
}

console.log(`Reviewed ${reviewedPublic.length} explicit public route(s).`)

if (failures.length) {
  console.error('\nAPI security audit failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('API security audit passed: privileged routes have auth markers and sensitive public routes have rate limits.')
