/**
 * Fase E — hoja Simulador del informe económico.
 *
 * PART 1: valores cacheados exactos
 *   Cada fórmula de la hoja tiene su `result` igual al que Excel
 *   obtendría recalculándola a partir de las celdas que referencia
 *   (tolerancia 1e-9). Antes de este fix, `% margen real` almacenaba
 *   un `r2(1 - costeMp/ventasNeto)` → divergencia frente a `=1-B5`.
 *
 * PART 2: bloque de supuestos
 *   Si `supuestos` llega al builder, la hoja añade margen mínimo,
 *   % MP máx, multiplicador mínimo y veredicto por puntos, con
 *   fórmulas vivas sin "=" inicial. Si no llega, la hoja sólo
 *   muestra lo real (fase D) + una nota "Sin supuestos guardados".
 *
 * Ejecutar: node --test scripts/excelSimuladorExacto.test.mjs
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

// Evaluador diminuto de las fórmulas que usa esta hoja. No implementa
// un parser de Excel; solo las expresiones específicas que generamos
// y que están cubiertas por los tests. Si sale una nueva fórmula no
// contemplada, el test falla con un mensaje claro.
function evaluar(formula, celdas) {
  const CTX = celdas
  // Soporta: "B3/B2", "1-B5", "B2-B3", "B20+B18", "B21/B22", "1-B23",
  // "1/B24", "(1-B5)-B23", "B12+B15+B16+B17", "SUM(B9:B11)".
  if (/^SUM\(B(\d+):B(\d+)\)$/.test(formula)) {
    const [, a, b] = formula.match(/^SUM\(B(\d+):B(\d+)\)$/)
    let s = 0
    for (let i = Number(a); i <= Number(b); i++) {
      s += Number(CTX[`B${i}`]) || 0
    }
    return s
  }
  const expr = formula.replace(/B(\d+)/g, (_, n) => `(${Number(CTX[`B${n}`]) || 0})`)
  return Function('return ' + expr)()
}

function celdasDeHoja(sheet) {
  const ctx = {}
  sheet.rows.forEach((r, i) => {
    const fila = i + 2 // header en 1
    let v = r.valor
    if (v && typeof v === 'object' && 'formula' in v) {
      v = v.result   // usar el result cacheado (es lo que lee Excel al abrir)
    }
    ctx[`B${fila}`] = typeof v === 'number' ? v : 0
  })
  return ctx
}

describe('PART 1 — valores cacheados exactos en la hoja Simulador', () => {
  it('cada fórmula tiene result ≈ evaluar(fórmula) con tolerancia 1e-9', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot() }))
    const s = hoja(spec, 'Simulador')
    const ctx = celdasDeHoja(s)
    const errores = []
    s.rows.forEach((r, i) => {
      const fila = i + 2
      if (r.valor && typeof r.valor === 'object' && r.valor.formula) {
        if (r.valor.result === null) return   // bloque supuestos, sin result en este flujo
        const esperado = evaluar(r.valor.formula, ctx)
        const diff = Math.abs(esperado - r.valor.result)
        if (diff > 1e-9) {
          errores.push(`B${fila} "${r.concepto}" fórmula ${r.valor.formula} esperado ${esperado} result ${r.valor.result}`)
        }
      }
    })
    assert.equal(errores.length, 0, 'Divergencias:\n' + errores.join('\n'))
  })

  it('% margen real cacheado coincide con 1 − coste/ventas con precisión completa', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot() }))
    const s = hoja(spec, 'Simulador')
    const filaMR = s.rows.find(r => r.concepto === '% margen real')
    const esperado = 1 - (4044.12 / 9621.82)   // 0.5796824...
    assert.ok(Math.abs(filaMR.valor.result - esperado) < 1e-9,
      `cached ${filaMR.valor.result} vs esperado ${esperado}`)
  })

  it('%MP real cacheado = coste/ventas con precisión completa', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot() }))
    const s = hoja(spec, 'Simulador')
    const filaMP = s.rows.find(r => r.concepto === '% materia prima real')
    const esperado = 4044.12 / 9621.82
    assert.ok(Math.abs(filaMP.valor.result - esperado) < 1e-9)
  })

  it('las fórmulas de la hoja NO empiezan por "=" (patrón del builder)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot() }))
    const s = hoja(spec, 'Simulador')
    for (const r of s.rows) {
      if (r.valor && typeof r.valor === 'object' && r.valor.formula) {
        assert.ok(!r.valor.formula.startsWith('='), `fórmula "${r.valor.formula}" no debe empezar por "="`)
      }
    }
  })
})

describe('PART 2 — bloque de supuestos en la hoja Simulador', () => {
  it('sin supuestos → nota "Sin supuestos guardados", sin bloque', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot(), supuestos: null }))
    const s = hoja(spec, 'Simulador')
    const marcador = s.rows.find(r => r.concepto && r.concepto.startsWith('Sin supuestos guardados'))
    assert.ok(marcador, 'falta la nota "Sin supuestos guardados"')
    assert.equal(s.rows.find(r => r.concepto === 'Veredicto'), undefined,
      'no debería haber veredicto sin supuestos')
  })

  it('con supuestos → añade margen mínimo, % MP máx, multiplicador y veredicto', () => {
    const supuestos = {
      materiales: 20, suministros: 40, otros: 0,
      beneficio_objetivo: 5000, ventas_previstas_fijo: 15000,
    }
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot(), supuestos }))
    const s = hoja(spec, 'Simulador')
    const bloque = s.rows.find(r => r.concepto === 'SUPUESTOS DEL SIMULADOR (guardados)')
    const margenNecesario = s.rows.find(r => r.concepto === 'Margen bruto necesario')
    const pctMin = s.rows.find(r => r.concepto === '% margen mínimo')
    const pctMax = s.rows.find(r => r.concepto === '% materia prima máx.')
    const multMin = s.rows.find(r => r.concepto === 'Multiplicador mínimo')
    const diff = s.rows.find(r => r.concepto === 'Diferencia vs mínimo (pts de margen)')
    const veredicto = s.rows.find(r => r.concepto === 'Veredicto')
    assert.ok(bloque)
    assert.ok(margenNecesario?.valor?.formula === 'B20+B18')
    assert.ok(pctMin?.valor?.formula    === 'B21/B22')
    assert.ok(pctMax?.valor?.formula    === '1-B23')
    assert.ok(multMin?.valor?.formula   === '1/B24')
    assert.ok(diff?.valor?.formula      === '(1-B5)-B23')
    assert.ok(/Cubre|No cubre/.test(veredicto.valor), `veredicto inesperado: ${veredicto.valor}`)
  })

  it('con ventas_previstas_fijo 15.000 y gastos reales + supuestos, el margen mínimo cuadra', () => {
    const supuestos = {
      materiales: 20, suministros: 40, otros: 0,
      beneficio_objetivo: 5000, ventas_previstas_fijo: 15000,
    }
    const spec = construirInformeEconomicoWorkbook(argsBase({
      datosVino: snapshot(),
      totalPersonal: 3000, totalAlquiler: 800,
      supuestos,
    }))
    const s = hoja(spec, 'Simulador')
    // gastos reales = 3000 + 800 + 250 = 4050
    // + supuestos = 20 + 40 + 0 = 60 → total gastos 4110
    // margen necesario = 4110 + 5000 = 9110
    // pct mínimo = 9110 / 15000 = 0.6073...
    const pctMin = s.rows.find(r => r.concepto === '% margen mínimo')
    const esperado = 9110 / 15000
    assert.ok(Math.abs(pctMin.valor.result - esperado) < 1e-9,
      `cached ${pctMin.valor.result} vs esperado ${esperado}`)
    // Veredicto: pctMargenReal = 0.5797 vs minimo 0.6073 → diff < 0 → No cubre
    const veredicto = s.rows.find(r => r.concepto === 'Veredicto')
    assert.equal(veredicto.valor, 'No cubre el margen mínimo')
  })

  it('supuestos con valores vacíos → trata como "sin supuestos"', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot(), supuestos: {} }))
    const s = hoja(spec, 'Simulador')
    assert.ok(s.rows.find(r => r.concepto && r.concepto.startsWith('Sin supuestos guardados')))
  })

  it('las fórmulas del bloque de supuestos tampoco empiezan por "="', () => {
    const supuestos = { materiales: 10, beneficio_objetivo: 100, ventas_previstas_fijo: 1000 }
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: snapshot(), supuestos }))
    const s = hoja(spec, 'Simulador')
    for (const r of s.rows) {
      if (r.valor && typeof r.valor === 'object' && r.valor.formula) {
        assert.ok(!r.valor.formula.startsWith('='))
      }
    }
  })
})
