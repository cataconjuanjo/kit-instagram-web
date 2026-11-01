/**
 * geometria.js — helpers puros de layout para los gráficos SVG.
 * Sin DOM, sin React. Testeable con node:test.
 */

/**
 * barrasAgrupadas({ colW, hasSerieB }) → { barW, xActual, xPrev }
 *
 * Devuelve las posiciones OFFSET dentro de una columna de ancho colW.
 * El llamador suma PAD_L + i*colW para obtener la x absoluta.
 *
 * - Sin serieB: una sola barra centrada, ~55 % de la columna (igual
 *   que antes del cambio YoY).  xPrev = null.
 * - Con serieB: dos barras side-by-side, cada una ~42 % de la columna
 *   con un pequeño gap central (~4 %). La barra PREV queda a la
 *   izquierda y la ACTUAL a la derecha, con padding simétrico a los
 *   lados.
 * - Ancho mínimo de barra: 4 px. Gap mínimo: 1 px.
 */
export function barrasAgrupadas({ colW, hasSerieB }) {
  const r4 = n => Math.round(n * 10000) / 10000  // normaliza -0 y FP noise
  if (!hasSerieB) {
    const barW    = Math.max(4, colW * 0.55)
    const xActual = (colW - barW) / 2
    return { barW: r4(barW), xActual: r4(xActual), xPrev: null }
  }
  const barW  = Math.max(4, colW * 0.42)
  const gap   = Math.max(1, colW * 0.04)
  const total = 2 * barW + gap
  const left  = (colW - total) / 2
  const xPrev   = left
  const xActual = left + barW + gap
  return { barW: r4(barW), xActual: r4(xActual), xPrev: r4(xPrev) }
}
