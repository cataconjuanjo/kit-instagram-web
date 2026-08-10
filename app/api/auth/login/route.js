import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const GENERIC_LOGIN_ERROR = 'Email o contraseña incorrecta.'
const RATE_WINDOW_MS = 15 * 60 * 1000
const IP_ATTEMPT_LIMIT = 20
const ACCOUNT_ATTEMPT_LIMIT = 8

function getIP(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 254)
}

function isValidEmail(email) {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email)
}

function hashIdentifier(value) {
  const pepper = process.env.LOGIN_RATE_LIMIT_PEPPER ||
    process.env.SALA_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'carta-viva-login-rate-limit'

  return createHash('sha256')
    .update(`${pepper}:${value}`)
    .digest('hex')
}

async function checkRateLimit(key, endpoint, max) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', key)
    .eq('endpoint', endpoint)
    .gte('created_at', since)

  if ((count || 0) >= max) return false
  await supabaseAdmin.from('rate_limits').insert({ ip: key, endpoint })
  return true
}

function genericFailure(status = 401) {
  return Response.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status })
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return genericFailure()
  }

  const email = normalizeEmail(body?.email)
  const password = String(body?.password || '')

  if (!isValidEmail(email) || password.length < 8 || password.length > 256) {
    return genericFailure()
  }

  const ip = getIP(request)
  const accountKey = `acct:${hashIdentifier(email)}`
  const ipAllowed = await checkRateLimit(ip, 'auth-login-ip', IP_ATTEMPT_LIMIT)
  const accountAllowed = await checkRateLimit(accountKey, 'auth-login-account', ACCOUNT_ATTEMPT_LIMIT)

  if (!ipAllowed || !accountAllowed) {
    return Response.json({
      ok: false,
      error: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
    }, { status: 429 })
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password })
  if (error || !data?.session) return genericFailure()

  return Response.json({
    ok: true,
    session: data.session,
    user: {
      id: data.user?.id,
      email: data.user?.email,
    },
  })
}
