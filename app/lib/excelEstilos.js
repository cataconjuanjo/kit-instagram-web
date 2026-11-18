'use client'

/**
 * excelEstilos.js — Identidad visual Carta Viva para los workbooks
 * generados con ExcelJS (`descargarWorkbook` de excelSommDownload.js).
 *
 * Decisiones (explicadas en el informe de la rama):
 *   1. NO desplazamos filas ni tocamos la spec: las fórmulas del repo
 *      (convención sin "=" inicial, B2/B4/B8…) siguen apuntando a las
 *      MISMAS celdas de datos. Cero riesgo de romper referencias.
 *   2. Logo flotante (ExcelJS addImage con anchor por celdas) encima
 *      de la esquina superior izquierda de cada hoja: ocupa espacio
 *      "flotante" y no filas lógicas. Carga diferida desde
 *      /brand/carta-viva/isotipo.png (76 KB) — si falla, degradamos
 *      sin logo (tab coloreado + banner de impresión siguen).
 *   3. Cabecera visible: la fila 1 (header de la tabla) se decora con
 *      fondo burdeos + texto crema + bold. Para el título + restaurante
 *      + periodo usamos el "print header" que ExcelJS respeta y es
 *      compatible con Excel Desktop, Numbers y Google Sheets.
 *   4. Bandas alternas suaves, bordes finos, totales en dorado con
 *      borde doble vino, negativos en rojo sutil, pestañas coloreadas,
 *      gridlines ocultas, landscape + fit-to-width 1, repetir header
 *      al imprimir, pie con nº de página.
 */

// Paleta de marca (HEX sin '#'; ExcelJS acepta ARGB con prefijo FF).
export const BRAND = Object.freeze({
  wine:      '7B1E3B',   // --cv-wine
  wineDark:  '5C1428',
  gold:      'C9A24B',   // --cv-gold
  goldLight: 'E8D4A2',
  cream:     'FBF7F0',   // --cv-card
  textDark:  '2A211C',   // --cv-text-dark
  textLight: 'F4EDE2',   // --cv-text-light
  green:     '2E7D5B',   // --cv-green
  red:       'B23A3A',   // --cv-red
  banda:     'F7F1E6',   // beige suave para bandas alternas
  borde:     'D8D3C8',   // gris cálido para bordes
})

// Color de pestaña por hoja (map por nombre). Si una hoja nueva no
// aparece aquí, usa burdeos por defecto.
export const TAB_COLORS = Object.freeze({
  'Resumen':           BRAND.wine,
  'Personal':          BRAND.gold,
  'Gastos':            BRAND.gold,
  'Canales':           BRAND.green,
  'Canales venta':     BRAND.green,
  'Salidas no-venta':  BRAND.red,
  'Compras':           BRAND.gold,
  'Cierre bodega':     BRAND.wine,
  'Vinos':             BRAND.wine,
  'Desglose':          BRAND.wine,
  'Ratios':            BRAND.gold,
  'Conciliacion':      BRAND.green,
})

const TOP_MARGIN_ROWS = 2   // filas "en blanco" dejadas por el logo flotante

/**
 * Carga el logo isotipo como ArrayBuffer. Devuelve null si:
 *   - no hay `fetch` disponible (SSR/tests),
 *   - la respuesta no es OK,
 *   - el entorno no permite leerlo.
 * El caller DEBE tolerar null y seguir construyendo el workbook
 * (comportamiento degradado = sin logo, el resto de estilos sí).
 */
export async function cargarLogoBuffer() {
  if (typeof fetch !== 'function') return null
  try {
    const res = await fetch('/brand/carta-viva/isotipo.png')
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

/** Devuelve ARGB string a partir de hex (6 chars). */
function argb(hex) { return `FF${(hex || '').replace('#', '')}` }

/**
 * Detecta si un `numFmt` de columna es numérico (euros, pct, enteros)
 * para alinear a la derecha. "Nota" / "Concepto" / "Canal" (strings)
 * quedan a la izquierda.
 */
function esFormatoNumerico(fmt) {
  if (typeof fmt !== 'string') return false
  return /[#0]/.test(fmt)
}

/**
 * Aplica estilos de marca a una hoja concreta. Se llama tras haber
 * construido la hoja en `descargarWorkbook` con la spec ORIGINAL (sin
 * modificar filas, fórmulas ni headers).
 *
 * @param {ExcelJS.Worksheet} ws
 * @param {object} sheetSpec   — la misma entrada de spec.sheets[i]
 * @param {object} opts
 * @param {number|null} opts.logoImageId
 */
export function aplicarEstilosHoja(ws, sheetSpec, { logoImageId = null } = {}) {
  const columnas = Array.isArray(sheetSpec.columns) ? sheetSpec.columns : []
  if (columnas.length === 0) return

  const nFilas = Array.isArray(sheetSpec.rows) ? sheetSpec.rows.length : 0
  const headerRowNum = 1
  const totalRowNum  = sheetSpec.totals ? headerRowNum + nFilas + 1 : null
  const lastDataRow  = headerRowNum + nFilas

  // ── Header (fila 1) — burdeos + crema + bold ──────────────────────
  const headerRow = ws.getRow(headerRowNum)
  headerRow.height = 22
  for (let c = 1; c <= columnas.length; c++) {
    const cell = headerRow.getCell(c)
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: argb(BRAND.cream) } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(BRAND.wine) } }
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
    cell.border = {
      top:    { style: 'thin',   color: { argb: argb(BRAND.wine) } },
      bottom: { style: 'medium', color: { argb: argb(BRAND.gold) } },
      left:   { style: 'thin',   color: { argb: argb(BRAND.wineDark) } },
      right:  { style: 'thin',   color: { argb: argb(BRAND.wineDark) } },
    }
  }

  // ── Alineación por columna según numFmt ───────────────────────────
  columnas.forEach((c, idx) => {
    if (esFormatoNumerico(c.format)) {
      const col = ws.getColumn(idx + 1)
      col.alignment = { horizontal: 'right', vertical: 'middle' }
      // El header se mantiene a la izquierda para columnas numéricas
      // con texto corto; ExcelJS respeta la alineación por celda.
      headerRow.getCell(idx + 1).alignment = {
        horizontal: 'right', vertical: 'middle', wrapText: true,
      }
    }
  })

  // ── Filas de datos: bandas alternas + bordes + negativos en rojo ──
  for (let r = headerRowNum + 1; r <= lastDataRow; r++) {
    const row = ws.getRow(r)
    row.height = 18
    for (let c = 1; c <= columnas.length; c++) {
      const cell = row.getCell(c)
      cell.border = {
        bottom: { style: 'hair', color: { argb: argb(BRAND.borde) } },
      }
      // Banda alterna (filas pares a contar desde la primera de datos).
      if (((r - headerRowNum) % 2) === 0) {
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: argb(BRAND.banda) },
        }
      }
      // Negativos en rojo (si la celda es número y < 0).
      const v = cell.value
      const n = (typeof v === 'number') ? v
              : (v && typeof v === 'object' && typeof v.result === 'number') ? v.result
              : null
      if (n != null && n < 0) {
        cell.font = { color: { argb: argb(BRAND.red) } }
      }
    }
  }

  // ── Fila TOTAL: dorado + bold + border doble vino ─────────────────
  if (totalRowNum) {
    const row = ws.getRow(totalRowNum)
    row.height = 22
    for (let c = 1; c <= columnas.length; c++) {
      const cell = row.getCell(c)
      cell.font = { bold: true, color: { argb: argb(BRAND.textDark) } }
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: argb(BRAND.goldLight) },
      }
      cell.border = {
        top:    { style: 'medium', color: { argb: argb(BRAND.wine) } },
        bottom: { style: 'double', color: { argb: argb(BRAND.wine) } },
      }
    }
  }

  // ── Freeze bajo header + ocultar gridlines ────────────────────────
  // Si la spec ya pidió freezeHeader, lo respetamos; si no, lo forzamos
  // (el banding sin freeze pierde contexto al hacer scroll).
  const quiereFreeze = sheetSpec.freezeHeader || true
  ws.views = [
    {
      state: quiereFreeze ? 'frozen' : 'normal',
      ySplit: quiereFreeze ? headerRowNum : 0,
      showGridLines: false,
    },
  ]

  // ── Color de pestaña ──────────────────────────────────────────────
  const tabColor = TAB_COLORS[sheetSpec.name] || BRAND.wine
  ws.properties.tabColor = { argb: argb(tabColor) }

  // ── Logo flotante encima de A1 (no ocupa filas lógicas) ───────────
  // Anchor por celdas: (col 0, row 0) a (col 2, row TOP_MARGIN_ROWS).
  // En Excel/Numbers/Sheets flota por encima del header sin desplazarlo.
  if (logoImageId !== null && logoImageId !== undefined) {
    try {
      ws.addImage(logoImageId, {
        tl: { col: 0, row: 0 },
        ext: { width: 56, height: 56 },
        editAs: 'oneCell',
      })
    } catch {
      // Si el entorno de ExcelJS no soporta addImage, ignoramos.
    }
  }

  // ── Impresión: horizontal, fit-to-width, repetir header, pie ─────
  ws.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,              // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:1',
    margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.25 },
  }
  // ExcelJS no respeta `BANDING_ROWS` como variable; TOP_MARGIN_ROWS
  // está aquí sólo como constante documental para que el logo flote.
  void TOP_MARGIN_ROWS
}

/**
 * Añade cabecera y pie de impresión (texto Carta Viva + nombre de
 * restaurante + periodo + número de página) a TODAS las hojas del
 * workbook. Se llama una vez desde `descargarWorkbook`.
 *
 * Códigos ExcelJS para headerFooter:
 *   &L / &C / &R      → alineación izq / centro / der
 *   &B                → negrita
 *   &KRRGGBB          → color
 *   &P / &N           → nº de página / total de páginas
 *
 * Soportado por Excel Desktop, Numbers y Google Sheets.
 */
export function aplicarHeaderFooter(wb, { restauranteNombre, periodo, hoy = new Date() } = {}) {
  const rest = (restauranteNombre || '').toString().slice(0, 60)
  const mes  = (periodo || '').toString().slice(0, 10)
  const fecha = hoy.toLocaleDateString('es-ES')
  const header =
    `&L&B&K${BRAND.wine} Carta Viva` +
    `&C&K${BRAND.textDark}${rest}${rest && mes ? ' · ' : ''}${mes}` +
    `&R&K${BRAND.textDark}Generado ${fecha}`
  const footer =
    `&L&K${BRAND.textDark}Carta Viva · Informe económico` +
    `&R&K${BRAND.textDark}Página &P de &N`
  wb.eachSheet(ws => {
    ws.headerFooter = { oddHeader: header, oddFooter: footer, differentFirst: false }
  })
}
