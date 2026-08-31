import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { logSecurityEvent } from '../../../lib/securityEvents'

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

const RATE_LIMIT_TIMEOUT_MS = 4000

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('rate_limit_timeout')), ms)
    ),
  ])
}

async function checkRateLimit(key, endpoint, max) {
  try {
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const { count } = await withTimeout(
      supabaseAdmin
        .from('rate_limits')
        .select('id', { count: 'exact', head: true })
        .eq('ip', key)
        .eq('endpoint', endpoint)
        .gte('created_at', since),
      RATE_LIMIT_TIMEOUT_MS
    )

    if ((count || 0) >= max) {
      logSecurityEvent('rate_limit_exceeded', {
        endpoint,
        key,
        reason: `max_${max}_window_${RATE_WINDOW_MS}`,
        status: 429,
      })
      return false
    }

    // Fire-and-forget: no bloqueamos el login si el insert falla
    withTimeout(
      supabaseAdmin.from('rate_limits').insert({ ip: key, endpoint }),
      RATE_LIMIT_TIMEOUT_MS
    ).catch(err => console.error('[rate_limit] insert error:', err.message))

    return true
  } catch (err) {
    // Si rate_limits está caído o lento, fail-open para no bloquear el login
    console.error('[rate_limit] check failed, failing open:', err.message)
    return true
  }
}

function genericFailure(status = 401) {
  return Response.json({ ok: false, error: GENERIC_LOGIN_ERROR }, { status })
}

export async function POST(request) {
  const ip = getIP(request)
  const ipAllowed = await checkRateLimit(ip, 'auth-login-ip', IP_ATTEMPT_LIMIT)
  if (!ipAllowed) {
    return Response.json({
      ok: false,
      error: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.',
    }, { status: 429 })
  }

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

  const accountKey = `acct:${hashIdentifier(email)}`
  const accountAllowed = await checkRateLimit(accountKey, 'auth-login-account', ACCOUNT_ATTEMPT_LIMIT)

  if (!accountAllowed) {
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
