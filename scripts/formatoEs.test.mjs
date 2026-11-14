/**
 * Unit tests for app/lib/formatoEs.js
 * Ejecutar: node --test scripts/formatoEs.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatoMoneda,
  formatoDecimal,
  formatoPorcentaje,
  formatoVariacion,
  formatoPuntosPorcentuales,
  formatoMultiplicador,
  formatoMultiplicadorPrefijo,
  formatoMesCorto,
  formatoFechaCorta,
  formatoFechaDiaMesAnio,
  formatoFechaDiaMes,
} from '../app/lib/formatoEs.js'

describe('formatoMoneda miles:always', () => {
  it('4 cifras con separador de miles cuando miles=always', () => {
    assert.equal(formatoMoneda(1234, { miles: 'always' }), '1.234 €')
    assert.equal(formatoMoneda(1234.56, { miles: 'always' }), '1.234,56 €')
  })
  it('aun con 3 cifras, miles=always no afecta (no hay separador)', () => {
    assert.equal(formatoMoneda(999, { miles: 'always' }), '999 €')
  })
})

describe('formatoMultiplicadorPrefijo', () => {
  it('×1,35 con 2 decimales', () => {
    assert.equal(formatoMultiplicadorPrefijo(1.35), '×1,35')
  })
  it('milesimas con separador: ×1.346,00 (si es magnitud grande)', () => {
    assert.equal(formatoMultiplicadorPrefijo(1346), '×1.346,00')
  })
})

describe('formatoFechaDiaMesAnio', () => {
  it('ISO -> dd/mm/aaaa', () => {
    assert.equal(formatoFechaDiaMesAnio('2026-11-14'), '14/11/2026')
  })
  it('Date -> dd/mm/aaaa', () => {
    assert.equal(formatoFechaDiaMesAnio(new Date(2026, 10, 1)), '01/11/2026')
  })
})

describe('formatoFechaDiaMes', () => {
  it('10 nov', () => {
    assert.equal(formatoFechaDiaMes('2026-11-10'), '10 nov')
  })
})

describe('formatoMoneda', () => {
  it('4 cifras SIN separador de miles', () => {
    assert.equal(formatoMoneda(8025), '8025 €')
  })
  it('5 cifras CON separador de miles', () => {
    assert.equal(formatoMoneda(10035), '10.035 €')
  })
  it('decimales con coma cuando no son entero', () => {
    assert.equal(formatoMoneda(1234.5), '1234,50 €')
    assert.equal(formatoMoneda(12345.6), '12.345,60 €')
  })
  it('cero → "0 €"', () => {
    assert.equal(formatoMoneda(0), '0 €')
  })
  it('negativo mantiene el signo "−" nativo', () => {
    const s = formatoMoneda(-1234)
    assert.ok(s.endsWith(' €'))
    assert.ok(/^[-−]/.test(s), `Debe empezar con signo negativo: ${s}`)
  })
  it('null / undefined / NaN / "" → "—"', () => {
    assert.equal(formatoMoneda(null), '—')
    assert.equal(formatoMoneda(undefined), '—')
    assert.equal(formatoMoneda(NaN), '—')
    assert.equal(formatoMoneda(''), '—')
    assert.equal(formatoMoneda('abc'), '—')
  })
  it('signo:true antepone + en positivos', () => {
    assert.equal(formatoMoneda(100, { signo: true }), '+100 €')
    assert.equal(formatoMoneda(0, { signo: true }), '0 €')
  })
  it('decimales explícitos', () => {
    assert.equal(formatoMoneda(1234, { decimales: 2 }), '1234,00 €')
  })
})

describe('formatoDecimal', () => {
  it('2 decimales por defecto', () => {
    assert.equal(formatoDecimal(1234.5), '1234,50')
  })
  it('5 cifras usan separador de miles', () => {
    assert.equal(formatoDecimal(12345.6, 1), '12.345,6')
  })
  it('null → "—"', () => {
    assert.equal(formatoDecimal(null), '—')
  })
})

describe('formatoPorcentaje', () => {
  it('1 decimal con espacio y %', () => {
    assert.equal(formatoPorcentaje(29.78), '29,8 %')
  })
  it('0 decimales si se pide', () => {
    assert.equal(formatoPorcentaje(64, 0), '64 %')
  })
  it('null → "—"', () => {
    assert.equal(formatoPorcentaje(null), '—')
  })
})

describe('formatoVariacion', () => {
  it('siempre con signo', () => {
    assert.equal(formatoVariacion(12.5), '+12,5 %')
    const s = formatoVariacion(-100)
    assert.ok(/^[-−]/.test(s), `Debe empezar con negativo: ${s}`)
    assert.ok(s.endsWith(' %'))
  })
})

describe('formatoPuntosPorcentuales', () => {
  it('positivos con +, usa " p.p."', () => {
    assert.equal(formatoPuntosPorcentuales(1.2), '+1,2 p.p.')
  })
  it('null → "—"', () => {
    assert.equal(formatoPuntosPorcentuales(null), '—')
  })
})

describe('formatoMultiplicador', () => {
  it('2 decimales con x', () => {
    assert.equal(formatoMultiplicador(1.25), '1,25x')
    assert.equal(formatoMultiplicador(121.27), '121,27x')
  })
  it('miles si procede', () => {
    assert.equal(formatoMultiplicador(12345.6, 1), '12.345,6x')
  })
})

describe('formatoMesCorto', () => {
  it('YYYY-MM → "Mes YYYY"', () => {
    assert.equal(formatoMesCorto('2026-10'), 'Oct 2026')
    assert.equal(formatoMesCorto('2026-01'), 'Ene 2026')
  })
  it('entrada inválida → ""', () => {
    assert.equal(formatoMesCorto(null), '')
    assert.equal(formatoMesCorto(''), '')
  })
})

describe('formatoFechaCorta', () => {
  it('fecha ISO → "D mes YYYY"', () => {
    assert.equal(formatoFechaCorta('2025-01-01'), '1 ene 2025')
  })
  it('fecha D/M/YYYY', () => {
    assert.equal(formatoFechaCorta('1/1/2025'), '1 ene 2025')
  })
  it('null → "—"', () => {
    assert.equal(formatoFechaCorta(null), '—')
  })
})
