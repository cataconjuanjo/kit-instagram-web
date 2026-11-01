/**
 * tooltips.js — funciones puras de construcción de tooltips para
 * BarsLine y Line. Sin JSX ni DOM; testeable con node:test.
 */

import { fmtMes } from './format.js'

/**
 * Tooltip de BarsLine con formato "etiquetado":
 *   SIN serieB:  "Mar: 10.653 € · 2.251 €"
 *   CON serieB:  "Mar: Ventas 10.653 € (2025: 9.543 €, +11,6 %)
 *                 · Resultado 2.251 € (2025: 1.929 €)"
 *   - La variación % solo si el mes ∈ comparables y prev es número
 *     finito ≠ 0.
 *   - Si prev es null/no finito, no se añade bloque prev.
 */
export function buildBarsLineTooltip({
  mes, bar, linea, barPrev, lineaPrev,
  formatBar, formatLine, estimado, esComparable, tieneSerieB, anioPrevLabel,
}) {
  const mesLabel = fmtMes(mes)
  const anioStr  = String(mes || '').endsWith('-01') ? ' ' + String(mes).slice(0, 4) : ''
  const estimadoTxt = estimado ? ' (estimado)' : ''

  if (!tieneSerieB) {
    const lineaInfo = (linea != null && Number.isFinite(Number(linea)))
      ? ' · ' + formatLine(Number(linea)) : ''
    return `${mesLabel}${anioStr}: ${formatBar(bar)}${lineaInfo}${estimadoTxt}`
  }

  const prevLabel = anioPrevLabel || 'ant.'
  const barPart   = `Ventas ${formatBar(bar)}${compararImporte(barPrev, bar, prevLabel, formatBar, esComparable)}`

  let lineaPart = ''
  if (linea != null && Number.isFinite(Number(linea))) {
    const lineaCompStr = (lineaPrev != null && Number.isFinite(Number(lineaPrev)))
      ? ` (${prevLabel}: ${formatLine(Number(lineaPrev))})`
      : ''
    lineaPart = ` · Resultado ${formatLine(Number(linea))}${lineaCompStr}`
  }

  return `${mesLabel}${anioStr}: ${barPart}${lineaPart}${estimadoTxt}`
}

function compararImporte(prev, actual, prevLabel, formatBar, esComparable) {
  if (prev == null) return ''
  const vp = Number(prev)
  if (!Number.isFinite(vp)) return ''
  const prevStr = `${prevLabel}: ${formatBar(vp)}`
  if (!esComparable) return ` (${prevStr})`
  if (vp === 0) return ` (${prevStr}, Δ —)`
  const dPct = (Number(actual) - vp) / Math.abs(vp) * 100
  const sign = dPct >= 0 ? '+' : ''
  return ` (${prevStr}, ${sign}${dPct.toFixed(1)} %)`
}

/**
 * Tooltip de Line con formato "etiquetado":
 *   SIN serieB:  "Mar: 37,7 %"
 *   CON serieB comparable (ratio):  "Mar: 37,7 % (2025: 37,6 %, +0,1 pp)"
 *   CON serieB comparable (importe): "Mar: 12.000 € (2025: 10.000 €, +20,0 %)"
 *   CON serieB NO comparable:       "Mar: 37,5 % (2025: 37,8 %)"
 */
export function buildLineTooltip({
  mes, valor, valorPrev, formatValor, estimado,
  esComparable, tieneSerieB, tipoVariacion, anioPrevLabel,
}) {
  const base = `${fmtMes(mes)}: ${formatValor(valor)}`
  const estimadoTxt = estimado ? ' (estimado)' : ''
  if (!tieneSerieB) return `${base}${estimadoTxt}`

  const prevLabel = anioPrevLabel || 'ant.'

  if (valorPrev == null) return `${base}${estimadoTxt}`
  const vp = Number(valorPrev)
  if (!Number.isFinite(vp)) return `${base}${estimadoTxt}`

  const prevStr = `${prevLabel}: ${formatValor(vp)}`
  if (!esComparable) return `${base} (${prevStr})${estimadoTxt}`

  if (tipoVariacion === 'ratio') {
    const d    = valor - vp
    const sign = d >= 0 ? '+' : ''
    return `${base} (${prevStr}, ${sign}${d.toFixed(1)} pp)${estimadoTxt}`
  }
  if (vp === 0) return `${base} (${prevStr}, Δ —)${estimadoTxt}`
  const d    = valor - vp
  const dPct = d / Math.abs(vp) * 100
  const sign = dPct >= 0 ? '+' : ''
  return `${base} (${prevStr}, ${sign}${dPct.toFixed(1)} %)${estimadoTxt}`
}

/**
 * Deriva el label del año anterior desde serieB (primer mes 'YYYY-MM')
 * o desde la etiqueta "YYYY / YYYY" ya expuesta en el subtítulo.
 * Fallback: 'ant.'.
 */
export function etiquetaAnioPrev(serieB, etiquetaSeries) {
  if (Array.isArray(serieB) && serieB.length > 0 && typeof serieB[0].mes === 'string') {
    const [y] = String(serieB[0].mes).split('-')
    if (/^\d{4}$/.test(y)) return y
  }
  if (typeof etiquetaSeries === 'string') {
    const m = etiquetaSeries.match(/(\d{4})\s*\/\s*(\d{4})/)
    if (m) return m[2]
  }
  return 'ant.'
}
