/**
 * explotacionIngresos.js — Helpers puros para la línea nueva
 * "Resto de ingresos de explotación" en la Cuenta de Explotación.
 *
 * Según la hoja real del usuario ("CUENTA EXPLOTACIÓN BODEGA"):
 *
 *   INGRESOS
 *     + Ventas netas          (parametros_explotacion.facturacion_total)
 *     + Resto de ingresos     (parametros_explotacion.resto_ingresos)
 *     ─────────────────────
 *     = TOTAL INGRESOS
 *
 *   Todos los ratios, el resultado de explotación, el % de margen y
 *   el punto de equilibrio se calculan sobre TOTAL INGRESOS.
 *   El bonus variable y los comparativos de facturación siguen
 *   referidos a VENTAS NETAS (ver informe en la rama).
 *
 * `parseComaEs` / `formatComaEs` se reutilizan desde historicoExtras
 * para mantener una sola fuente de la convención es-ES.
 */

import { parseComaEs as parseComaEsBase } from './historicoExtras.js'
export { parseComaEs, formatComaEs } from './historicoExtras.js'

function esFinito(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Suma de ventas netas + resto de ingresos, con coerción tolerante:
 *   - strings con coma decimal → aceptados vía `Number(str.replace(',', '.'))`
 *     (la UI almacena los inputs numéricos como strings sin agrupar)
 *   - null / undefined / '' / NaN → 0
 *   - negativos → 0 (los ingresos no son negativos; defensivo)
 *
 * Devuelve siempre un número finito ≥ 0 redondeado a 2 decimales.
 */
export function calcularTotalIngresos({ facturacion, resto } = {}) {
  const f = toNumSafe(facturacion)
  const r = toNumSafe(resto)
  return Math.round((f + r) * 100) / 100
}

function toNumSafe(v) {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return esFinito(v) && v > 0 ? v : 0
  if (typeof v === 'string') {
    // Convención del form: coma decimal es-ES ("1.234,56" o "1234,56").
    // parseComaEsBase descarta negativos/NaN devolviendo null.
    const n = parseComaEsBase(v)
    return n != null ? n : 0
  }
  return 0
}

/**
 * Detecta si una respuesta de Supabase/PostgREST corresponde a una
 * "columna inexistente" (código 42703). Se usa para degradar
 * elegantemente cuando el SQL aún no se aplicó: la UI oculta el campo
 * nuevo, el guardado lo omite del payload, y los cálculos tratan
 * resto = 0 (que es el default previo).
 */
export function esErrorColumnaFalta(err, nombreColumna) {
  if (!err) return false
  if (err.code === '42703') return true
  const msg = String(err.message || err.error || '').toLowerCase()
  if (!msg) return false
  if (!msg.includes('does not exist') && !msg.includes('no existe')) return false
  if (typeof nombreColumna !== 'string' || !nombreColumna) return true
  return msg.includes(nombreColumna.toLowerCase())
}
