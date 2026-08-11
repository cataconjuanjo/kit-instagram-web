/**
 * Centralized security utilities for Carta Viva API routes.
 * Import from here instead of duplicating logic across endpoints.
 */
import { supabaseAdmin } from './supabaseAdmin'
import { logSecurityEvent } from './securityEvents'

// ── Rate limiting (Supabase-backed, survives restarts) ────────────

/**
 * Returns true if the request is allowed, false if rate-limited.
 * Uses the rate_limits table (created in supabase/rls_policies.sql).
 *
 * @param {string} ip
 * @param {string} endpoint  short identifier, e.g. 'contacto', 'checkout'
 * @param {{ max?: number, windowMs?: number }} [opts]
 */
export async function checkRateLimit(ip, endpoint, { max = 10, windowMs = 3_600_000 } = {}) {
  const since = new Date(Date.now() - windowMs).toISOString()

  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', endpoint)
    .gte('created_at', since)

  if ((count || 0) >= max) {
    logSecurityEvent('rate_limit_exceeded', {
      endpoint,
      key: ip,
      reason: `max_${max}_window_${windowMs}`,
      status: 429,
    })
    return false
  }

  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint })
  return true
}

/**
 * Extracts the real client IP from standard proxy headers.
 * @param {Request} request
 */
export function getClientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

// ── Sanitization ──────────────────────────────────────────────────

/** Strips control characters, collapses whitespace, and truncates. */
export function sanitizeText(value, max = 500) {
  return String(value ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** Normalizes and truncates an email address. */
export function sanitizeEmail(value) {
  return String(value ?? '').trim().toLowerCase().slice(0, 254)
}

/**
 * Returns a safe URL or an empty string.
 * Rejects data: and javascript: URIs.
 */
export function sanitizeUrl(value, { httpsOnly = false } = {}) {
  const raw = String(value ?? '').trim().slice(0, 2048)
  if (!raw) return ''
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const url = new URL(raw)
    const allowed = httpsOnly ? ['https:'] : ['http:', 'https:', 'mailto:', 'tel:']
    return allowed.includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

/** Forces slug to lowercase alphanumeric + hyphens + underscores. */
export function sanitizeSlug(value) {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 120)
}

/** HTML-escapes a string for safe interpolation into HTML templates. */
export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ── Validation helpers ────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/
const SLUG_RE = /^[a-z0-9_-]{1,120}$/

export const is = {
  uuid: (v) => UUID_RE.test(String(v ?? '')),
  email: (v) => EMAIL_RE.test(sanitizeEmail(v)),
  slug: (v) => SLUG_RE.test(String(v ?? '')),
  positiveNumber: (v) => Number.isFinite(Number(v)) && Number(v) > 0,
  nonEmptyString: (v) => typeof v === 'string' && v.trim().length > 0,
  /** Returns a validator that checks if v is in the allowed list. */
  oneOf: (allowed) => (v) => allowed.includes(v),
}

/**
 * Validates a request body against a schema of validator functions.
 *
 * Schema: { fieldName: (value) => true | false | "error message" }
 * - Return true  → field is valid
 * - Return false → field invalid (generic "Campo inválido: X" message)
 * - Return string → field invalid with that message
 *
 * @param {Record<string, unknown>} body  Parsed request body
 * @param {Record<string, (v: unknown) => boolean | string>} schema
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function validateBody(body, schema) {
  const errors = []
  const data = {}

  for (const [field, validate] of Object.entries(schema)) {
    const value = body?.[field]
    const result = validate(value)

    if (result === false) {
      errors.push(`Campo inválido: ${field}`)
    } else if (typeof result === 'string') {
      errors.push(result)
    } else {
      data[field] = value
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join('. ') }
  }
  return { ok: true, data }
}

/**
 * Parses and validates a JSON body from a Next.js API request.
 * Returns null on parse failure.
 * @param {Request} request
 */
export async function parseJsonBody(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/**
 * Returns a 429 rate-limit response.
 */
export function rateLimitResponse(message = 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.') {
  return Response.json({ ok: false, error: message }, { status: 429 })
}

/**
 * Returns a 400 validation error response.
 */
export function validationErrorResponse(message = 'Datos no válidos.') {
  return Response.json({ ok: false, error: message }, { status: 400 })
}
