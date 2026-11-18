/**
 * pdfEstilos.js — Identidad visual Carta Viva para PDFs generados
 * con jsPDF (/api/somm/informe-mensual). Reutiliza la paleta del
 * módulo de Excel para mantener una sola fuente de la verdad.
 *
 * Decisiones (Fase B):
 *   - Mantenemos jsPDF como librería (ya en el repo, texto real
 *     extraíble, sin dependencias nuevas).
 *   - La cabecera es burdeos + logo isotipo con proporción real
 *     del PNG (si no carga, degrada a sólo texto).
 *   - Pie con "Página X de N" en TODAS las páginas: se pinta al
 *     final iterando doc.getNumberOfPages(), para que N sea
 *     correcto.
 *   - Cero cambios en datos/cifras/etiquetas: sólo presentación.
 *
 * IMPORTANTE: este módulo se importa desde una ruta de Next
 * (app/api/...) y por tanto corre en Node. Evitamos cualquier
 * dependencia del DOM. La lectura del logo usa fs.readFileSync.
 */

import { BRAND } from './excelEstilos.js'
import { leerDimensionesPng } from './excelEstilos.js'
import {
  ISOTIPO_PNG_HEIGHT,
  ISOTIPO_PNG_WIDTH,
  getIsotipoBuffer,
} from './isotipoBase64.js'

// Convierte HEX (6 chars, sin '#') → [r, g, b] 0..255 (lo que
// jsPDF espera en setTextColor/setFillColor/setDrawColor).
export function hexToRgb(hex) {
  const s = String(hex || '').replace('#', '')
  if (!/^[0-9A-Fa-f]{6}$/.test(s)) return [0, 0, 0]
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ]
}

// Paleta RGB precalculada (misma fuente que excelEstilos.js).
export const PDF_COLORS = Object.freeze({
  wine:      hexToRgb(BRAND.wine),       // 123, 30, 59
  wineDark:  hexToRgb(BRAND.wineDark),
  gold:      hexToRgb(BRAND.gold),       // 201, 162, 75
  goldLight: hexToRgb(BRAND.goldLight),
  cream:     hexToRgb(BRAND.cream),      // 251, 247, 240
  textDark:  hexToRgb(BRAND.textDark),   // 42, 33, 28
  textLight: hexToRgb(BRAND.textLight),
  red:       hexToRgb(BRAND.red),        // 178, 58, 58
  green:     hexToRgb(BRAND.green),
  banda:     hexToRgb(BRAND.banda),      // 247, 241, 230
  borde:     hexToRgb(BRAND.borde),
})

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** 'YYYY-MM' → 'Noviembre 2026' (mismo formato que main; sin "de"). */
export function formatPeriodoPdfEs(periodo) {
  if (typeof periodo !== 'string') return ''
  const m = periodo.match(/^(\d{4})-(\d{2})$/)
  if (!m) return periodo
  const y = +m[1]
  const mo = +m[2]
  if (mo < 1 || mo > 12) return periodo
  return `${MESES_ES[mo - 1]} ${y}`
}

// ── Logo isotipo: módulo base64 embebido en el bundle ─────────────────
//
// En main el módulo leía el PNG con `fs.readFileSync('public/…')`,
// pero en runtime serverless (Vercel) `public/` NO está disponible
// en el fs de la lambda — sólo se sirve estáticamente por el CDN.
// La función caía al null-fallback y el PDF salía sin logo (9.4 KB
// y 0 objetos /Subtype /Image, verificado en el preview d48b846).
//
// Fix: importamos el PNG inline como base64 desde `isotipoBase64.js`,
// un módulo generado desde el fichero real y commiteado al repo. Al
// importarse como JS, se bundlea con la función serverless y
// funciona idéntico en local y en producción. Añade ~100 KB al
// bundle de la ruta (aceptable para serverless, límite 50 MB).
//
// Se mantiene `leerDimensionesPng` para derivar el ratio exacto
// del PNG y no estirarlo nunca.

export function cargarLogoPdf() {
  try {
    const buffer = getIsotipoBuffer()
    if (!buffer || buffer.length === 0) return null
    // Dimensiones: se podrían leer con leerDimensionesPng, pero
    // el módulo ya exporta ancho y alto exactos del PNG; usamos
    // esos valores para evitar reparseo del header.
    const width  = ISOTIPO_PNG_WIDTH
    const height = ISOTIPO_PNG_HEIGHT
    // Defensivo: si por cualquier motivo el buffer no es un PNG
    // (corrupción), seguimos devolviendo null.
    if (!leerDimensionesPng(buffer)) return null
    return { buffer, width, height }
  } catch {
    return null
  }
}

// ── Cabecera de página ────────────────────────────────────────────────

/**
 * Pinta la cabecera burdeos de la primera página.
 *   - banda burdeos (0..28 mm)
 *   - línea dorada 1.2 mm bajo la banda
 *   - logo isotipo arriba a la izquierda (si cargó)
 *   - "Carta Viva" y subtítulo pequeño a la izquierda (o junto al logo)
 *   - título del periodo en Español y nombre del restaurante a la derecha
 *
 * No modifica `y`; el caller decide el cursor tras la cabecera.
 */
export function pintarCabecera(doc, {
  W, margin,
  restauranteNombre = '',
  periodoEs = '',
  subtitulo = 'Informe de Explotación Mensual',
  logo = null,
}) {
  // Banda burdeos
  doc.setFillColor(...PDF_COLORS.wine)
  doc.rect(0, 0, W, 28, 'F')
  // Filete dorado
  doc.setFillColor(...PDF_COLORS.gold)
  doc.rect(0, 28, W, 1.2, 'F')

  // Logo isotipo arriba a la izquierda (si cargó). Lo escalamos a 18
  // mm de alto respetando la proporción real del PNG. Si el PNG es
  // cuadrado, 18×18. No se estira jamás.
  let textoX = margin
  if (logo && logo.buffer && logo.width > 0 && logo.height > 0) {
    const H = 18
    const W_logo = (logo.width / logo.height) * H
    try {
      doc.addImage(logo.buffer, 'PNG', margin, 5, W_logo, H, undefined, 'FAST')
      textoX = margin + W_logo + 4
    } catch {
      // Degradación: si addImage falla, seguimos con el texto.
    }
  }

  // Textos de la cabecera (crema sobre burdeos).
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...PDF_COLORS.cream)
  doc.text('Carta Viva', textoX, 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  // Textura dorada clara para el subtítulo.
  doc.setTextColor(...PDF_COLORS.gold)
  doc.text(subtitulo, textoX, 17)

  // Derecha: periodo + restaurante.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...PDF_COLORS.cream)
  doc.text(periodoEs || '', W - margin, 11, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...PDF_COLORS.gold)
  if (restauranteNombre) {
    doc.text(restauranteNombre, W - margin, 17, { align: 'right' })
  }
}

// ── Pie de página ─────────────────────────────────────────────────────

/**
 * Pinta pie de página (una vez, en la página activa).
 * Texto: izquierda "Carta Viva · Informe económico", derecha
 * "Página X de N". Siempre con el mismo formato.
 */
export function pintarPie(doc, { W, pagina, totalPaginas, yBottom = 287 }) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...PDF_COLORS.textDark)
  // Helvetica estándar de jsPDF soporta WinAnsi (incluye tildes y ñ).
  doc.text('Carta Viva · Informe económico', 18, yBottom)
  doc.text(
    `Página ${pagina} de ${totalPaginas}`,
    W - 18, yBottom,
    { align: 'right' },
  )
}

/**
 * Recorre TODAS las páginas del doc y pinta el pie en cada una
 * con `Página X de N` correcto. Se llama una sola vez justo antes
 * de serializar el PDF (`doc.output`). Mantiene la página actual
 * al terminar.
 */
export function pintarPiesEnTodas(doc, { W }) {
  const total = typeof doc.getNumberOfPages === 'function'
    ? doc.getNumberOfPages()
    : (doc.internal?.getNumberOfPages?.() ?? 1)
  const current = doc.internal?.getCurrentPageInfo?.()?.pageNumber ?? total
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    pintarPie(doc, { W, pagina: i, totalPaginas: total })
  }
  // Restaura la página activa.
  doc.setPage(current)
}

// ── Helpers de formato (es-ES) reusables ──────────────────────────────

export function formatEurEs(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0,00 €'
  const abs = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true,
  }).format(Math.abs(v))
  return (v < 0 ? '-' : '') + abs + ' €'
}
export function formatPctEs(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '-'
  const v = Number(n)
  const abs = Math.abs(v).toFixed(1).replace('.', ',')
  return (v < 0 ? '-' : '') + abs + ' %'
}
