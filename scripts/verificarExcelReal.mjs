/**
 * Verifica end-to-end: construye una spec con las funciones puras,
 * escribe un .xlsx real con ExcelJS y lo relee para comprobar que:
 *   - TOTAL es una fórmula (celda.formula o celda.value.formula)
 *   - celdas numéricas son number (no texto)
 *   - formato euro aplicado por columna
 *   - header en negrita + primera fila congelada
 * No usa DOM. Node + exceljs.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import {
  construirLibroWorkbook,
  construirComprasWorkbook,
  construirCierreWorkbook,
} from '../app/lib/excelSomm.js'

// Reproducción local del helper de descarga pero escribiendo a disco
async function specToBuffer(spec) {
  const wb = new ExcelJS.Workbook()
  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name)
    ws.columns = sheet.columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 12 }))
    for (const row of sheet.rows) ws.addRow(row)
    if (sheet.totals) {
      const tr = ws.addRow({})
      for (const [key, val] of Object.entries(sheet.totals)) {
        const cell = tr.getCell(key)
        if (val && typeof val === 'object' && typeof val.formula === 'string') {
          cell.value = { formula: val.formula }
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
    if (sheet.freezeHeader) ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  return await wb.xlsx.writeBuffer()
}

async function escribirYLeer(spec) {
  const buf = await specToBuffer(spec)
  const path = join(tmpdir(), `cv-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`)
  writeFileSync(path, Buffer.from(buf))
  const wb2 = new ExcelJS.Workbook()
  await wb2.xlsx.load(readFileSync(path))
  unlinkSync(path)
  return wb2
}

/** ExcelJS pierde column.key tras load(); buscamos la columna por header text. */
function colByHeader(ws, headerText) {
  const header = ws.getRow(1)
  for (let i = 1; i <= header.cellCount; i++) {
    if (header.getCell(i).value === headerText) return i
  }
  throw new Error(`Header no encontrado: "${headerText}"`)
}
function cellAt(ws, row, headerText) {
  return ws.getRow(row).getCell(colByHeader(ws, headerText))
}
function numFmtOf(ws, headerText) {
  // Tras load, numFmt vive en cada celda, no en getColumn por key.
  // Comprobamos la fila 2 (primer dato) de la columna.
  return cellAt(ws, 2, headerText).numFmt
}

// Fixtures
const vino = (over = {}) => ({
  nombre: 'Vino X', tipo: 'tinto', stock_ini: 10,
  entradas_u: 2, entradas_eur: 100,
  ventas_bot_u: 1, ventas_bot_eur: 20,
  ventas_copa_u: 1, copas_servidas_u: 5, ventas_copa_eur: 20,
  otras_salidas_u: 0, ajustes_u: 0, stock_fin: 10,
  coste_teorico_ventas: 30, consumo_real_stock: 32, diferencia_consumo: 2,
  coste_medio: 10, descuadre: 0, ...over,
})
const mesF = (mesK, vinos, estado = 'cerrado') => ({
  mes: mesK, estado, vinos,
  totales: {
    coste_teorico_ventas: vinos.reduce((s, v) => s + v.coste_teorico_ventas, 0),
    consumo_real_stock:   vinos.reduce((s, v) => s + v.consumo_real_stock,   0),
    diferencia_consumo:   vinos.reduce((s, v) => s + v.diferencia_consumo,   0),
  },
})

describe('Verificación end-to-end: .xlsx real', () => {
  it('libro: TOTAL del Resumen es FÓRMULA y los valores son number', async () => {
    const spec = construirLibroWorkbook({
      meses: [mesF('2026-01', [vino({ entradas_eur: 150.5 })]),
              mesF('2026-02', [vino({ entradas_eur: 200 }), vino({ entradas_eur: 50 })])],
      anio: 2026, restauranteNombre: 'Casa Marisma',
    })
    const wb = await escribirYLeer(spec)
    const ws = wb.getWorksheet('Resumen')
    const header = ws.getRow(1)
    assert.strictEqual(header.font?.bold, true, 'Header debe ser bold')
    const totalRow = ws.getRow(4)
    assert.strictEqual(totalRow.font?.bold, true, 'TOTAL debe ser bold')
    const cellCogs = cellAt(ws, 4, 'CoGS teórico (€)')
    assert.ok(cellCogs.value && typeof cellCogs.value === 'object' && cellCogs.value.formula,
      `TOTAL/CoGS teórico (€) debe ser fórmula; got ${JSON.stringify(cellCogs.value)}`)
    assert.ok(/^SUM\([A-Z]+2:[A-Z]+3\)$/.test(cellCogs.value.formula))
    assert.strictEqual(typeof cellAt(ws, 2, 'Vinos activos').value, 'number')
    assert.strictEqual(typeof cellAt(ws, 2, 'CoGS teórico (€)').value, 'number')
    assert.strictEqual(typeof cellAt(ws, 3, 'CoGS teórico (€)').value, 'number')
    assert.ok((ws.views || []).some(v => v.state === 'frozen' && v.ySplit === 1),
      `Debe tener primera fila congelada; got ${JSON.stringify(ws.views)}`)
    assert.strictEqual(numFmtOf(ws, 'CoGS teórico (€)'), '#,##0.00 €')
  })

  it('libro: hoja del mes tiene fila TOTAL con fórmula y numFmt', async () => {
    const spec = construirLibroWorkbook({
      meses: [mesF('2026-05', [vino(), vino(), vino()])],
      anio: 2026, restauranteNombre: 'X',
    })
    const wb = await escribirYLeer(spec)
    const ws = wb.getWorksheet('2026-05')
    const cellEntradasEur = cellAt(ws, 5, 'Entradas (€)')
    assert.ok(cellEntradasEur.value?.formula,
      `TOTAL Entradas (€) debe ser fórmula; got ${JSON.stringify(cellEntradasEur.value)}`)
    assert.ok(/^SUM\([A-Z]+2:[A-Z]+4\)$/.test(cellEntradasEur.value.formula))
    assert.strictEqual(typeof cellAt(ws, 2, 'Entradas (€)').value, 'number')
    assert.strictEqual(numFmtOf(ws, 'Entradas (€)'), '#,##0.00 €')
    assert.strictEqual(numFmtOf(ws, 'Stock inicial'), '#,##0')
  })

  it('compras: TOTAL con fórmula SUM y valores number', async () => {
    const registros = [{
      id: 1, proveedor: 'Bodega A', periodo: '2026-01',
      facturas: [
        { fecha: '2026-01-05', importe: 500, albaran: 'A1' },
        { fecha: '2026-01-20', importe: 300.75, albaran: 'A2' },
      ],
    }]
    const spec = construirComprasWorkbook({ registros, periodoFiltro: '2026-01', restauranteNombre: 'Taberna del Puerto' })
    assert.strictEqual(spec.filename, 'taberna-del-puerto-compras-2026-01.xlsx')
    const wb = await escribirYLeer(spec)
    const ws = wb.getWorksheet('2026-01')
    const total = cellAt(ws, 4, 'Importe (€)')
    assert.ok(total.value?.formula)
    assert.ok(/^SUM\([A-Z]+2:[A-Z]+3\)$/.test(total.value.formula))
    assert.strictEqual(typeof cellAt(ws, 2, 'Importe (€)').value, 'number')
    assert.strictEqual(cellAt(ws, 2, 'Importe (€)').value, 500)
    assert.strictEqual(cellAt(ws, 3, 'Importe (€)').value, 300.75)
    assert.strictEqual(numFmtOf(ws, 'Importe (€)'), '#,##0.00 €')
  })

  it('cierre: hoja Vinos con fórmulas SUM y Resumen con 11 filas', async () => {
    const datos = {
      iva_pct: 10, ventas_bruto: 5000, ventas_neto: 4545.45,
      coste_ventas_teorico: 1600, margen_bruto: 2945.45,
      compras_netas: 1800, salidas_no_venta: 50,
      merma_copa_eur: 20, diferencias_inventario: -10,
      gastos_total: 1200, resultado: 1715.45,
      informe: { por_vino: [
        { vino_id: 'v1', nombre: 'A', uds: 10, copas: 50, ingresos: 500, coste_unitario: 5, margen_pct: 60, tiene_coste: true },
        { vino_id: 'v2', nombre: 'B', uds: 5,  copas: 20, ingresos: 300, coste_unitario: 8, margen_pct: 55, tiene_coste: true },
      ]},
    }
    const spec = construirCierreWorkbook({ datos, mes: '2026-01', restauranteNombre: 'Casa Marisma' })
    const wb = await escribirYLeer(spec)
    const resumen = wb.getWorksheet('Resumen')
    const vinos = wb.getWorksheet('Vinos')
    assert.ok(resumen && vinos)
    assert.strictEqual(resumen.actualRowCount, 12)  // header + 11 filas
    // ventas_bruto está en la fila 3 (fila 2 = Mes string)
    assert.strictEqual(typeof cellAt(resumen, 3, 'Valor').value, 'number')
    assert.strictEqual(cellAt(resumen, 3, 'Valor').value, 5000)
    // Vinos TOTAL fórmulas
    assert.ok(cellAt(vinos, 4, 'Botellas vendidas').value?.formula)
    assert.ok(cellAt(vinos, 4, 'Copas servidas').value?.formula)
    assert.ok(cellAt(vinos, 4, 'Ingresos (€ brutos)').value?.formula)
    assert.strictEqual(typeof cellAt(vinos, 2, 'Ingresos (€ brutos)').value, 'number')
    assert.strictEqual(cellAt(vinos, 2, 'Ingresos (€ brutos)').value, 500)
    assert.strictEqual(numFmtOf(vinos, 'Ingresos (€ brutos)'), '#,##0.00 €')
    assert.ok((vinos.views || []).some(v => v.state === 'frozen'))
  })

  it('empty: libro sin meses → sheets vacío → helper no genera workbook', async () => {
    const spec = construirLibroWorkbook({ meses: [], anio: 2026, restauranteNombre: 'X' })
    assert.strictEqual(spec.sheets.length, 0)
    assert.strictEqual(spec.empty, true)
    // Nombre consistente aunque esté vacío (botón se desactiva en UI, no se descarga)
    assert.strictEqual(spec.filename, 'x-libro-2026.xlsx')
  })
})
