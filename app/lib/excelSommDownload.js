'use client'

/**
 * Convierte una spec de excelSomm.js en un .xlsx real usando ExcelJS
 * (dynamic import para no inflar el bundle de las pantallas que no
 * exportan). Dispara la descarga en el navegador.
 *
 * El workbook recibe identidad Carta Viva via `app/lib/excelEstilos.js`:
 * logo flotante, cabecera coloreada, bandas alternas, totales en
 * dorado, pestañas, print header/footer con nombre + periodo. La
 * spec en sí NO se modifica (filas, fórmulas, totales conservan
 * referencias originales).
 */

import { aplicarEstilosHoja, aplicarHeaderFooter, cargarLogoBuffer } from './excelEstilos.js'

export async function descargarWorkbook(spec) {
  if (!spec || !spec.sheets || spec.sheets.length === 0) return
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Carta Viva'
  wb.created  = new Date()

  // Logo diferido: 1 fetch por descarga, se reutiliza en cada hoja
  // via `addImage` (ExcelJS deduplica por imageId). Si falla la carga
  // (fuera de línea, test sin DOM, 404…), seguimos sin logo.
  const logoBuffer = await cargarLogoBuffer()
  const logoImageId = (logoBuffer && typeof wb.addImage === 'function')
    ? wb.addImage({ buffer: logoBuffer, extension: 'png' })
    : null

  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name)
    ws.columns = sheet.columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 12 }))

    // Datos
    for (const row of sheet.rows) ws.addRow(row)

    // Totales como FÓRMULA con RESULT precalculado: la fórmula es la fuente
    // de verdad (se recalcula al abrir en Excel); el result sirve para que
    // Numbers/LibreOffice/preview muestren el valor sin recalcular.
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
      // El fondo/borde definitivos se aplican en aplicarEstilosHoja;
      // aquí dejamos sólo el bold de compatibilidad por si fallara el
      // módulo de estilos (degradación segura).
      tr.font = { bold: true }
    }

    // Formatos numéricos por columna (antes de los estilos, para que
    // las alineaciones del módulo detecten el numFmt).
    for (const c of sheet.columns) {
      if (c.format) ws.getColumn(c.key).numFmt = c.format
    }

    // Branding Carta Viva (burdeos + dorado + crema, pestañas, logo
    // flotante, bandas, totales, freeze, hide gridlines, pageSetup).
    try {
      aplicarEstilosHoja(ws, sheet, { logoImageId })
    } catch (err) {
      // Si el motor ExcelJS del entorno fallara con addImage o
      // alguna propiedad, el workbook se entrega sin branding pero
      // con datos intactos.
      console.warn('[excelSommDownload] estilos no aplicados:', err?.message || err?.name)
    }
  }

  // Print header + footer con nombre del restaurante y periodo (si
  // la spec los expone a nivel raíz — opcional).
  try {
    aplicarHeaderFooter(wb, {
      restauranteNombre: spec.restauranteNombre || '',
      periodo:           spec.periodo           || '',
    })
  } catch { /* seguir sin header/footer */ }

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
