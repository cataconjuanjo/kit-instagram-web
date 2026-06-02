import { createHmac, timingSafeEqual } from 'node:crypto'

const DURACION_MS = 60 * 60 * 1000

function secreto() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function firma(payload) {
  return createHmac('sha256', secreto()).update(payload).digest('base64url')
}

export function crearTokenPruebaCarta(restauranteId) {
  const payload = Buffer.from(JSON.stringify({
    restaurante_id: String(restauranteId),
    exp: Date.now() + DURACION_MS,
  })).toString('base64url')
  return `${payload}.${firma(payload)}`
}

export function validarTokenPruebaCarta(token, restauranteId) {
  try {
    const [payload, signature] = String(token || '').split('.')
    if (!payload || !signature || !secreto()) return false
    const expected = firma(payload)
    if (signature.length !== expected.length) return false
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return String(data.restaurante_id) === String(restauranteId) && Number(data.exp) > Date.now()
  } catch {
    return false
  }
}

export function origenConsumoCarta({ pruebaToken, restauranteId }) {
  return validarTokenPruebaCarta(pruebaToken, restauranteId) ? 'restaurante_prueba' : 'cliente_real'
}
