/**
 * Funciones puras de formato es-ES para los gráficos.
 * Separadas para poder testearse sin DOM.
 */

const FMT_EUR_INT = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 0, minimumFractionDigits: 0,
})
const FMT_EUR_2 = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 2, minimumFractionDigits: 2,
})
const FMT_PCT_1 = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1, minimumFractionDigits: 1,
})

export function fmtEur(n, decimals = 0) {
  if (n === null || n === undefined || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return (decimals === 0 ? FMT_EUR_INT : FMT_EUR_2).format(v) + '€'
}

export function fmtPct(n, decimals = 1) {
  if (n === null || n === undefined || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const fmt = decimals === 0
    ? new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })
    : FMT_PCT_1
  return fmt.format(v) + '%'
}

export function fmtMes(mesStr) {
  // mesStr: 'YYYY-MM' → 'Ene', 'Feb', …
  if (!mesStr || typeof mesStr !== 'string') return ''
  const [, m] = mesStr.split('-')
  const idx = parseInt(m, 10) - 1
  const ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return ES[idx] ?? mesStr
}

export function escalaLineal(min, max, pad = 0.1) {
  const span = Math.max(1, max - min)
  return { min: min - span * pad, max: max + span * pad }
}

export function nicemax(v) {
  if (!Number.isFinite(v) || v <= 0) return 1
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const n = v / base
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * base
}

/**
 * Escala Y automática en puntos porcentuales para la línea de CoGS%.
 * Toma el min/max de la serie (valores + objetivos), añade 10% de
 * margen, redondea los extremos a múltiplos de 5 y garantiza un
 * rango mínimo de 10 puntos.
 *
 * Función pura; devuelve { min, max }.
 */
export function escalaPct(values) {
  const nums = (values || [])
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(v => Number(v))
    .filter(Number.isFinite)
  if (nums.length === 0) return { min: 0, max: 50 }

  const dMin = Math.min(...nums)
  const dMax = Math.max(...nums)
  const span = Math.max(1, dMax - dMin)
  const pad  = span * 0.1

  let min = Math.floor((dMin - pad) / 5) * 5
  let max = Math.ceil((dMax + pad) / 5) * 5

  // Rango mínimo 10 puntos: expandir simétricamente si hace falta.
  if (max - min < 10) {
    const centroExacto = (dMin + dMax) / 2
    min = Math.floor((centroExacto - 5) / 5) * 5
    max = Math.ceil((centroExacto + 5) / 5) * 5
    while (max - min < 10) max += 5
  }

  // Normaliza -0 → 0 para no romper assert.strictEqual (Object.is).
  return { min: min + 0, max: max + 0 }
}
