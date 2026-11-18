/**
 * Unit tests for app/lib/historicoExtras.js
 * Ejecutar: node --test scripts/historicoExtras.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  EXTRAS_KEYS,
  extrasHistoricoPayload,
  formatComaEs,
  leerExtrasHistorico,
  parseComaEs,
  ratiosHistoricos,
  tieneHistoricoExtras,
} from '../app/lib/historicoExtras.js'

describe('EXTRAS_KEYS', () => {
  it('son exactamente las 4 columnas y en orden canónico', () => {
    assert.deepEqual([...EXTRAS_KEYS], [
      'valor_stock_bodega',
      'stock_inicial_valor',
      'stock_final_valor',
      'compras_total',
    ])
    assert.ok(Object.isFrozen(EXTRAS_KEYS))
  })
})

describe('leerExtrasHistorico — regla "todos a 0/NULL ≡ Sin dato"', () => {
  it('fila con los 4 a 0 → 4 nulls', () => {
    const r = leerExtrasHistorico({
      valor_stock_bodega: 0, stock_inicial_valor: 0,
      stock_final_valor: 0,  compras_total: 0,
    })
    assert.deepEqual(r, {
      valor_stock_bodega: null, stock_inicial_valor: null,
      stock_final_valor: null,  compras_total: null,
    })
  })

  it('fila con los 4 a NULL → 4 nulls', () => {
    const r = leerExtrasHistorico({
      valor_stock_bodega: null, stock_inicial_valor: null,
      stock_final_valor: null,  compras_total: null,
    })
    assert.ok(EXTRAS_KEYS.every(k => r[k] === null))
  })

  it('mezcla NULL + 0 entre los 4 → sigue siendo "Sin dato"', () => {
    const r = leerExtrasHistorico({
      valor_stock_bodega: null, stock_inicial_valor: 0,
      stock_final_valor: null,  compras_total: 0,
    })
    assert.ok(EXTRAS_KEYS.every(k => r[k] === null))
  })

  it('fila con al menos un valor ≠ 0 → se preservan todos, los 0 incluidos', () => {
    const r = leerExtrasHistorico({
      valor_stock_bodega: 0,
      stock_inicial_valor: 1200,
      stock_final_valor: 0,
      compras_total: 800,
    })
    assert.equal(r.valor_stock_bodega, 0)
    assert.equal(r.stock_inicial_valor, 1200)
    assert.equal(r.stock_final_valor, 0)
    assert.equal(r.compras_total, 800)
  })

  it('fila ausente/null/undefined → 4 nulls', () => {
    assert.ok(EXTRAS_KEYS.every(k => leerExtrasHistorico(null)[k] === null))
    assert.ok(EXTRAS_KEYS.every(k => leerExtrasHistorico(undefined)[k] === null))
    assert.ok(EXTRAS_KEYS.every(k => leerExtrasHistorico({})[k] === null))
  })

  it('valores no numéricos → null', () => {
    const r = leerExtrasHistorico({
      valor_stock_bodega: 'abc',
      stock_inicial_valor: Number.NaN,
      stock_final_valor: 100,
      compras_total: '',
    })
    assert.equal(r.valor_stock_bodega, null)
    assert.equal(r.stock_inicial_valor, null)
    assert.equal(r.stock_final_valor, 100)
    assert.equal(r.compras_total, null)
  })
})

describe('tieneHistoricoExtras', () => {
  it('true si al menos uno es finito y ≠ 0', () => {
    assert.equal(tieneHistoricoExtras({ stock_inicial_valor: 10 }), true)
  })
  it('false si todos son null/0', () => {
    assert.equal(tieneHistoricoExtras({}), false)
    assert.equal(tieneHistoricoExtras({
      valor_stock_bodega: 0, stock_inicial_valor: null,
      stock_final_valor: 0,  compras_total: null,
    }), false)
  })
})

describe('parseComaEs — coma decimal española', () => {
  it('parsea cadenas con coma', () => {
    assert.equal(parseComaEs('1.234,56'), 1234.56)
    assert.equal(parseComaEs('1234,5'), 1234.5)
    assert.equal(parseComaEs('0,05'), 0.05)
    assert.equal(parseComaEs('0'), 0)
    assert.equal(parseComaEs('1000'), 1000)
  })
  it('acepta números directamente', () => {
    assert.equal(parseComaEs(42), 42)
    assert.equal(parseComaEs(0), 0)
  })
  it('vacío / null → null', () => {
    assert.equal(parseComaEs(''), null)
    assert.equal(parseComaEs('   '), null)
    assert.equal(parseComaEs(null), null)
    assert.equal(parseComaEs(undefined), null)
  })
  it('entradas inválidas → null (sin coerción)', () => {
    assert.equal(parseComaEs('abc'), null)
    assert.equal(parseComaEs('1,2,3'), null)
    assert.equal(parseComaEs(-5), null)
    assert.equal(parseComaEs('-10'), null)
    assert.equal(parseComaEs('-1,5'), null)
    assert.equal(parseComaEs(Number.NaN), null)
  })
})

describe('formatComaEs', () => {
  it('formatea con dos decimales por defecto', () => {
    assert.equal(formatComaEs(1234.5), '1.234,50')
    assert.equal(formatComaEs(0), '0,00')
  })
  it('respeta `decimales`', () => {
    assert.equal(formatComaEs(1234.567, { decimales: 3 }), '1.234,567')
    assert.equal(formatComaEs(1234.567, { decimales: 0 }), '1.235')
  })
  it('null / no finito → ""', () => {
    assert.equal(formatComaEs(null), '')
    assert.equal(formatComaEs(undefined), '')
    assert.equal(formatComaEs(Number.NaN), '')
  })
})

describe('extrasHistoricoPayload', () => {
  it('omite claves vacías y preserva números', () => {
    const p = extrasHistoricoPayload({
      stock_inicial_valor: '1.234,56',
      stock_final_valor: '',
      compras_total: '800',
      valor_stock_bodega: null,
    })
    assert.deepEqual(p, { stock_inicial_valor: 1234.56, compras_total: 800 })
  })
  it('todas vacías → objeto {}', () => {
    assert.deepEqual(extrasHistoricoPayload({
      valor_stock_bodega: '', stock_inicial_valor: '',
      stock_final_valor: '',  compras_total: '',
    }), {})
  })
})

describe('ratiosHistoricos', () => {
  it('calcula rotación, cobertura y consumo/compras con todos los datos', () => {
    const extras = {
      stock_inicial_valor: 1000,
      stock_final_valor: 800,
      compras_total: 500,
    }
    const r = ratiosHistoricos({ extras, consumo_mp: 450, dias: 30 })
    //   stock_medio = (1000 + 800) / 2 = 900
    //   rotacion = 450 / 900 = 0.5
    //   cobertura = 800 * 30 / 450 ≈ 53.333
    //   consumo/compras = 450 / 500 = 0.9
    assert.equal(r.rotacion, 0.5)
    assert.equal(r.stock_medio, 900)
    assert.ok(Math.abs(r.cobertura_dias - 53.333) < 0.01)
    assert.equal(r.consumo_vs_compras, 0.9)
  })

  it('con extras "Sin dato" (los 4 nulls) → los 3 ratios null', () => {
    const extras = leerExtrasHistorico({})
    const r = ratiosHistoricos({ extras, consumo_mp: 500, dias: 30 })
    assert.equal(r.rotacion, null)
    assert.equal(r.cobertura_dias, null)
    assert.equal(r.consumo_vs_compras, null)
  })

  it('stock_medio = 0 → rotacion null (no divide por cero)', () => {
    const r = ratiosHistoricos({
      extras: { stock_inicial_valor: 0, stock_final_valor: 0 },
      consumo_mp: 100, dias: 30,
    })
    assert.equal(r.rotacion, null)
  })

  it('consumo_mp = 0 → cobertura null', () => {
    const r = ratiosHistoricos({
      extras: { stock_inicial_valor: 100, stock_final_valor: 100 },
      consumo_mp: 0, dias: 30,
    })
    assert.equal(r.cobertura_dias, null)
  })

  it('compras_total = 0 → consumo/compras null', () => {
    const r = ratiosHistoricos({
      extras: { stock_inicial_valor: 100, stock_final_valor: 100, compras_total: 0 },
      consumo_mp: 50, dias: 30,
    })
    assert.equal(r.consumo_vs_compras, null)
  })

  it('con solo algunos extras (p. ej. stock final + consumo) → solo cobertura', () => {
    const r = ratiosHistoricos({
      extras: { stock_final_valor: 800 },
      consumo_mp: 400, dias: 30,
    })
    assert.equal(r.rotacion, null)        // falta stock_inicial
    assert.ok(Math.abs(r.cobertura_dias - 60) < 0.01)
    assert.equal(r.consumo_vs_compras, null)  // falta compras_total
  })
})

describe('Compat pre/post SQL: comparación año anterior', () => {
  it('fila pre-SQL (4 ceros) y fila post-SQL (4 nulls) deben producir la misma lectura', () => {
    const preSql  = { valor_stock_bodega: 0, stock_inicial_valor: 0, stock_final_valor: 0, compras_total: 0 }
    const postSql = { valor_stock_bodega: null, stock_inicial_valor: null, stock_final_valor: null, compras_total: null }
    assert.deepEqual(leerExtrasHistorico(preSql), leerExtrasHistorico(postSql))
    assert.equal(tieneHistoricoExtras(preSql), tieneHistoricoExtras(postSql))
  })
})
