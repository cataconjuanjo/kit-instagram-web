'use client'

/**
 * Convierte una spec de excelSomm.js / informeEconomicoExcel.js en un
 * .xlsx real usando ExcelJS (dynamic import para no inflar el bundle
 * de las pantallas que no exportan). Dispara la descarga en el
 * navegador.
 *
 * El workbook recibe identidad Carta Viva via `app/lib/excelEstilos.js`:
 *   - Bloque de título superior (filas 1..BRANDING_ROWS) con logo
 *     anclado y textos (hoja + restaurante + periodo + fecha).
 *   - Cabecera, bandas, totales, pestañas y freeze bajo el header
 *     REAL de la tabla (fila BRANDING_ROWS+1).
 *   - Fórmulas desplazadas N filas via `desplazarFormula`, sin mutar
 *     la spec.
 *
 * Si la spec no trae `restauranteNombre`/`periodo` a nivel raíz, se
 * usan cadenas vacías (degradación limpia).
 */

import {
  aplicarHeaderFooter,
  cargarLogoBuffer,
  construirHojaConBranding,
  leerDimensionesPng,
} from './excelEstilos.js'

export async function descargarWorkbook(spec) {
  if (!spec || !spec.sheets || spec.sheets.length === 0) return
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Carta Viva'
  wb.created  = new Date()

  const logoBuffer = await cargarLogoBuffer()
  const logoImageId = (logoBuffer && typeof wb.addImage === 'function')
    ? wb.addImage({ buffer: logoBuffer, extension: 'png' })
    : null
  // Dimensiones REALES del PNG (IHDR). Si no se pudieron leer, el
  // builder caerá a un cuadrado 56×56 — mejor que estirar.
  const logoDims = logoBuffer ? leerDimensionesPng(logoBuffer) : null

  const restauranteNombre = spec.restauranteNombre || ''
  const periodo           = spec.periodo           || ''

  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name)
    try {
      construirHojaConBranding(ws, sheet, {
        logoImageId,
        logoDims,
        restauranteNombre,
        periodo,
      })
    } catch (err) {
      // Degradación: si el motor ExcelJS del entorno fallara con
      // addImage, mergeCells o pageSetup, construimos la hoja en
      // modo "plano" (sin branding) para no perder la descarga.
      console.warn('[excelSommDownload] construcción con branding falló, caigo a plain:', err?.message || err?.name)
      construirHojaPlana(ws, sheet)
    }
  }

  try {
    aplicarHeaderFooter(wb, { restauranteNombre, periodo })
  } catch { /* ignore */ }

  const buf  = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = spec.filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Fallback cuando `construirHojaConBranding` falla: replica el
 * comportamiento previo a la Fase de branding (sin bloque de título,
 * sin offset de fórmulas). Las fórmulas se escriben tal cual del
 * spec. Es la red de seguridad para no romper descargas.
 */
function construirHojaPlana(ws, sheet) {
  ws.columns = sheet.columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 12 }))
  for (const row of sheet.rows) ws.addRow(row)
  if (sheet.totals) {
    const tr = ws.addRow({})
    for (const [key, val] of Object.entries(sheet.totals)) {
      const cell = tr.getCell(key)
      if (val && typeof val === 'object' && typeof val.formula === 'string') {
        cell.value = { formula: val.formula, result: val.result }
      } else {
        cell.value = val
      }
    }
    tr.font = { bold: true }
  }
  for (const c of sheet.columns) {
    if (c.format) ws.getColumn(c.key).numFmt = c.format
  }
  ws.getRow(1).font = { bold: true }
  if (sheet.freezeHeader) {
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
}
