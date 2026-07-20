import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const DURACION_PREDETERMINADA_MS = 60 * 60 * 1000
const DURACION_MINIMA_MS = 15 * 60 * 1000
const DURACION_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000

function secreto() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function firma(payload) {
  return createHmac('sha256', secreto()).update(payload).digest('base64url')
}

export function hashTokenPruebaCarta(token) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

export function normalizarDuracionPruebaMs(duracionMs = DURACION_PREDETERMINADA_MS) {
  const numero = Number(duracionMs)
  if (!Number.isFinite(numero)) return DURACION_PREDETERMINADA_MS
  return Math.max(DURACION_MINIMA_MS, Math.min(DURACION_MAXIMA_MS, Math.round(numero)))
}

export function crearTokenPruebaCarta(restauranteId, opciones = {}) {
  const duracionMs = normalizarDuracionPruebaMs(opciones.duracionMs)
  const payload = Buffer.from(JSON.stringify({
    restaurante_id: String(restauranteId),
    tipo: opciones.tipo || 'prueba_carta',
    exp: Date.now() + duracionMs,
  })).toString('base64url')
  return `${payload}.${firma(payload)}`
}

export function validarTokenPruebaCarta(token, restauranteId) {
  const data = leerTokenPruebaCarta(token)
  return Boolean(data && String(data.restaurante_id) === String(restauranteId))
}

export function leerTokenPruebaCarta(token) {
  try {
    const [payload, signature] = String(token || '').split('.')
    if (!payload || !signature || !secreto()) return null
    const expected = firma(payload)
    if (signature.length !== expected.length) return null
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (Number(data.exp) <= Date.now()) return null
    return data
  } catch {
    return null
  }
}

export function origenConsumoCarta({ pruebaToken, restauranteId }) {
  return validarTokenPruebaCarta(pruebaToken, restauranteId) ? 'restaurante_prueba' : 'cliente_real'
}
