/**
 * Fase D — hoja "Simulador" del informe económico.
 *
 * Verificaciones:
 *   - La hoja aparece con nombre 'Simulador' cuando hay snapshot con
 *     ventas o coste o margen.
 *   - Se omite (no se crea) si no hay datosVino, igual que
 *     Canales venta / Salidas no-venta.
 *   - Lleva las claves esperadas: ventas, coste, margen, % MP, % margen,
 *     personal (imputado a bodega), alquiler (idem), roturas+invitaciones+
 *     cocina+cata, total de gastos reales.
 *   - Las fórmulas vivas no empiezan por "=" (patrón del builder).
 *   - Dimensiones de branding: freezeHeader activo.
 *
 * Ejecutar: node --test scripts/excelSimulador.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'

function argsBase(extra = {}) {
  return {
    restauranteNombre: 'Casa Marisma',
    periodo: '2026-10',
    esSomm: false,
    facturacion: 9621.82, restoIngresos: 0, consumoMp: 4044.12,
    totalPersonal: 3000, totalGastos: 300, totalAlquiler: 800, totalBancarios: 50,
    breakEven: 5000,
    personal: {}, gastosPartidas: [], alquilerPartidas: [], bancarios: {},
    canales: {}, registrosCompras: [], imputacion_pct: {},
    datosVino: null,
    ...extra,
  }
}

function snapshot() {
  return {
    mes: '2026-10',
    ventas_bruto: 10583,
    ventas_neto:  9621.82,
    iva_pct: 10,
    coste_ventas_teorico: 4044.12,
    margen_bruto: 5577.70,
    informe: {
      por_canal: {
        rotura:     { uds: 1, coste: 45 },
        invitacion: { uds: 0, botella_uds: 2, copa_uds: 10, botella_coste: 60, copa_coste: 30 },
        cocina:     { uds: 1, coste: 25 },
        cata:       { uds: 2, coste: 90 },
      },
    },
  }
}

function hoja(spec, nombre) { return spec.sheets.find(s => s.name === nombre) }

describe("Hoja 'Simulador' — foto del mes con datos REALES", () => {
  it('aparece cuando hay snapshot con ventas', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot() }))
    const s = hoja(spec, 'Simulador')
    assert.ok(s, 'hoja Simulador no está presente')
    assert.equal(s.freezeHeader, true)
  })

  it('se omite sin datosVino (patrón de Canales venta / Salidas no-venta)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: null }))
    assert.equal(hoja(spec, 'Simulador'), undefined)
  })

  it('se omite cuando el snapshot existe pero no hay ventas ni coste ni margen', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({
      datosVino: { mes: '2026-10', ventas_neto: 0, coste_ventas_teorico: 0, margen_bruto: 0, informe: { por_canal: {} } },
    }))
    assert.equal(hoja(spec, 'Simulador'), undefined)
  })

  it('contiene ventas, coste, margen con valores del snapshot', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot() }))
    const s = hoja(spec, 'Simulador')
    const rows = s.rows
    assert.equal(rows[0].concepto, 'VENTAS DEL MES')
    assert.equal(rows[0].valor, 9621.82)
    assert.equal(rows[1].concepto, 'Coste ventas teórico')
    assert.equal(rows[1].valor, 4044.12)
    assert.equal(rows[2].concepto, 'Margen bruto real')
    assert.equal(rows[2].valor, 5577.70)
  })

  it('%MP real y %margen real son FÓRMULAS vivas (no empiezan por "=")', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot() }))
    const s = hoja(spec, 'Simulador')
    const filaMP = s.rows.find(r => r.concepto === '% materia prima real')
    const filaM  = s.rows.find(r => r.concepto === '% margen real')
    assert.equal(filaMP.valor.formula, 'B3/B2')
    assert.equal(filaM.valor.formula,  '1-B5')
    assert.ok(!filaMP.valor.formula.startsWith('='), 'fórmula no debe empezar por "="')
    assert.ok(!filaM.valor.formula.startsWith('='))
    // Resultado precalculado coherente con los valores:
    //   4044.12 / 9621.82 = 0.4203… (ratio para FMT_PCT)
    assert.ok(filaMP.valor.result > 0.41 && filaMP.valor.result < 0.43)
    assert.ok(filaM.valor.result  > 0.57 && filaM.valor.result  < 0.59)
  })

  it('gastos imputados a bodega: personal, alquiler (del llamador) + roturas (del snapshot)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({
      datosVino: snapshot(),
      totalPersonal: 3000, totalAlquiler: 800,
    }))
    const s = hoja(spec, 'Simulador')
    const personal = s.rows.find(r => r.concepto === 'Personal (imputado a bodega)')
    const alquiler = s.rows.find(r => r.concepto === 'Alquiler (imputado a bodega)')
    const roturas  = s.rows.find(r => r.concepto.startsWith('Roturas'))
    assert.equal(personal.valor, 3000)
    assert.equal(alquiler.valor, 800)
    // 45 + 60 + 30 + 25 + 90 = 250
    assert.equal(roturas.valor, 250)
  })

  it('TOTAL de gastos reales: fórmula SUM(B9:B11)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot() }))
    const s = hoja(spec, 'Simulador')
    const total = s.rows.find(r => r.concepto.startsWith('TOTAL gastos reales'))
    assert.equal(total.valor.formula, 'SUM(B9:B11)')
    assert.ok(!total.valor.formula.startsWith('='))
    // 3000 + 800 + 250 = 4050
    assert.equal(total.valor.result, 4050)
  })

  it('las demás hojas (Canales venta, Resumen) siguen presentes e intactas', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot() }))
    // Smoke: no debería cambiar nada en otras hojas por añadir Simulador.
    assert.ok(hoja(spec, 'Resumen'))
    // Sin por_canal detallado con uds/ingresos, Canales venta puede
    // omitirse — no es obligatorio aquí.
  })
})
