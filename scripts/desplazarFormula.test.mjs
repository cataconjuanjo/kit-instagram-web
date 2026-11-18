/**
 * Unit tests para `desplazarFormula` del módulo app/lib/excelEstilos.js.
 * Cubre los patrones reales que emiten los generadores del repo
 * (excelSomm.js, informeEconomicoExcel.js) y sus bordes.
 *
 * Ejecutar: node --test scripts/desplazarFormula.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { desplazarFormula } from '../app/lib/excelEstilos.js'

describe('desplazarFormula — básico', () => {
  it('idempotente con offset 0 / vacío / no-string', () => {
    assert.equal(desplazarFormula('SUM(B2:B5)', 0), 'SUM(B2:B5)')
    assert.equal(desplazarFormula('', 4), '')
    assert.equal(desplazarFormula(null, 4), null)
    assert.equal(desplazarFormula(42, 4), 42)
  })

  it('SUM(B2:B5) con offset 4 → SUM(B6:B9)', () => {
    assert.equal(desplazarFormula('SUM(B2:B5)', 4), 'SUM(B6:B9)')
  })

  it('operaciones simples con 2 operandos', () => {
    assert.equal(desplazarFormula('D2-E2', 4), 'D6-E6')
    assert.equal(desplazarFormula('B2-B3', 4), 'B6-B7')
    assert.equal(desplazarFormula('B2+B3', 4), 'B6+B7')
    assert.equal(desplazarFormula('B2/B2', 4), 'B6/B6')
  })

  it('referencias absolutas y mixtas', () => {
    assert.equal(desplazarFormula('$B$3', 4), '$B$7')
    assert.equal(desplazarFormula('$B3', 4), '$B7')
    assert.equal(desplazarFormula('B$3', 4), 'B$7')
    assert.equal(desplazarFormula('SUM($B$2:$B$5)', 4), 'SUM($B$6:$B$9)')
  })

  it('IF e IFERROR anidados con rangos', () => {
    assert.equal(
      desplazarFormula('IF(B2>0,B2,0)', 4),
      'IF(B6>0,B6,0)',
    )
    assert.equal(
      desplazarFormula('IFERROR(B2/B3,0)', 4),
      'IFERROR(B6/B7,0)',
    )
    assert.equal(
      desplazarFormula('IFERROR(IF(OR(NOT(ISNUMBER(B12)),NOT(ISNUMBER(B8)),B8<=0),"",B12*B15/B8),"")', 4),
      'IFERROR(IF(OR(NOT(ISNUMBER(B16)),NOT(ISNUMBER(B12)),B12<=0),"",B16*B19/B12),"")',
    )
  })

  it('múltiples letras de columna (AA, AB)', () => {
    assert.equal(desplazarFormula('AA10+AB20', 4), 'AA14+AB24')
    assert.equal(desplazarFormula('SUM(AA1:AB100)', 4), 'SUM(AA5:AB104)')
  })

  it('cadenas literales entre comillas NO se tocan', () => {
    assert.equal(
      desplazarFormula('IFERROR(B2/B3,"B99")', 4),
      'IFERROR(B6/B7,"B99")',
    )
    // Doble string + fórmula:
    assert.equal(
      desplazarFormula('IF(B2="","vacío",B2+B3)', 4),
      'IF(B6="","vacío",B6+B7)',
    )
  })

  it('nombres de hoja con y sin comillas simples', () => {
    assert.equal(
      desplazarFormula("'Canales venta'!F4", 4),
      "'Canales venta'!F8",
    )
    assert.equal(
      desplazarFormula("Resumen!B2+B3", 4),
      "Resumen!B6+B7",
    )
    assert.equal(
      desplazarFormula("'Desglose'!C23 + 'Resumen'!B4", 4),
      "'Desglose'!C27 + 'Resumen'!B8",
    )
  })

  it('offsets distintos de 4', () => {
    assert.equal(desplazarFormula('B10', 1), 'B11')
    assert.equal(desplazarFormula('B10', 10), 'B20')
    assert.equal(desplazarFormula('B10', -5), 'B5')
  })

  it('offset negativo que llevaría la fila por debajo de 1 → no toca la ref', () => {
    assert.equal(desplazarFormula('B2+B3', -5), 'B2+B3')
    // Mixto: B2 no se puede bajar, B10 sí.
    assert.equal(desplazarFormula('B2+B10', -5), 'B2+B5')
  })

  it('funciones no pierden identidad al pasar por la regex', () => {
    const f = 'SUM(B2:B5)+IF(ISNUMBER(C2),C2,0)*AVERAGE(D2:D5)'
    assert.equal(
      desplazarFormula(f, 4),
      'SUM(B6:B9)+IF(ISNUMBER(C6),C6,0)*AVERAGE(D6:D9)',
    )
  })

  it('fórmulas reales de informeEconomicoExcel (hoja Resumen)', () => {
    assert.equal(desplazarFormula('B2/B4', 4), 'B6/B8')
    assert.equal(desplazarFormula('B2+B3', 4), 'B6+B7')
    assert.equal(desplazarFormula('B4-B5', 4), 'B8-B9')
    assert.equal(desplazarFormula('B6-B7-B8-B9-B10', 4), 'B10-B11-B12-B13-B14')
    assert.equal(desplazarFormula('B11/B4', 4), 'B15/B8')
  })

  it('fórmulas reales de informeEconomicoExcel (Canales venta)', () => {
    // Beneficio = E{row}-F{row}; SUM(B2:B3), SUM(D2:D3), etc. de la
    // hoja "Canales venta" cuando hay 2 filas (botella + copa).
    assert.equal(desplazarFormula('E2-F2', 4), 'E6-F6')
    assert.equal(desplazarFormula('SUM(E2:E3)', 4), 'SUM(E6:E7)')
    assert.equal(desplazarFormula('SUM(D2:D3)', 4), 'SUM(D6:D7)')
    assert.equal(desplazarFormula('E4-F4', 4), 'E8-F8')   // fila total
  })

  it('no reescribe nombres de función similares a refs sin dígitos', () => {
    // TRUE/FALSE sin dígitos, no deben alterarse.
    assert.equal(desplazarFormula('IF(TRUE,B2,FALSE)', 4), 'IF(TRUE,B6,FALSE)')
  })
})
