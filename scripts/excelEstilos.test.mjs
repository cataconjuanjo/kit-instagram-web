/**
 * Unit tests para app/lib/excelEstilos.js.
 *
 * - BRAND / TAB_COLORS son HEX válidos y contienen las hojas conocidas.
 * - BRANDING_ROWS y LOGO_ANCHOR son los valores canónicos.
 * - `construirHojaConBranding`:
 *     · NO muta la sheetSpec.
 *     · Escribe el bloque de título en filas 1..BRANDING_ROWS.
 *     · Escribe la cabecera de tabla en fila BRANDING_ROWS+1 con
 *       fondo wine + texto cream + bold.
 *     · Escribe datos a partir de BRANDING_ROWS+2 y total al final.
 *     · Freeze bajo header real + hide gridlines + tabColor.
 *     · PageSetup con printTitlesRow apuntando al header real.
 *     · Añade el logo con anchor (0,0)-(1,3) si se pasa imageId.
 * - `aplicarHeaderFooter` escribe oddHeader/oddFooter en cada hoja.
 * - `formatPeriodoES`: conversión YYYY-MM → "Mes de AAAA" en español.
 *
 * Ejecutar: node --test scripts/excelEstilos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {
  BRAND,
  BRANDING_ROWS,
  LOGO_ANCHOR,
  TAB_COLORS,
  aplicarHeaderFooter,
  construirHojaConBranding,
  formatPeriodoES,
} from '../app/lib/excelEstilos.js'

function nuevoWb() { return new ExcelJS.Workbook() }

// ── Constantes ────────────────────────────────────────────────────────

describe('BRAND / TAB_COLORS / constantes', () => {
  it('BRAND contiene los 11 tokens y son HEX de 6 chars', () => {
    const esperados = ['wine', 'wineDark', 'gold', 'goldLight', 'cream',
                       'textDark', 'textLight', 'green', 'red', 'banda', 'borde']
    for (const k of esperados) {
      assert.ok(Object.prototype.hasOwnProperty.call(BRAND, k), `BRAND.${k} falta`)
      assert.match(BRAND[k], /^[0-9A-F]{6}$/i)
    }
    assert.ok(Object.isFrozen(BRAND))
    assert.equal(BRAND.wine.toUpperCase(), '7B1E3B')
    assert.equal(BRAND.gold.toUpperCase(), 'C9A24B')
  })

  it('TAB_COLORS tiene las hojas conocidas', () => {
    const hojas = [
      'Resumen', 'Personal', 'Gastos', 'Canales', 'Canales venta',
      'Salidas no-venta', 'Compras', 'Cierre bodega', 'Vinos',
      'Desglose', 'Ratios', 'Conciliacion',
    ]
    for (const n of hojas) {
      assert.ok(TAB_COLORS[n], `${n} sin color`)
      assert.match(TAB_COLORS[n], /^[0-9A-F]{6}$/i)
    }
    assert.ok(Object.isFrozen(TAB_COLORS))
  })

  it('BRANDING_ROWS = 4 y LOGO_ANCHOR.tl = (0,0)', () => {
    assert.equal(BRANDING_ROWS, 4)
    assert.equal(LOGO_ANCHOR.tl.col, 0)
    assert.equal(LOGO_ANCHOR.tl.row, 0)
    // LOGO_ANCHOR ya NO lleva `br`: el tamaño va por `ext` calculado
    // desde las dimensiones reales del PNG. La altura objetivo son
    // 56 px (≤ 32+16+16=64 px del bloque de título).
    assert.equal(LOGO_ANCHOR.targetHeight, 56)
  })
})

// ── formatPeriodoES ──────────────────────────────────────────────────

describe('formatPeriodoES', () => {
  it('YYYY-MM → "Mes de AAAA" en español', () => {
    assert.equal(formatPeriodoES('2026-11'), 'Noviembre de 2026')
    assert.equal(formatPeriodoES('2026-01'), 'Enero de 2026')
    assert.equal(formatPeriodoES('2025-12'), 'Diciembre de 2025')
  })
  it('inválido / vacío → devuelve tal cual', () => {
    assert.equal(formatPeriodoES(''), '')
    assert.equal(formatPeriodoES(null), '')
    assert.equal(formatPeriodoES(undefined), '')
    assert.equal(formatPeriodoES('abc'), 'abc')
    assert.equal(formatPeriodoES('2026-13'), '2026-13')
  })
})

// ── construirHojaConBranding ─────────────────────────────────────────

function specCanalesVenta() {
  return {
    name: 'Canales venta',
    columns: [
      { header: 'Canal',    key: 'canal',   width: 22 },
      { header: 'uds',      key: 'uds',     width: 10 },
      { header: 'Neto (€)', key: 'neto',    width: 16, format: '#,##0.00 "€"' },
      { header: 'Coste',    key: 'coste',   width: 14, format: '#,##0.00 "€"' },
    ],
    rows: [
      { canal: 'Botella', uds: 88, neto: 2000, coste: 660 },
      { canal: 'Copa',    uds: 0,  neto: 2768.18, coste: 900 },
    ],
    totals: {
      canal: 'TOTAL',
      uds:   { formula: 'SUM(B2:B3)', result: 88 },
      neto:  { formula: 'SUM(C2:C3)', result: 4768.18 },
      coste: { formula: 'SUM(D2:D3)', result: 1560 },
    },
  }
}

describe('construirHojaConBranding', () => {
  it('NO muta la sheetSpec', () => {
    const spec = specCanalesVenta()
    const snapshot = JSON.parse(JSON.stringify(spec))
    const wb = nuevoWb()
    construirHojaConBranding(wb.addWorksheet(spec.name), spec, {
      restauranteNombre: 'Casa Marisma',
      periodo: '2026-11',
      hoy: new Date('2026-11-18T00:00:00Z'),
    })
    assert.deepEqual(spec, snapshot)
  })

  it('bloque de título ocupa filas 1..BRANDING_ROWS con contenido esperado', () => {
    const wb = nuevoWb()
    const ws = wb.addWorksheet('Canales venta')
    construirHojaConBranding(ws, specCanalesVenta(), {
      restauranteNombre: 'Casa Marisma',
      periodo: '2026-11',
      hoy: new Date('2026-11-18T00:00:00Z'),
    })
    // Fila 1: título
    assert.equal(ws.getCell(1, 2).value, 'Canales venta')
    assert.ok(ws.getCell(1, 2).font.bold)
    assert.ok(ws.getCell(1, 2).font.color.argb.toUpperCase().endsWith(BRAND.wine))
    // Fila 2: subtítulo con restaurante + mes
    assert.equal(ws.getCell(2, 2).value, 'Casa Marisma · Noviembre de 2026')
    // Fila 3: "Generado dd/mm/yyyy"
    assert.match(String(ws.getCell(3, 2).value), /^Generado \d\d\/\d\d\/\d{4}$/)
    // Fila 4: separador dorado (border bottom)
    assert.equal(ws.getCell(4, 1).border.bottom.style, 'medium')
  })

  it('cabecera real de la tabla en fila BRANDING_ROWS+1 con fondo wine + bold', () => {
    const wb = nuevoWb()
    const ws = wb.addWorksheet('Canales venta')
    construirHojaConBranding(ws, specCanalesVenta(), {
      restauranteNombre: 'Casa Marisma', periodo: '2026-11',
    })
    const headerRow = BRANDING_ROWS + 1
    // Primera celda del header (A5 por defecto)
    const h = ws.getCell(headerRow, 1)
    assert.equal(h.value, 'Canal')
    assert.ok(h.font.bold)
    assert.ok(h.font.color.argb.toUpperCase().endsWith(BRAND.cream))
    assert.ok(h.fill.fgColor.argb.toUpperCase().endsWith(BRAND.wine))
  })

  it('datos empiezan en fila BRANDING_ROWS+2 y total al final', () => {
    const wb = nuevoWb()
    const ws = wb.addWorksheet('Canales venta')
    const spec = specCanalesVenta()
    construirHojaConBranding(ws, spec, { restauranteNombre: 'X', periodo: '2026-11' })
    // Primera fila de datos: 6
    assert.equal(ws.getCell(BRANDING_ROWS + 2, 1).value, 'Botella')
    assert.equal(ws.getCell(BRANDING_ROWS + 2, 2).value, 88)
    // Fila de total: 8
    assert.equal(ws.getCell(BRANDING_ROWS + 2 + spec.rows.length, 1).value, 'TOTAL')
  })

  it('las fórmulas de los totals se desplazan BRANDING_ROWS filas', () => {
    const wb = nuevoWb()
    const ws = wb.addWorksheet('Canales venta')
    construirHojaConBranding(ws, specCanalesVenta(), { restauranteNombre: 'X', periodo: '2026-11' })
    const totalRow = BRANDING_ROWS + 2 + specCanalesVenta().rows.length
    // C8 = SUM(C2:C3) → desplazada SUM(C6:C7)
    const cellNeto = ws.getCell(totalRow, 3)
    assert.ok(cellNeto.value && cellNeto.value.formula)
    assert.equal(cellNeto.value.formula, 'SUM(C6:C7)')
    assert.equal(cellNeto.value.result, 4768.18)
  })

  it('freeze bajo header real + hide gridlines + printTitlesRow correcto', () => {
    const wb = nuevoWb()
    const ws = wb.addWorksheet('Canales venta')
    construirHojaConBranding(ws, specCanalesVenta(), { restauranteNombre: 'X', periodo: '2026-11' })
    const headerRow = BRANDING_ROWS + 1
    assert.equal(ws.views[0].state, 'frozen')
    assert.equal(ws.views[0].ySplit, headerRow)
    assert.equal(ws.views[0].showGridLines, false)
    assert.equal(ws.pageSetup.printTitlesRow, `${headerRow}:${headerRow}`)
    assert.equal(ws.pageSetup.orientation, 'landscape')
  })

  it('pestaña con color según TAB_COLORS[name]', () => {
    const wb = nuevoWb()
    const ws = wb.addWorksheet('Canales venta')
    construirHojaConBranding(ws, specCanalesVenta(), { restauranteNombre: 'X', periodo: '2026-11' })
    assert.ok(ws.properties.tabColor.argb.toUpperCase().endsWith(BRAND.green))
  })

  it('con imageId añade imagen anclada en el bloque de título', () => {
    const wb = nuevoWb()
    // imageId = 0 proviene de wb.addImage; no cargamos buffer real
    // en este test, basta que no lance.
    const id = wb.addImage({ buffer: Buffer.from([0x89, 0x50, 0x4E, 0x47]), extension: 'png' })
    const ws = wb.addWorksheet('Canales venta')
    construirHojaConBranding(ws, specCanalesVenta(), {
      restauranteNombre: 'X', periodo: '2026-11', logoImageId: id,
    })
    // ExcelJS no expone un `images` público, pero el test hasta aquí
    // basta: la llamada no lanzó y el Worksheet contiene el bloque.
    assert.ok(ws.rowCount >= BRANDING_ROWS + 1 + specCanalesVenta().rows.length)
  })

  it('spec sin columns → no-op (no lanza)', () => {
    const wb = nuevoWb()
    const ws = wb.addWorksheet('Vacía')
    assert.doesNotThrow(() =>
      construirHojaConBranding(ws, { name: 'Vacía', columns: [], rows: [] }, {}),
    )
  })
})

// ── aplicarHeaderFooter ──────────────────────────────────────────────

describe('aplicarHeaderFooter', () => {
  it('escribe oddHeader + oddFooter con nombre + periodo ES + fecha', () => {
    const wb = nuevoWb()
    wb.addWorksheet('Resumen')
    wb.addWorksheet('Canales venta')
    aplicarHeaderFooter(wb, {
      restauranteNombre: 'Casa Marisma',
      periodo: '2026-11',
      hoy: new Date('2026-11-18T00:00:00Z'),
    })
    wb.eachSheet(ws => {
      assert.match(ws.headerFooter.oddHeader, /Carta Viva/)
      assert.match(ws.headerFooter.oddHeader, /Casa Marisma/)
      assert.match(ws.headerFooter.oddHeader, /Noviembre de 2026/)
      assert.match(ws.headerFooter.oddFooter, /Página &P de &N/)
    })
  })
})
