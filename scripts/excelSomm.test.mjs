/**
 * Tests de las funciones puras de app/lib/excelSomm.js.
 * No usan ExcelJS; solo verifican la estructura de spec.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirLibroWorkbook,
  construirComprasWorkbook,
  construirCierreWorkbook,
  filtrarMesesLibro,
  filasComprasVisibles,
  slugRestaurante,
  colLetter,
} from '../app/lib/excelSomm.js'

// ── Helpers de fixtures ──────────────────────────────────────────────────────

function vino(over = {}) {
  return {
    nombre: 'Vino X', tipo: 'tinto',
    stock_ini: 10, entradas_u: 2, entradas_eur: 100,
    ventas_bot_u: 1, ventas_bot_eur: 20,
    ventas_copa_u: 1, copas_servidas_u: 5, ventas_copa_eur: 20,
    otras_salidas_u: 0, ajustes_u: 0, stock_fin: 10,
    coste_teorico_ventas: 30, consumo_real_stock: 32, diferencia_consumo: 2,
    coste_medio: 10, descuadre: 0, ...over,
  }
}

function mes(mesK, vinos, estado = 'cerrado', totales = {}) {
  return {
    mes: mesK, estado, vinos,
    totales: {
      coste_teorico_ventas: vinos.reduce((s, v) => s + v.coste_teorico_ventas, 0),
      consumo_real_stock:   vinos.reduce((s, v) => s + v.consumo_real_stock,   0),
      diferencia_consumo:   vinos.reduce((s, v) => s + v.diferencia_consumo,   0),
      ...totales,
    },
  }
}

// ── Helpers puros ────────────────────────────────────────────────────────────

describe('slugRestaurante', () => {
  it('normaliza acentos y espacios', () => {
    assert.strictEqual(slugRestaurante('Sumiller Casa Marisma'), 'sumiller-casa-marisma')
    assert.strictEqual(slugRestaurante('Taberna del Puerto'),    'taberna-del-puerto')
    assert.strictEqual(slugRestaurante('Café Español'),          'cafe-espanol')
    assert.strictEqual(slugRestaurante('  --Foo  '),             'foo')
  })
  it('vacío o inválido → fallback', () => {
    assert.strictEqual(slugRestaurante(''),        'restaurante')
    assert.strictEqual(slugRestaurante(null),      'restaurante')
    assert.strictEqual(slugRestaurante('---'),     'restaurante')
  })
})

describe('colLetter', () => {
  it('1→A, 2→B, 26→Z, 27→AA', () => {
    assert.strictEqual(colLetter(1),  'A')
    assert.strictEqual(colLetter(2),  'B')
    assert.strictEqual(colLetter(26), 'Z')
    assert.strictEqual(colLetter(27), 'AA')
    assert.strictEqual(colLetter(28), 'AB')
    assert.strictEqual(colLetter(52), 'AZ')
  })
})

// ── Libro de bodega ──────────────────────────────────────────────────────────

describe('construirLibroWorkbook', () => {
  it('empty: sin meses con datos → sheets vacío + flag empty', () => {
    const spec = construirLibroWorkbook({ meses: [], anio: 2026, restauranteNombre: 'Test' })
    assert.deepStrictEqual(spec.sheets, [])
    assert.strictEqual(spec.empty, true)
    assert.strictEqual(spec.filename, 'test-libro-2026.xlsx')
  })

  it('un mes con 2 vinos: hoja Resumen + hoja del mes', () => {
    const spec = construirLibroWorkbook({
      meses: [mes('2026-01', [vino({ nombre: 'A' }), vino({ nombre: 'B' })])],
      anio: 2026, restauranteNombre: 'Casa Marisma',
    })
    assert.strictEqual(spec.sheets.length, 2)
    assert.strictEqual(spec.sheets[0].name, 'Resumen')
    assert.strictEqual(spec.sheets[1].name, '2026-01')
  })

  it('TOTAL del Resumen contiene FÓRMULAS, no valores precalculados', () => {
    const spec = construirLibroWorkbook({
      meses: [mes('2026-01', [vino()]), mes('2026-02', [vino(), vino()])],
      anio: 2026, restauranteNombre: 'X',
    })
    const resumen = spec.sheets[0]
    const t = resumen.totals
    assert.strictEqual(t.mes, 'TOTAL')
    assert.ok(t.coste_teorico_ventas && typeof t.coste_teorico_ventas === 'object',
      'coste_teorico_ventas debe ser objeto {formula}')
    assert.ok(/^SUM\([A-Z]+2:[A-Z]+3\)$/.test(t.coste_teorico_ventas.formula),
      `fórmula esperada tipo SUM(X2:X3), got ${t.coste_teorico_ventas.formula}`)
    assert.ok(t.consumo_real_stock.formula.startsWith('SUM('))
    assert.ok(t.diferencia_consumo.formula.startsWith('SUM('))
  })

  it('TOTAL por mes: fórmula SUM que cubre todas las filas del mes', () => {
    const vinos3 = [vino(), vino(), vino()]
    const spec = construirLibroWorkbook({
      meses: [mes('2026-05', vinos3)], anio: 2026, restauranteNombre: 'X',
    })
    const mesSheet = spec.sheets[1]
    assert.strictEqual(mesSheet.rows.length, 3)
    const t = mesSheet.totals
    assert.strictEqual(t.nombre, 'TOTAL')
    // Range filas 2..4 (header=1, 3 datos)
    assert.ok(/^SUM\([A-Z]+2:[A-Z]+4\)$/.test(t.entradas_u.formula))
    assert.ok(/^SUM\([A-Z]+2:[A-Z]+4\)$/.test(t.ventas_bot_eur.formula))
  })

  it('filtroMes limita a 1 solo mes (si tiene datos)', () => {
    const spec = construirLibroWorkbook({
      meses: [mes('2026-01', [vino()]), mes('2026-02', [vino()])],
      anio: 2026, filtroMes: '2026-02', restauranteNombre: 'X',
    })
    assert.strictEqual(spec.sheets.length, 2)  // Resumen + 1 mes
    assert.strictEqual(spec.sheets[1].name, '2026-02')
    assert.strictEqual(spec.filename, 'x-libro-2026-02.xlsx')
  })

  it('filtroTipo filtra vinos por tipo (omite mes sin vinos del tipo)', () => {
    const spec = construirLibroWorkbook({
      meses: [
        mes('2026-01', [vino({ tipo: 'tinto' }), vino({ tipo: 'blanco' })]),
        mes('2026-02', [vino({ tipo: 'blanco' })]),  // sin tintos → se omite
      ],
      anio: 2026, filtroTipo: 'tinto', restauranteNombre: 'X',
    })
    assert.strictEqual(spec.sheets.length, 2)  // Resumen + 2026-01
    assert.strictEqual(spec.sheets[1].name, '2026-01')
    assert.strictEqual(spec.sheets[1].rows.length, 1)  // solo tinto
  })

  it('valores numéricos NO son texto en las filas', () => {
    const spec = construirLibroWorkbook({
      meses: [mes('2026-01', [vino({ entradas_u: 3, entradas_eur: 150.5 })])],
      anio: 2026, restauranteNombre: 'X',
    })
    const row0 = spec.sheets[1].rows[0]
    assert.strictEqual(typeof row0.entradas_u,   'number')
    assert.strictEqual(typeof row0.entradas_eur, 'number')
    assert.strictEqual(row0.entradas_u,   3)
    assert.strictEqual(row0.entradas_eur, 150.5)
  })

  it('todas las columnas EUR tienen format #,##0.00 €', () => {
    const spec = construirLibroWorkbook({
      meses: [mes('2026-01', [vino()])], anio: 2026, restauranteNombre: 'X',
    })
    const mesSheet = spec.sheets[1]
    const colsEur = mesSheet.columns.filter(c => c.key.includes('eur') || c.key.includes('coste') || c.key.includes('consumo') || c.key.includes('diferencia'))
    assert.ok(colsEur.length > 0)
    for (const c of colsEur) {
      assert.strictEqual(c.format, '#,##0.00 €', `col ${c.key} debería tener formato euro`)
    }
  })

  it('header de todas las hojas: freezeHeader=true', () => {
    const spec = construirLibroWorkbook({
      meses: [mes('2026-01', [vino()])], anio: 2026, restauranteNombre: 'X',
    })
    for (const s of spec.sheets) {
      assert.strictEqual(s.freezeHeader, true)
    }
  })
})

describe('filtrarMesesLibro', () => {
  it('sin filtros → todos los meses con vinos', () => {
    const r = filtrarMesesLibro([mes('2026-01', [vino()]), mes('2026-02', [])])
    assert.strictEqual(r.length, 1)
    assert.strictEqual(r[0].mes, '2026-01')
  })
})

// ── Libro de compras ─────────────────────────────────────────────────────────

describe('construirComprasWorkbook', () => {
  const registros = [
    { id: 1, proveedor: 'Bodega A', periodo: '2026-01',
      facturas: [{ fecha: '2026-01-05', importe: 500, albaran: 'A1' },
                 { fecha: '2026-01-20', importe: 300, albaran: 'A2' }] },
    { id: 2, proveedor: 'Bodega B', periodo: '2026-01',
      facturas: [{ fecha: '2026-01-10', importe: 250, albaran: 'B1' }] },
    { id: 3, proveedor: 'Bodega C', periodo: '2026-02',
      facturas: [{ fecha: '2026-02-01', importe: 999 }] },
  ]

  it('empty: periodo sin facturas', () => {
    const spec = construirComprasWorkbook({
      registros, periodoFiltro: '2025-06', restauranteNombre: 'Test',
    })
    assert.strictEqual(spec.empty, true)
    assert.strictEqual(spec.filename, 'test-compras-2025-06.xlsx')
  })

  it('agrupa facturas del periodo, ordena por fecha ascendente', () => {
    const spec = construirComprasWorkbook({
      registros, periodoFiltro: '2026-01', restauranteNombre: 'Test',
    })
    const rows = spec.sheets[0].rows
    assert.strictEqual(rows.length, 3)
    assert.strictEqual(rows[0].fecha, '2026-01-05')
    assert.strictEqual(rows[1].fecha, '2026-01-10')
    assert.strictEqual(rows[2].fecha, '2026-01-20')
    assert.strictEqual(rows[0].proveedor, 'Bodega A')
    assert.strictEqual(rows[1].proveedor, 'Bodega B')
    assert.strictEqual(typeof rows[0].importe, 'number')
  })

  it('TOTAL es fórmula SUM, no valor precomputado', () => {
    const spec = construirComprasWorkbook({
      registros, periodoFiltro: '2026-01', restauranteNombre: 'Test',
    })
    const t = spec.sheets[0].totals
    assert.strictEqual(t.proveedor, 'TOTAL')
    assert.ok(t.importe && typeof t.importe === 'object')
    assert.ok(/^SUM\([A-Z]+2:[A-Z]+4\)$/.test(t.importe.formula))
  })

  it('nombre de archivo con slug y periodo', () => {
    const spec = construirComprasWorkbook({
      registros, periodoFiltro: '2026-01',
      restauranteNombre: 'Taberna del Puerto',
    })
    assert.strictEqual(spec.filename, 'taberna-del-puerto-compras-2026-01.xlsx')
  })

  it('columna importe tiene format euro', () => {
    const spec = construirComprasWorkbook({
      registros, periodoFiltro: '2026-01', restauranteNombre: 'X',
    })
    const colImp = spec.sheets[0].columns.find(c => c.key === 'importe')
    assert.strictEqual(colImp.format, '#,##0.00 €')
  })
})

describe('filasComprasVisibles', () => {
  it('maneja periodo sin registros', () => {
    assert.deepStrictEqual(filasComprasVisibles([], '2026-01'), [])
  })
})

// ── Cierre mensual ───────────────────────────────────────────────────────────

describe('construirCierreWorkbook', () => {
  const datosCierre = {
    iva_pct: 10,
    ventas_bruto: 5000, ventas_neto: 4545.45,
    coste_ventas_teorico: 1600, margen_bruto: 2945.45,
    compras_netas: 1800, salidas_no_venta: 50,
    merma_copa_eur: 20, diferencias_inventario: -10,
    gastos_total: 1200, resultado: 1715.45,
    informe: {
      por_vino: [
        { vino_id: 'v1', nombre: 'A', uds: 10, copas: 50, ingresos: 500, coste_unitario: 5, margen_pct: 60, tiene_coste: true },
        { vino_id: 'v2', nombre: 'B', uds: 5,  copas: 20, ingresos: 300, coste_unitario: 8, margen_pct: 55, tiene_coste: true },
      ],
    },
  }

  it('empty: sin informe.por_vino', () => {
    const spec = construirCierreWorkbook({ datos: { informe: { por_vino: [] } }, mes: '2026-01', restauranteNombre: 'T' })
    assert.strictEqual(spec.empty, true)
    assert.strictEqual(spec.filename, 't-cierre-2026-01.xlsx')
  })

  it('devuelve Resumen + Vinos (Gastos opcional si hay datos.gastos)', () => {
    const spec = construirCierreWorkbook({ datos: datosCierre, mes: '2026-01', restauranteNombre: 'X' })
    assert.strictEqual(spec.sheets.length, 2)   // sin datos.gastos → no hay hoja Gastos
    assert.strictEqual(spec.sheets[0].name, 'Resumen')
    assert.strictEqual(spec.sheets[1].name, 'Vinos')
    assert.strictEqual(spec.sheets[1].rows.length, 2)
  })

  it('añade hoja Gastos cuando datos.gastos tiene filas (TOTAL con fórmula y result)', () => {
    const datos = {
      ...datosCierre,
      gastos: [
        { concepto: 'Alquiler', importe: 1000 },
        { concepto: 'Luz',      importe: 200 },
      ],
    }
    const spec = construirCierreWorkbook({ datos, mes: '2026-01', restauranteNombre: 'X' })
    assert.strictEqual(spec.sheets.length, 3)
    assert.strictEqual(spec.sheets[2].name, 'Gastos')
    const t = spec.sheets[2].totals
    assert.strictEqual(t.importe.formula, 'SUM(B2:B3)')
    assert.strictEqual(t.importe.result, 1200)
  })

  it('TOTAL de Vinos: fórmula SUM + result precalculado', () => {
    const spec = construirCierreWorkbook({ datos: datosCierre, mes: '2026-01', restauranteNombre: 'X' })
    const t = spec.sheets[1].totals
    assert.strictEqual(t.nombre, 'TOTAL')
    assert.ok(/^SUM\([A-Z]+2:[A-Z]+3\)$/.test(t.uds.formula))
    assert.strictEqual(t.uds.result,      15)   // 10 + 5
    assert.strictEqual(t.copas.result,    70)   // 50 + 20
    assert.strictEqual(t.ingresos.result, 800)  // 500 + 300
  })

  it('Resumen tiene 16 filas (réplica del xlsx original del cierre)', () => {
    const spec = construirCierreWorkbook({ datos: datosCierre, mes: '2026-01', restauranteNombre: 'X' })
    const resumen = spec.sheets[0]
    assert.strictEqual(resumen.rows.length, 16)
    assert.strictEqual(resumen.rows[0].concepto, 'Ventas brutas (con IVA, €)')
    assert.strictEqual(resumen.rows[0].valor, 5000)
    assert.strictEqual(resumen.rows[1].concepto, 'IVA 10% (€)')  // ventas_bruto − ventas_neto
    assert.ok(Math.abs(resumen.rows[1].valor - (5000 - 4545.45)) < 0.01)
  })

  it('tiene_coste → "sí"/"no" (texto legible, no boolean)', () => {
    const spec = construirCierreWorkbook({ datos: datosCierre, mes: '2026-01', restauranteNombre: 'X' })
    assert.strictEqual(spec.sheets[1].rows[0].tiene_coste, 'sí')
  })

  it('nombre de archivo pattern', () => {
    const spec = construirCierreWorkbook({ datos: datosCierre, mes: '2026-03', restauranteNombre: 'Casa Marisma' })
    assert.strictEqual(spec.filename, 'casa-marisma-cierre-2026-03.xlsx')
  })
})
