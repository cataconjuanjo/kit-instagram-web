/**
 * FASE I — tests de lógica pura de parámetros de bodega.
 *
 * No toca BD. Ejecuta: node --test scripts/parametrosBodega.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULTS,
  FUENTES_VENTAS_VALIDAS,
  FUENTE_VENTAS_UI_ELEGIBLE,
  FUENTES_VENTAS_NO_DISPONIBLES,
  validarParametros,
  construirVistaParametros,
} from '../app/lib/parametrosBodega.js'

describe('DEFAULTS canónicos', () => {
  it('coinciden con schema + agregador', () => {
    assert.equal(DEFAULTS.copas_por_botella, 5)
    assert.equal(DEFAULTS.iva_venta_pct, 10)
    assert.equal(DEFAULTS.merma_copa_pct, 10)
    assert.equal(DEFAULTS.fuente_ventas, null)
  })
  it('es inmutable (Object.freeze)', () => {
    assert.throws(() => { DEFAULTS.copas_por_botella = 99 })
  })
})

describe('FUENTES_VENTAS_VALIDAS', () => {
  it('coinciden con CHECK del schema b1_movimientos_expand', () => {
    assert.deepEqual([...FUENTES_VENTAS_VALIDAS].sort(), ['ambas', 'parte', 'tpv'])
  })
  it('UI elegible = parte (único implementado hoy)', () => {
    assert.equal(FUENTE_VENTAS_UI_ELEGIBLE, 'parte')
  })
  it('no disponibles = tpv y ambas (preservan si ya se guardó)', () => {
    assert.deepEqual([...FUENTES_VENTAS_NO_DISPONIBLES].sort(), ['ambas', 'tpv'])
  })
})

describe('validarParametros — copas_por_botella', () => {
  it('acepta entero 1-12', () => {
    assert.deepEqual(validarParametros({ copas_por_botella: 6 }), { ok: true, normalizado: { copas_por_botella: 6 } })
    assert.deepEqual(validarParametros({ copas_por_botella: 1 }), { ok: true, normalizado: { copas_por_botella: 1 } })
    assert.deepEqual(validarParametros({ copas_por_botella: 12 }), { ok: true, normalizado: { copas_por_botella: 12 } })
  })
  it('string numérico se coerce', () => {
    assert.deepEqual(validarParametros({ copas_por_botella: '6' }), { ok: true, normalizado: { copas_por_botella: 6 } })
  })
  it('rechaza decimales, fuera de rango, NaN', () => {
    assert.equal(validarParametros({ copas_por_botella: 5.5 }).ok, false)
    assert.equal(validarParametros({ copas_por_botella: 0 }).ok, false)
    assert.equal(validarParametros({ copas_por_botella: 13 }).ok, false)
    assert.equal(validarParametros({ copas_por_botella: -1 }).ok, false)
    assert.equal(validarParametros({ copas_por_botella: 'abc' }).ok, false)
  })
})

describe('validarParametros — iva_venta_pct / merma_copa_pct', () => {
  it('redondea a 2 decimales', () => {
    assert.deepEqual(validarParametros({ iva_venta_pct: 10.005 }), { ok: true, normalizado: { iva_venta_pct: 10.01 } })
    assert.deepEqual(validarParametros({ merma_copa_pct: 2.345 }), { ok: true, normalizado: { merma_copa_pct: 2.35 } })
  })
  it('acepta rango 0..30', () => {
    assert.equal(validarParametros({ iva_venta_pct: 0 }).ok, true)
    assert.equal(validarParametros({ iva_venta_pct: 30 }).ok, true)
    assert.equal(validarParametros({ merma_copa_pct: 0 }).ok, true)
    assert.equal(validarParametros({ merma_copa_pct: 30 }).ok, true)
  })
  it('rechaza fuera de rango', () => {
    assert.equal(validarParametros({ iva_venta_pct: -1 }).ok, false)
    assert.equal(validarParametros({ iva_venta_pct: 30.01 }).ok, false)
    assert.equal(validarParametros({ merma_copa_pct: -0.01 }).ok, false)
    assert.equal(validarParametros({ merma_copa_pct: 50 }).ok, false)
  })
})

describe('validarParametros — fuente_ventas', () => {
  it('acepta todos los valores del CHECK + null', () => {
    assert.equal(validarParametros({ fuente_ventas: 'parte' }).ok, true)
    assert.equal(validarParametros({ fuente_ventas: 'tpv' }).ok, true)
    assert.equal(validarParametros({ fuente_ventas: 'ambas' }).ok, true)
    assert.deepEqual(validarParametros({ fuente_ventas: null }), { ok: true, normalizado: { fuente_ventas: null } })
    assert.deepEqual(validarParametros({ fuente_ventas: '' }), { ok: true, normalizado: { fuente_ventas: null } })
  })
  it('rechaza valores ajenos al CHECK', () => {
    assert.equal(validarParametros({ fuente_ventas: 'excel' }).ok, false)
    assert.equal(validarParametros({ fuente_ventas: 42 }).ok, false)
  })
})

describe('validarParametros — upsert parcial', () => {
  it('ignora claves no presentes (no las incluye en normalizado)', () => {
    const r = validarParametros({ copas_por_botella: 6 })
    assert.deepEqual(r, { ok: true, normalizado: { copas_por_botella: 6 } })
    assert.equal('iva_venta_pct' in r.normalizado, false)
    assert.equal('fuente_ventas' in r.normalizado, false)
  })
  it('acumula errores de varios campos', () => {
    const r = validarParametros({ copas_por_botella: 20, iva_venta_pct: 50 })
    assert.equal(r.ok, false)
    assert.equal(r.errores.length, 2)
    const campos = r.errores.map(e => e.campo).sort()
    assert.deepEqual(campos, ['copas_por_botella', 'iva_venta_pct'])
  })
  it('entrada no-objeto → error', () => {
    assert.equal(validarParametros(null).ok, false)
    assert.equal(validarParametros('oops').ok, false)
  })
})

describe('construirVistaParametros — GET', () => {
  it('sin fila → todos los campos defaults, todos por_defecto=true', () => {
    const v = construirVistaParametros(null)
    assert.equal(v.existe_fila, false)
    assert.deepEqual(v.valores, { ...DEFAULTS })
    assert.deepEqual(v.por_defecto, {
      copas_por_botella: true, iva_venta_pct: true, merma_copa_pct: true, fuente_ventas: true,
    })
  })
  it('fila con todos los campos → por_defecto=false', () => {
    const v = construirVistaParametros({
      copas_por_botella: 6, iva_venta_pct: 21, merma_copa_pct: 5, fuente_ventas: 'parte',
    })
    assert.equal(v.existe_fila, true)
    assert.deepEqual(v.valores, { copas_por_botella: 6, iva_venta_pct: 21, merma_copa_pct: 5, fuente_ventas: 'parte' })
    assert.deepEqual(v.por_defecto, {
      copas_por_botella: false, iva_venta_pct: false, merma_copa_pct: false, fuente_ventas: false,
    })
  })
  it('fila parcial → mezcla valor + default por campo', () => {
    const v = construirVistaParametros({ copas_por_botella: 6, iva_venta_pct: null, merma_copa_pct: 3, fuente_ventas: null })
    assert.equal(v.valores.copas_por_botella, 6)
    assert.equal(v.por_defecto.copas_por_botella, false)
    assert.equal(v.valores.iva_venta_pct, DEFAULTS.iva_venta_pct)
    assert.equal(v.por_defecto.iva_venta_pct, true)
    assert.equal(v.valores.merma_copa_pct, 3)
    assert.equal(v.por_defecto.merma_copa_pct, false)
    assert.equal(v.valores.fuente_ventas, null)
    assert.equal(v.por_defecto.fuente_ventas, true)
  })
})
