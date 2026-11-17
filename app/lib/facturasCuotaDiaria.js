/**
 * facturasCuotaDiaria.js — límite diario propio para /api/facturas/extraer.
 *
 * La cuota general (`comprobarCuotaIaRestaurante`) usa una ventana
 * deslizante de 24 h y se comparte con otras funciones de IA. Para
 * las lecturas de facturas queremos un tope independiente, que cuenta
 * las extracciones del día natural en la zona Europe/Madrid.
 *
 * Esta decisión NO necesita SQL: la tabla `consumos_ia` ya guarda
 * `endpoint`, así que basta con contar filas con
 * `endpoint = '/api/facturas/extraer'` creadas a partir del inicio
 * del día local de Madrid.
 *
 * Todo lo relevante está en funciones puras (inyectables en tests)
 * y el consumidor (route.js) añade la lectura a `consumos_ia` y la
 * respuesta 429.
 */

const DEFAULT_LIMITE_FACTURAS = 20
const MADRID_TZ = 'Europe/Madrid'
const FACTURAS_ENDPOINT = '/api/facturas/extraer'

export { FACTURAS_ENDPOINT }

/**
 * Lee la variable de entorno FACTURAS_IA_LIMITE_DIARIO y devuelve un
 * entero >= 1. Valores no numéricos, <=0 o NaN → default.
 */
export function limiteDiarioFacturas(env = typeof process !== 'undefined' ? process.env : {}) {
  const raw = env?.FACTURAS_IA_LIMITE_DIARIO
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMITE_FACTURAS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMITE_FACTURAS
  return Math.floor(n)
}

/**
 * Inicio del día (00:00) en Europe/Madrid, devuelto como `Date` en UTC.
 *
 * Técnica: tomamos los componentes Y/M/D del día local de Madrid con
 * Intl.DateTimeFormat, construimos ese día a las 00:00 UTC y después
 * restamos el offset de Madrid vigente en ese momento (1 h en CET,
 * 2 h en CEST). Es correcto en los días de cambio horario porque la
 * transición DST ocurre a las 01:00 UTC, siempre posterior a nuestra
 * toma de muestra en 00:00 UTC del mismo día local.
 */
export function inicioDiaMadrid(d = new Date()) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TypeError('inicioDiaMadrid: Date inválido')
  }
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: MADRID_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  const y = Number(partes.find(p => p.type === 'year').value)
  const m = Number(partes.find(p => p.type === 'month').value)
  const day = Number(partes.find(p => p.type === 'day').value)

  // 00:00 UTC del mismo día local (todavía no es medianoche en Madrid).
  const utcMediaNoche = new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0))

  // Hora de Madrid en ese instante → nos da el offset del día.
  const h = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: MADRID_TZ, hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(utcMediaNoche).find(p => p.type === 'hour').value)

  // Madrid 00:00 local = utcMediaNoche − offsetHoras.
  return new Date(utcMediaNoche.getTime() - h * 3600 * 1000)
}

export function inicioDiaMadridISO(d = new Date()) {
  return inicioDiaMadrid(d).toISOString()
}

/**
 * Decisión pura de si una cuenta supera el límite. Devuelve true si
 * `usadas >= limite`; se interpreta "has llegado al tope" como
 * bloquear la petición en curso.
 */
export function superaLimiteDiarioFacturas(usadas, limite) {
  if (!Number.isFinite(usadas) || !Number.isFinite(limite)) return false
  return usadas >= limite
}

/** Mensaje literal usado en el 429 propio del límite diario de facturas. */
export const MENSAJE_LIMITE_FACTURAS =
  'Has alcanzado el límite diario de facturas leídas con IA. Vuelve mañana o regístrala a mano.'
