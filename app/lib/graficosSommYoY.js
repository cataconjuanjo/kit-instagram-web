/**
 * graficosSommYoY.js — helpers puros para la comparativa YoY del endpoint
 * /api/graficos-somm. Sin DOM, sin Supabase.
 */

import { mesesComparables } from './yoyAgregacion.js'

/**
 * parsearComparar(raw, anio)
 *   raw: string | null | undefined   (query ?comparar_con=…)
 *   anio: entero del año actual
 * Devuelve:
 *   - undefined/null si no se pasa parámetro
 *   - entero válido (2000..anio-1) en otro caso
 * Lanza Error si el valor no es entero, está fuera de rango o es >= anio.
 */
export function parsearComparar(raw, anio) {
  if (raw == null || raw === '') return undefined
  // Debe ser entero puro (no "2024.5", no "2024abc", no "2024 ").
  if (!/^\d+$/.test(String(raw))) throw new Error('comparar_con no es entero')
  const n = Number(raw)
  if (!Number.isInteger(n)) throw new Error('comparar_con no es entero')
  if (n < 2000)      throw new Error('comparar_con < 2000')
  if (n >= Number(anio)) throw new Error('comparar_con debe ser menor que anio')
  return n
}

/**
 * calcularComparables(serieActual, seriePrev)
 *   Ambas series son array devuelto por agregarGraficosSomm:
 *     [{ mes: 'YYYY-MM', estado: 'cerrado'|'estimado', ventas_neto, ... }]
 *
 *   Devuelve números de mes (1..12) presentes como 'cerrado' en el año
 *   actual Y en el año prev. Un mes 'estimado' nunca es comparable (el
 *   mes abierto queda fuera por construcción).
 *
 *   Delega en mesesComparables (yoyAgregacion.js) la intersección y el
 *   excluir mes en curso, convirtiendo las series a filas {anio, mes}.
 */
export function calcularComparables(serieActual, seriePrev) {
  const filasActual = toFilas(serieActual, 'cerrado')
  const filasPrev   = toFilas(seriePrev,   'cerrado')
  return mesesComparables(filasActual, filasPrev)
}

function toFilas(serie, estadoRequerido) {
  const out = []
  for (const s of (serie || [])) {
    if (estadoRequerido && s.estado !== estadoRequerido) continue
    const [anioStr, mesStr] = String(s.mes || '').split('-')
    const anio = Number(anioStr)
    const mes  = Number(mesStr)
    if (!Number.isInteger(anio) || !Number.isInteger(mes)) continue
    out.push({ anio, mes })
  }
  return out
}
