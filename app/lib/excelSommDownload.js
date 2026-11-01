'use client'

/**
 * Convierte una spec de excelSomm.js en un .xlsx real usando ExcelJS
 * (dynamic import para no inflar el bundle de las pantallas que no
 * exportan). Dispara la descarga en el navegador.
 */

export async function descargarWorkbook(spec) {
  if (!spec || !spec.sheets || spec.sheets.length === 0) return
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Carta Viva'
  wb.created  = new Date()

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
      tr.font = { bold: true }
      tr.eachCell(c => { c.border = { top: { style: 'thin' } } })
    }

    // Formatos numéricos por columna
    for (const c of sheet.columns) {
      if (c.format) ws.getColumn(c.key).numFmt = c.format
    }

    // Header bold + congelado
    ws.getRow(1).font = { bold: true }
    if (sheet.freezeHeader) {
      ws.views = [{ state: 'frozen', ySplit: 1 }]
    }
  }

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
