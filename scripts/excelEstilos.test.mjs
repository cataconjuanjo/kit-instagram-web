/**
 * Unit tests para app/lib/excelEstilos.js.
 *
 * - Verifica que BRAND / TAB_COLORS son HEX válidos y contienen las
 *   hojas conocidas del informe económico.
 * - Verifica que `aplicarEstilosHoja` NO muta la `sheetSpec` (filas,
 *   fórmulas, totales, columnas): el branding es puramente visual.
 * - Verifica que `aplicarHeaderFooter` escribe oddHeader/oddFooter en
 *   todas las hojas del workbook sin tocar celdas.
 *
 * Simulamos ExcelJS con objetos "shim" minimalistas; los tests no
 * cargan ExcelJS real porque el objetivo es validar PURO JS.
 * Ejecutar: node --test scripts/excelEstilos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BRAND,
  TAB_COLORS,
  aplicarEstilosHoja,
  aplicarHeaderFooter,
} from '../app/lib/excelEstilos.js'

// ── Shim mínimo de ExcelJS Worksheet/Workbook ─────────────────────────

function shimCell() {
  return { value: null, font: null, fill: null, alignment: null, border: null, numFmt: null }
}
function shimRow(ncols) {
  const cells = Array.from({ length: ncols }, shimCell)
  return {
    height: null,
    font: null,
    getCell(i) { return cells[i - 1] || (cells[i - 1] = shimCell()) },
    eachCell(opts, fn) {
      if (typeof opts === 'function') { fn = opts; opts = {} }
      cells.forEach((c, i) => fn(c, i + 1))
    },
  }
}
function shimCol() { return { width: 12, alignment: null, numFmt: null } }

function shimSheet(name, ncols = 4, nrows = 3, { totals = true } = {}) {
  const rows = Array.from({ length: 1 + nrows + (totals ? 1 : 0) }, () => shimRow(ncols))
  const cols = Array.from({ length: ncols }, shimCol)
  return {
    name,
    properties: {},
    views: null,
    pageSetup: null,
    headerFooter: null,
    images: [],
    getRow(i) { return rows[i - 1] || (rows[i - 1] = shimRow(ncols)) },
    getColumn(i) { return cols[i - 1] || (cols[i - 1] = shimCol()) },
    addImage(id, anchor) { this.images.push({ id, anchor }) },
    eachSheet() { /* overridden at workbook level */ },
  }
}
function shimWorkbook(sheets = []) {
  return {
    sheets,
    eachSheet(fn) { sheets.forEach(fn) },
  }
}

// ── BRAND / TAB_COLORS ────────────────────────────────────────────────

describe('BRAND — paleta Carta Viva', () => {
  it('contiene los 10 tokens esperados y son HEX de 6 chars', () => {
    const esperados = ['wine', 'wineDark', 'gold', 'goldLight', 'cream',
                       'textDark', 'textLight', 'green', 'red', 'banda', 'borde']
    for (const k of esperados) {
      assert.ok(Object.prototype.hasOwnProperty.call(BRAND, k), `BRAND.${k} falta`)
      assert.match(BRAND[k], /^[0-9A-F]{6}$/i, `BRAND.${k} = "${BRAND[k]}" no es HEX`)
    }
    assert.ok(Object.isFrozen(BRAND))
  })
  it('wine coincide con --cv-wine del CSS', () => {
    assert.equal(BRAND.wine.toUpperCase(), '7B1E3B')
  })
  it('gold coincide con --cv-gold del CSS', () => {
    assert.equal(BRAND.gold.toUpperCase(), 'C9A24B')
  })
})

describe('TAB_COLORS — pestañas por hoja', () => {
  const HOJAS_CONOCIDAS = [
    'Resumen', 'Personal', 'Gastos', 'Canales', 'Canales venta',
    'Salidas no-venta', 'Compras', 'Cierre bodega', 'Vinos',
    'Desglose', 'Ratios', 'Conciliacion',
  ]
  it('todas las hojas de informe/cierre tienen color asignado', () => {
    for (const nombre of HOJAS_CONOCIDAS) {
      assert.ok(TAB_COLORS[nombre], `${nombre} sin color`)
      assert.match(TAB_COLORS[nombre], /^[0-9A-F]{6}$/i)
    }
    assert.ok(Object.isFrozen(TAB_COLORS))
  })
})

// ── aplicarEstilosHoja — pureza respecto a la spec ────────────────────

describe('aplicarEstilosHoja', () => {
  it('estiliza header, bandas y totales sin mutar la spec', () => {
    const spec = {
      name: 'Canales venta',
      columns: [
        { header: 'Canal',    key: 'canal',   width: 22 },
        { header: 'Neto (€)', key: 'neto',    width: 16, format: '#,##0.00 "€"' },
        { header: 'Coste (€)', key: 'coste',  width: 16, format: '#,##0.00 "€"' },
      ],
      rows:   [{ canal: 'A', neto: 1000, coste: 400 }, { canal: 'B', neto: 500, coste: 200 }],
      totals: { canal: 'TOTAL', neto: { formula: 'SUM(B2:B3)', result: 1500 }, coste: { formula: 'SUM(C2:C3)', result: 600 } },
    }
    const specSnapshot = JSON.parse(JSON.stringify(spec))
    const ws = shimSheet('Canales venta', 3, 2)
    aplicarEstilosHoja(ws, spec, { logoImageId: 42 })
    // La spec no se modifica.
    assert.deepEqual(spec, specSnapshot)
    // Header fila 1: fondo wine, texto cream, bold.
    const h = ws.getRow(1).getCell(1)
    assert.ok(h.font && h.font.bold)
    assert.ok(h.font.color.argb.endsWith(BRAND.cream))
    assert.ok(h.fill.fgColor.argb.endsWith(BRAND.wine))
    // Alineación: columnas numéricas (neto/coste) a la derecha.
    assert.equal(ws.getColumn(2).alignment.horizontal, 'right')
    assert.equal(ws.getColumn(3).alignment.horizontal, 'right')
    // Fila total (row 4): fondo goldLight + bold + borde top medium.
    const totalCell = ws.getRow(4).getCell(1)
    assert.ok(totalCell.font.bold)
    assert.ok(totalCell.fill.fgColor.argb.endsWith(BRAND.goldLight))
    assert.equal(totalCell.border.top.style, 'medium')
    // Freeze bajo header + gridlines ocultas.
    assert.equal(ws.views[0].state, 'frozen')
    assert.equal(ws.views[0].ySplit, 1)
    assert.equal(ws.views[0].showGridLines, false)
    // Color de pestaña = green (Canales venta).
    assert.ok(ws.properties.tabColor.argb.endsWith(BRAND.green))
    // Logo añadido con imageId 42, anchor arriba a la izquierda.
    assert.equal(ws.images.length, 1)
    assert.equal(ws.images[0].id, 42)
    assert.equal(ws.images[0].anchor.tl.col, 0)
    assert.equal(ws.images[0].anchor.tl.row, 0)
    // pageSetup + printTitlesRow 1:1.
    assert.equal(ws.pageSetup.orientation, 'landscape')
    assert.equal(ws.pageSetup.fitToWidth, 1)
    assert.equal(ws.pageSetup.printTitlesRow, '1:1')
  })

  it('sin logoImageId NO añade imagen pero el resto de estilos sí', () => {
    const spec = {
      name: 'Resumen',
      columns: [
        { header: 'Concepto', key: 'concepto', width: 30 },
        { header: 'Valor',    key: 'valor',    width: 14, format: '#,##0.00 "€"' },
      ],
      rows:   [{ concepto: 'A', valor: 100 }],
      totals: null,
    }
    const ws = shimSheet('Resumen', 2, 1, { totals: false })
    aplicarEstilosHoja(ws, spec, { logoImageId: null })
    assert.equal(ws.images.length, 0)
    assert.ok(ws.views[0].showGridLines === false)
    assert.ok(ws.properties.tabColor.argb.endsWith(BRAND.wine))   // tab Resumen
  })

  it('spec sin columns → no-op (no lanza)', () => {
    const ws = shimSheet('Vacía', 0, 0, { totals: false })
    assert.doesNotThrow(() => aplicarEstilosHoja(ws, { name: 'Vacía', columns: [], rows: [] }, {}))
  })

  it('negativos en celdas numéricas → color rojo en la fuente', () => {
    const spec = {
      name: 'Resumen',
      columns: [
        { header: 'Concepto', key: 'concepto', width: 22 },
        { header: 'Valor',    key: 'valor',    width: 14, format: '#,##0.00 "€"' },
      ],
      rows:   [{ concepto: 'Pérdida', valor: -250 }],
      totals: null,
    }
    const ws = shimSheet('Resumen', 2, 1, { totals: false })
    ws.getRow(2).getCell(2).value = -250
    aplicarEstilosHoja(ws, spec, {})
    const cell = ws.getRow(2).getCell(2)
    assert.ok(cell.font && cell.font.color)
    assert.ok(cell.font.color.argb.endsWith(BRAND.red))
  })
})

// ── aplicarHeaderFooter ──────────────────────────────────────────────

describe('aplicarHeaderFooter', () => {
  it('escribe oddHeader y oddFooter en cada hoja con nombre + periodo + fecha', () => {
    const sheets = [shimSheet('Resumen'), shimSheet('Canales venta')]
    const wb = shimWorkbook(sheets)
    aplicarHeaderFooter(wb, {
      restauranteNombre: 'Casa Marisma',
      periodo: '2026-11',
      hoy: new Date('2026-11-18T00:00:00Z'),
    })
    for (const ws of sheets) {
      assert.ok(ws.headerFooter)
      assert.match(ws.headerFooter.oddHeader, /Carta Viva/)
      assert.match(ws.headerFooter.oddHeader, /Casa Marisma/)
      assert.match(ws.headerFooter.oddHeader, /2026-11/)
      assert.match(ws.headerFooter.oddFooter, /Página &P de &N/)
    }
  })

  it('sin restaurante/periodo → el header no se rompe (campos vacíos)', () => {
    const sheets = [shimSheet('Resumen')]
    const wb = shimWorkbook(sheets)
    aplicarHeaderFooter(wb, { hoy: new Date('2026-11-18T00:00:00Z') })
    assert.match(sheets[0].headerFooter.oddHeader, /Carta Viva/)
  })

  it('no toca celdas (sólo .headerFooter)', () => {
    const sheets = [shimSheet('Resumen')]
    const wb = shimWorkbook(sheets)
    const snapshotCellA1 = sheets[0].getRow(1).getCell(1)
    aplicarHeaderFooter(wb, { restauranteNombre: 'X', periodo: '2026-01' })
    assert.equal(sheets[0].getRow(1).getCell(1), snapshotCellA1)
  })
})
