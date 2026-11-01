/**
 * Compara la hoja Resumen del cierre contra las 16 etiquetas EXACTAS
 * que generaba el código con xlsx eliminado en el commit 8dc966e7
 * (app/dashboard/bodega/CierreMensual.js:256-282).
 *
 * Ese bloque antiguo incluía además 3 líneas de metadata encima de los
 * datos (título "Cierre mensual de bodega — nombre", "Mes: …" y
 * "Partes/Período …"), un separador vacío y la cabecera "Concepto,
 * Valor". Como ExcelJS obliga a filas con la misma estructura de
 * columnas, aquí solo comparamos las 16 FILAS DE DATOS, que son las
 * que tienen el pair (concepto, valor). La metadata del título se
 * refleja en el filename y en el sheet name ('Resumen').
 *
 * Si cualquier etiqueta, orden o número de filas cambia, este test
 * falla y hace de regla de regresión.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirCierreWorkbook } from '../app/lib/excelSomm.js'

// Filas EXACTAS del código antiguo (git show 8dc966e7:app/dashboard/bodega/CierreMensual.js:256-282)
const OLD_LABELS_EN_ORDEN = [
  'Ventas brutas (con IVA, €)',
  'IVA 10% (€)',                         // iva_pct interpolado — para datos.iva_pct=10
  'Ventas netas (sin IVA, €)',
  'Coste ventas teórico (€)',
  'Margen bruto (€)',
  'Margen bruto (%)',
  'Compras brutas (€)',
  'Devoluciones (€)',
  'Compras netas (€)',
  'Salidas no venta (€)',
  'Merma copa (€)',
  'Diferencias inventario (€)',
  'Stock inicial (€)',
  'Stock final (€)',
  'Total gastos (€)',
  'Resultado neto bodega (€)',
]

const datosCompletos = {
  iva_pct: 10,
  ventas_bruto: 5000, ventas_neto: 4545.45,
  coste_ventas_teorico: 1600, margen_bruto: 2945.45, margen_pct: 65,
  compras_bruto: 2000, devoluciones: 50, compras_netas: 1950,
  salidas_no_venta: 50, merma_copa_eur: 20, diferencias_inventario: -10,
  stock_inicial: 3000, stock_final: 3400,
  gastos_total: 1200, resultado: 1715.45,
  informe: { por_vino: [{ vino_id: 'v1', nombre: 'A', uds: 10, copas: 50, ingresos: 500, coste_unitario: 5, margen_pct: 60, tiene_coste: true }] },
}

describe('Retrocompatibilidad: hoja Resumen del Cierre (xlsx viejo → ExcelJS)', () => {
  const spec = construirCierreWorkbook({ datos: datosCompletos, mes: '2026-01', restauranteNombre: 'Casa Marisma' })
  const resumen = spec.sheets.find(s => s.name === 'Resumen')
  const labels = resumen.rows.map(r => r.concepto)

  it('mantiene 16 filas de datos (mismo recuento que el OLD con xlsx)', () => {
    assert.strictEqual(resumen.rows.length, 16, `Esperado 16, got ${resumen.rows.length}`)
  })

  it('etiquetas EXACTAS en el MISMO ORDEN que el OLD', () => {
    assert.deepStrictEqual(labels, OLD_LABELS_EN_ORDEN)
  })

  // Checks puntuales de etiquetas que suelen regresarse al reescribir
  for (const esperado of OLD_LABELS_EN_ORDEN) {
    it(`contiene "${esperado}" en su posición original`, () => {
      const idxEsperado = OLD_LABELS_EN_ORDEN.indexOf(esperado)
      assert.strictEqual(labels[idxEsperado], esperado)
    })
  }

  it('IVA interpola iva_pct: con 21% la etiqueta cambia', () => {
    const specIva21 = construirCierreWorkbook({
      datos: { ...datosCompletos, iva_pct: 21 }, mes: '2026-01', restauranteNombre: 'X',
    })
    const r = specIva21.sheets.find(s => s.name === 'Resumen')
    assert.strictEqual(r.rows[1].concepto, 'IVA 21% (€)')
  })

  it('IVA calcula ventas_bruto − ventas_neto como valor', () => {
    // 5000 − 4545.45 = 454.55 (con FP posible)
    assert.ok(Math.abs(resumen.rows[1].valor - 454.55) < 0.01)
  })

  it('valores numéricos nulables (margen_pct, diferencias_inv, stock) pueden ser null si faltan', () => {
    const parcial = { ...datosCompletos, margen_pct: null, diferencias_inventario: null, stock_inicial: null, stock_final: null }
    const specP = construirCierreWorkbook({ datos: parcial, mes: '2026-01', restauranteNombre: 'X' })
    const r = specP.sheets.find(s => s.name === 'Resumen')
    assert.strictEqual(r.rows[5].valor, null)   // Margen bruto (%)
    assert.strictEqual(r.rows[11].valor, null)  // Diferencias inventario (€)
    assert.strictEqual(r.rows[12].valor, null)  // Stock inicial (€)
    assert.strictEqual(r.rows[13].valor, null)  // Stock final (€)
  })

  it('metadata OLD (título, Mes, Partes/Período) ya NO aparece como filas del Resumen', () => {
    // Documenta la ÚNICA diferencia aceptada: las 3 líneas sueltas de
    // metadata del OLD no caben en el modelo ws.columns de ExcelJS y
    // se trasladan al filename ("casa-marisma-cierre-2026-01.xlsx") y
    // al sheet name "Resumen". Verificamos que efectivamente faltan
    // esas 3 líneas aquí para que no sorprendan.
    const titulosLegacyFueraDeCols = labels.filter(l =>
      /^Cierre mensual de bodega/.test(l) || /^Mes:/.test(l) || /^Partes:/.test(l)
    )
    assert.strictEqual(titulosLegacyFueraDeCols.length, 0)
    assert.strictEqual(spec.filename, 'casa-marisma-cierre-2026-01.xlsx')
  })
})
