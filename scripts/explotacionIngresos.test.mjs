/**
 * Unit tests for app/lib/explotacionIngresos.js
 * Ejecutar: node --test scripts/explotacionIngresos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularTotalIngresos,
  esErrorColumnaFalta,
  parseComaEs,
} from '../app/lib/explotacionIngresos.js'
import {
  calcularBreakEven,
  calcularResultadoExplotacion,
} from '../app/lib/sommExplotacion.js'

describe('calcularTotalIngresos', () => {
  it('suma ventas netas + resto', () => {
    assert.equal(calcularTotalIngresos({ facturacion: 1000, resto: 200 }), 1200)
  })

  it('resto vacío / 0 / null → igual a ventas netas (comportamiento previo)', () => {
    assert.equal(calcularTotalIngresos({ facturacion: 1000, resto: 0 }),   1000)
    assert.equal(calcularTotalIngresos({ facturacion: 1000, resto: null }), 1000)
    assert.equal(calcularTotalIngresos({ facturacion: 1000, resto: '' }),   1000)
    assert.equal(calcularTotalIngresos({ facturacion: 1000 }),              1000)
  })

  it('acepta strings con coma decimal es-ES (el formato del input)', () => {
    assert.equal(calcularTotalIngresos({ facturacion: '1.234,56', resto: '150,00' }), 1384.56)
    assert.equal(calcularTotalIngresos({ facturacion: '1234,56',   resto: 150 }),     1384.56)
  })

  it('valores inválidos / negativos → 0 por operando (defensivo)', () => {
    assert.equal(calcularTotalIngresos({ facturacion: 'abc', resto: 200 }), 200)
    assert.equal(calcularTotalIngresos({ facturacion: -500, resto: 100 }),  100)
    assert.equal(calcularTotalIngresos({ facturacion: NaN,  resto: 100 }),  100)
    assert.equal(calcularTotalIngresos({ facturacion: null, resto: -5 }),    0)
  })

  it('redondeo a 2 decimales', () => {
    assert.equal(calcularTotalIngresos({ facturacion: 0.1, resto: 0.2 }), 0.3)
    assert.equal(calcularTotalIngresos({ facturacion: 100.123, resto: 0 }), 100.12)
  })
})

describe('parseComaEs — entrada del input', () => {
  it('coma decimal estándar', () => {
    assert.equal(parseComaEs('1.234,56'), 1234.56)
    assert.equal(parseComaEs('0,05'), 0.05)
  })
  it('vacío / null → null', () => {
    assert.equal(parseComaEs(''), null)
    assert.equal(parseComaEs('   '), null)
    assert.equal(parseComaEs(null), null)
    assert.equal(parseComaEs(undefined), null)
  })
  it('entradas inválidas → null', () => {
    assert.equal(parseComaEs('abc'),  null)
    assert.equal(parseComaEs('-50'),  null)
    assert.equal(parseComaEs('1,2,3'), null)
  })
})

describe('esErrorColumnaFalta — degradación pre-SQL', () => {
  it('reconoce el código 42703 de PostgREST', () => {
    assert.equal(esErrorColumnaFalta({ code: '42703' }, 'resto_ingresos'), true)
  })
  it('reconoce mensajes "does not exist" con el nombre de la columna', () => {
    assert.equal(
      esErrorColumnaFalta({ message: 'column resto_ingresos does not exist' }, 'resto_ingresos'),
      true,
    )
  })
  it('message con "does not exist" pero otra columna → false (no falso positivo)', () => {
    assert.equal(
      esErrorColumnaFalta({ message: 'column foo_bar does not exist' }, 'resto_ingresos'),
      false,
    )
  })
  it('sin nombreColumna → genérico, acepta cualquier "does not exist"', () => {
    assert.equal(esErrorColumnaFalta({ message: 'column X does not exist' }), true)
  })
  it('mensaje de otro tipo / null → false', () => {
    assert.equal(esErrorColumnaFalta({ message: 'permission denied' }, 'resto_ingresos'), false)
    assert.equal(esErrorColumnaFalta(null, 'resto_ingresos'), false)
    assert.equal(esErrorColumnaFalta(undefined, 'resto_ingresos'), false)
  })
})

describe('P&L con resto: ratios se calculan sobre TOTAL INGRESOS', () => {
  // Caso base: ventas 1000 + resto 0 → P&L idéntico al previo.
  it('resto = 0 → resultado y ratios iguales al escenario previo', () => {
    const ventas = 1000, resto = 0
    const total = calcularTotalIngresos({ facturacion: ventas, resto })
    const prev = calcularResultadoExplotacion({
      facturacion: ventas, consumoMp: 300, personal: 200,
      generales: 100, alquiler: 80, bancarios: 20,
    })
    const nuevo = calcularResultadoExplotacion({
      facturacion: total, consumoMp: 300, personal: 200,
      generales: 100, alquiler: 80, bancarios: 20,
    })
    assert.equal(nuevo.resultado, prev.resultado)
    assert.equal(nuevo.pctMp,     prev.pctMp)
    assert.equal(nuevo.pctResultado, prev.pctResultado)
  })

  // Con resto > 0, los % deben bajar respecto al escenario sin resto
  // (misma MP absoluta repartida sobre más ingresos).
  it('resto = 200 → %MP cae y %Resultado sube (misma MP absoluta)', () => {
    const ventas = 1000, resto = 200
    const total = calcularTotalIngresos({ facturacion: ventas, resto })
    assert.equal(total, 1200)
    const nuevo = calcularResultadoExplotacion({
      facturacion: total, consumoMp: 300, personal: 200,
      generales: 100, alquiler: 80, bancarios: 20,
    })
    // 300/1200 = 25,00 % (vs 30 % previo)
    assert.equal(nuevo.pctMp, 25)
    // Resultado = 1200-300-200-100-80-20 = 500. 500/1200 = 41,67 %
    assert.equal(nuevo.resultado, 500)
    assert.equal(Math.round(nuevo.pctResultado), 42)
  })

  it('break-even se calcula sobre pctMp del total, no de ventas', () => {
    // Gastos fijos = personal + alquiler + generales + bancarios = 400.
    //   Con resto 0 → pctMp = 300/1000 = 30 % → margen = 70 %
    //   → BE = 400 / 0.70 ≈ 571.43
    //   Con resto 200 → pctMp = 300/1200 = 25 % → margen = 75 %
    //   → BE = 400 / 0.75 ≈ 533.33
    const beSin  = calcularBreakEven(200, 100, 80, 20, 300/1000*100).breakEven
    const beCon  = calcularBreakEven(200, 100, 80, 20, 300/1200*100).breakEven
    assert.ok(Math.abs(beSin - 571.43) < 0.01)
    assert.ok(Math.abs(beCon - 533.33) < 0.01)
    assert.ok(beCon < beSin)   // añadir resto baja el break-even requerido
  })
})
