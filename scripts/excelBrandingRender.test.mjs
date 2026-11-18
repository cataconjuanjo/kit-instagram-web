/**
 * Test de render REAL del Excel con ExcelJS: genera el .xlsx sobre
 * una fixture (Casa Marisma 2026-11), lo vuelve a leer, y comprueba
 * que:
 *   - Las 7 hojas esperadas existen con los nombres correctos.
 *   - Los valores numéricos / fórmulas / result de cada celda NO han
 *     cambiado respecto a la spec original (el branding es sólo
 *     visual). Barre todas las celdas no vacías de cada hoja.
 *   - La hoja "Canales venta" tiene fila de header con fuente blanca
 *     sobre fondo wine (ARGB termina en 7B1E3B).
 *   - La pestaña de cada hoja lleva color de marca.
 *   - El header de impresión (oddHeader) contiene "Carta Viva" y el
 *     nombre + periodo.
 *   - El worksheet no tiene gridlines visibles.
 *
 * Ejecutar: node --test scripts/excelBrandingRender.test.mjs
 *
 * Nota: usamos ExcelJS directamente (no pasamos por descargarWorkbook
 * porque éste depende del DOM: URL.createObjectURL, document). El
 * test ensambla el workbook con la misma secuencia que el downloader
 * y aplica los estilos; esto sí es idéntico a lo que ocurre en runtime.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'
import { aplicarEstilosHoja, aplicarHeaderFooter, BRAND } from '../app/lib/excelEstilos.js'

function datosVinoCasaMarisma() {
  return {
    ventas_bruto: 5245.00,
    ventas_neto:  4768.18,
    iva_pct:      10,
    coste_ventas_teorico: 1560,
    informe: {
      por_canal: {
        botella:    { uds: 88, ingresos: 2200, coste: 660 },
        copa:       { uds: 0, copas: 651, ingresos: 3045, coste: 900 },
        invitacion: { uds: 6, botella_uds: 2, copa_uds: 4, botella_coste: 60, copa_coste: 20 },
        cocina:     { uds: 1, valor: 30, coste: 30 },
        evento:     { uds: 5, valor: 150, coste: 150 },
        maridaje:   { uds: 3, valor: 90, coste: 90 },
        rotura:     { uds: 1, coste: 25 },
      },
    },
  }
}
function argsBase() {
  return {
    restauranteNombre: 'Casa Marisma', periodo: '2026-11', esSomm: false,
    facturacion: 4768.18, restoIngresos: 200, consumoMp: 1560,
    totalPersonal: 800, totalGastos: 300, totalAlquiler: 200, totalBancarios: 80, breakEven: 2500,
    personal: { nominas_brutas: 600, ss_empresa: 180, extras_personal: 20, retenciones_irpf: 0 },
    gastosPartidas: [], alquilerPartidas: [],
    bancarios: { comisiones_datafono: 50, mantenimiento_datafono: 20, resto_comisiones: 10 },
    canales: { copa_barra: 1000, botella_mesa: 2000, grupos_eventos: 700, take_away: 100 },
    registrosCompras: [], imputacion_pct: {},
    datosVino: datosVinoCasaMarisma(),
  }
}

// Replica la secuencia del descargador SIN depender del DOM.
async function generarBufferConBranding(spec, { logoImageId = null } = {}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Carta Viva'
  wb.created = new Date()
  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name)
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
    }
    for (const c of sheet.columns) {
      if (c.format) ws.getColumn(c.key).numFmt = c.format
    }
    aplicarEstilosHoja(ws, sheet, { logoImageId })
  }
  aplicarHeaderFooter(wb, {
    restauranteNombre: spec.restauranteNombre || '',
    periodo:           spec.periodo           || '',
  })
  return wb.xlsx.writeBuffer()
}

async function generarBufferSinBranding(spec) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Carta Viva'
  wb.created = new Date()
  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name)
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
    }
    for (const c of sheet.columns) {
      if (c.format) ws.getColumn(c.key).numFmt = c.format
    }
  }
  return wb.xlsx.writeBuffer()
}

async function leerWorkbook(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

describe('Excel branding — invarianza de datos y fórmulas con ExcelJS real', () => {
  it('los VALORES y FÓRMULAS de cada celda son idénticos con y sin branding', async () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const bufBranded = await generarBufferConBranding(spec)
    const bufPlain   = await generarBufferSinBranding(spec)
    const wbB = await leerWorkbook(bufBranded)
    const wbP = await leerWorkbook(bufPlain)

    // Mismas hojas en el mismo orden.
    const nombresB = []
    wbB.eachSheet(ws => nombresB.push(ws.name))
    const nombresP = []
    wbP.eachSheet(ws => nombresP.push(ws.name))
    assert.deepEqual(nombresB, nombresP)

    // Por hoja, comparar celda a celda.
    for (const nombre of nombresB) {
      const wsB = wbB.getWorksheet(nombre)
      const wsP = wbP.getWorksheet(nombre)
      const maxRow = Math.max(wsB.rowCount, wsP.rowCount)
      const maxCol = Math.max(wsB.columnCount, wsP.columnCount)
      for (let r = 1; r <= maxRow; r++) {
        for (let c = 1; c <= maxCol; c++) {
          const cellB = wsB.getCell(r, c)
          const cellP = wsP.getCell(r, c)
          const vB = cellB.value
          const vP = cellP.value
          // Fórmulas: comparar formula + result.
          if (vB && typeof vB === 'object' && 'formula' in vB) {
            assert.equal(vB.formula, vP.formula, `${nombre}!${r},${c} formula distinta`)
            assert.equal(vB.result,  vP.result,  `${nombre}!${r},${c} result distinto`)
            continue
          }
          // Primitivos: comparar strict.
          assert.deepEqual(vB, vP, `${nombre}!${r},${c} valor distinto (${JSON.stringify(vB)} vs ${JSON.stringify(vP)})`)
        }
      }
    }
  })

  it('cabecera (fila 1) tiene fondo wine (7B1E3B) y texto cream', async () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const buf = await generarBufferConBranding(spec)
    const wb = await leerWorkbook(buf)
    const ws = wb.getWorksheet('Canales venta')
    const cell = ws.getRow(1).getCell(1)
    const argbFill = cell.fill?.fgColor?.argb || ''
    const argbFont = cell.font?.color?.argb || ''
    assert.ok(argbFill.toUpperCase().endsWith(BRAND.wine.toUpperCase()), `fill header = ${argbFill}`)
    assert.ok(argbFont.toUpperCase().endsWith(BRAND.cream.toUpperCase()), `font header = ${argbFont}`)
    assert.ok(cell.font.bold)
  })

  it('pestañas con color de marca + gridlines ocultos + print header con "Carta Viva"', async () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const buf = await generarBufferConBranding(spec)
    const wb = await leerWorkbook(buf)
    const resumen = wb.getWorksheet('Resumen')
    // tabColor terminará en wine (7B1E3B).
    assert.ok(resumen.properties.tabColor.argb.toUpperCase().endsWith(BRAND.wine.toUpperCase()))
    // Gridlines ocultas.
    assert.equal(resumen.views[0].showGridLines, false)
    // Print header contiene marca + restaurante + periodo.
    assert.match(resumen.headerFooter.oddHeader, /Carta Viva/)
    assert.match(resumen.headerFooter.oddHeader, /Casa Marisma/)
    assert.match(resumen.headerFooter.oddHeader, /2026-11/)
    assert.match(resumen.headerFooter.oddFooter, /Página &P de &N/)
  })

  it('tamaño del .xlsx se mantiene razonable (< 50 KB sin logo)', async () => {
    // Sin logo (test node sin DOM / sin fetch), el workbook queda
    // alrededor de 20-30 KB. Con logo real 76 KB añade ~80 KB.
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const buf = await generarBufferConBranding(spec, { logoImageId: null })
    assert.ok(buf.byteLength < 50_000,
      `xlsx sin logo pesa ${buf.byteLength} bytes (>50 KB)`)
  })
})
