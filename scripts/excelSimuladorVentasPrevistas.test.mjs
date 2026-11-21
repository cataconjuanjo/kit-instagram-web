/**
 * Fase E-2 — en la hoja Simulador del informe económico, las ventas
 * previstas deben venir del mes del INFORME cuando no hay fijo
 * manual guardado; cuando lo hay, se marca "(fijadas manualmente)".
 *
 * Esto evita el bug reportado: al abrir el informe de noviembre,
 * la hoja Simulador mostraba ventas de octubre (congeladas) junto
 * con gastos de noviembre.
 *
 * Ejecutar: node --test scripts/excelSimuladorVentasPrevistas.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'

function argsBase(extra = {}) {
  return {
    restauranteNombre: 'Casa Marisma',
    periodo: '2026-11',          // informe de NOVIEMBRE
    esSomm: false,
    facturacion: 12000, restoIngresos: 0, consumoMp: 5000,
    totalPersonal: 3200, totalGastos: 300, totalAlquiler: 800, totalBancarios: 50,
    breakEven: 5000,
    personal: {}, gastosPartidas: [], alquilerPartidas: [], bancarios: {},
    canales: {}, registrosCompras: [], imputacion_pct: {},
    datosVino: null,
    ...extra,
  }
}

// Snapshot del INFORME = noviembre (ventas_neto 12.000).
function snapshotNoviembre() {
  return {
    mes: '2026-11',
    ventas_bruto: 13200, ventas_neto: 12000, iva_pct: 10,
    coste_ventas_teorico: 5000, margen_bruto: 7000, margen_pct: 58,
    informe: {
      por_canal: {
        rotura: { uds: 0, coste: 0 },
        invitacion: { uds: 0, botella_uds: 0, copa_uds: 0, botella_coste: 0, copa_coste: 0 },
        cocina: { uds: 0, coste: 0 }, cata: { uds: 0, coste: 0 },
      },
    },
  }
}

const hoja = (spec, n) => spec.sheets.find(s => s.name === n)

describe("Hoja Simulador — ventas previstas sin fijo usan ventas del mes del informe", () => {
  it('sin ventas_previstas_fijo → fila 19 es fórmula viva =B2 con label "ventas del mes del informe"', () => {
    const supuestos = { materiales: 10, suministros: 20, otros: 0, beneficio_objetivo: 500 }
    // NOTA: no incluye ventas_previstas_fijo — es justo el caso de bug E-2.
    const spec = construirInformeEconomicoWorkbook(argsBase({
      datosVino: snapshotNoviembre(),
      supuestos,
    }))
    const s = hoja(spec, 'Simulador')
    const fila19 = s.rows.find(r => r.concepto && r.concepto.startsWith('Ventas previstas'))
    assert.ok(fila19, 'falta la fila de Ventas previstas')
    // Concepto habla de "ventas del mes del informe".
    assert.match(fila19.concepto, /ventas del mes del informe/i)
    // Valor es fórmula =B2 con result = 12.000 (ventas de noviembre).
    assert.ok(fila19.valor && typeof fila19.valor === 'object')
    assert.equal(fila19.valor.formula, 'B2')
    assert.equal(fila19.valor.result, 12000)
  })

  it('sin fijo → B22 "Ventas previstas efectivas" es fórmula =B19 con result = ventas del mes', () => {
    const supuestos = { materiales: 10 }
    const spec = construirInformeEconomicoWorkbook(argsBase({
      datosVino: snapshotNoviembre(),
      supuestos,
    }))
    const s = hoja(spec, 'Simulador')
    const fila22 = s.rows.find(r => r.concepto === 'Ventas previstas efectivas')
    assert.equal(fila22.valor.formula, 'B19')
    assert.equal(fila22.valor.result, 12000)
  })

  it('CON fijo → fila 19 es literal con label "(fijadas manualmente)"', () => {
    const supuestos = {
      materiales: 10, beneficio_objetivo: 500,
      ventas_previstas_fijo: 15000,
    }
    const spec = construirInformeEconomicoWorkbook(argsBase({
      datosVino: snapshotNoviembre(),
      supuestos,
    }))
    const s = hoja(spec, 'Simulador')
    const fila19 = s.rows.find(r => r.concepto && r.concepto.startsWith('Ventas previstas'))
    assert.match(fila19.concepto, /fijadas manualmente/i)
    // Es un número literal, no una fórmula.
    assert.equal(typeof fila19.valor, 'number')
    assert.equal(fila19.valor, 15000)
  })

  it('CON fijo → B22 "Ventas previstas efectivas" sigue a B19 y vale el fijo (15.000)', () => {
    const supuestos = {
      materiales: 10, beneficio_objetivo: 500,
      ventas_previstas_fijo: 15000,
    }
    const spec = construirInformeEconomicoWorkbook(argsBase({
      datosVino: snapshotNoviembre(),
      supuestos,
    }))
    const s = hoja(spec, 'Simulador')
    const fila22 = s.rows.find(r => r.concepto === 'Ventas previstas efectivas')
    assert.equal(fila22.valor.formula, 'B19')
    assert.equal(fila22.valor.result, 15000)
  })

  it('invariancia: ningún dato de la hoja viene de otro mes — todo deriva de B2/B3 del snapshot pasado', () => {
    // Si el snapshot cambia, TODO cambia. Esta prueba detecta la
    // regresión que motivó E-2: que la hoja mezclara meses.
    const supuestos = { materiales: 10 }
    const specNov = construirInformeEconomicoWorkbook(argsBase({
      datosVino: snapshotNoviembre(),                // ventas 12.000
      supuestos,
    }))
    const sNov = hoja(specNov, 'Simulador')
    const fila19Nov = sNov.rows.find(r => r.concepto && r.concepto.startsWith('Ventas previstas'))
    assert.equal(fila19Nov.valor.result, 12000)

    // Ahora pasamos un snapshot DIFERENTE (octubre) y verificamos que
    // ventas previstas siguen al nuevo snapshot:
    const specOct = construirInformeEconomicoWorkbook(argsBase({
      datosVino: {
        mes: '2026-10',
        ventas_bruto: 10583, ventas_neto: 9621.82,
        iva_pct: 10, coste_ventas_teorico: 4044.12, margen_bruto: 5577.70,
        informe: { por_canal: {} },
      },
      supuestos,
    }))
    const sOct = hoja(specOct, 'Simulador')
    const fila19Oct = sOct.rows.find(r => r.concepto && r.concepto.startsWith('Ventas previstas'))
    assert.equal(fila19Oct.valor.result, 9621.82,
      'las ventas previstas de la hoja deben seguir al snapshot pasado al builder, no "congelarse" de otro mes')
  })
})
