import { createHash } from 'node:crypto'

function hashValue(value) {
  const pepper =
    process.env.SALA_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'carta-viva-security-events'

  return createHash('sha256')
    .update(`${pepper}:${String(value || '')}`)
    .digest('hex')
    .slice(0, 16)
}

function cleanString(value, max = 160) {
  return String(value || '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, max)
}

export function logSecurityEvent(type, details = {}) {
  const key = String(details.key || '')
  const event = {
    type: cleanString(type, 80),
    endpoint: cleanString(details.endpoint || 'unknown', 120),
    key_type: key.startsWith('acct:') ? 'account' : key ? 'ip' : 'none',
    key_hash: key ? hashValue(key) : undefined,
    reason: details.reason ? cleanString(details.reason, 120) : undefined,
    status: Number(details.status) || undefined,
    path: details.path ? cleanString(details.path, 220) : undefined,
    method: details.method ? cleanString(details.method, 16) : undefined,
    at: new Date().toISOString(),
  }

  console.warn('[security:event]', JSON.stringify(event))
}
