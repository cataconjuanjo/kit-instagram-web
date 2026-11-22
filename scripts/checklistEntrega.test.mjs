/**
 * FASE I — tests de lógica pura del checklist de entrega.
 *
 * No toca BD. Ejecuta: node --test scripts/checklistEntrega.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLAVES_CONFIRMACION_MANUAL,
  inventarioPreparado,
  referenciasCompletas,
  confirmacionMarcada,
  estadoChecklistEntrega,
  validarMarcarConfirmacion,
} from '../app/lib/checklistEntrega.js'

describe('CLAVES_CONFIRMACION_MANUAL', () => {
  it('es la lista permitida (y nada más)', () => {
    assert.deepEqual([...CLAVES_CONFIRMACION_MANUAL], ['qr_probado_en', 'mapa_revisado_en'])
  })
})

describe('inventarioPreparado', () => {
  it('control_stock_desde fijado → true', () => {
    assert.equal(inventarioPreparado({ control_stock_desde: '2026-11-21', conteos: [] }), true)
  })
  it('conteo inicial cerrado → true', () => {
    assert.equal(inventarioPreparado({ conteos: [{ tipo: 'inicial', estado: 'cerrado' }], control_stock_desde: null }), true)
  })
  it('conteo inicial con cerrado_en → true', () => {
    assert.equal(inventarioPreparado({ conteos: [{ tipo: 'inicial', cerrado_en: '2026-11-21T00:00:00Z' }], control_stock_desde: null }), true)
  })
  it('conteo inicial borrador → false', () => {
    assert.equal(inventarioPreparado({ conteos: [{ tipo: 'inicial', estado: 'borrador' }], control_stock_desde: null }), false)
  })
  it('sin conteos y sin fecha → false', () => {
    assert.equal(inventarioPreparado({ conteos: [], control_stock_desde: null }), false)
  })
  it('respuesta null/no objeto → false (no asume Listo)', () => {
    assert.equal(inventarioPreparado(null), false)
    assert.equal(inventarioPreparado(undefined), false)
    assert.equal(inventarioPreparado('ok'), false)
  })
  it('sin la clave conteos ni control_stock_desde → false (desconocido = no Listo)', () => {
    assert.equal(inventarioPreparado({ otra: 1 }), false)
  })
})

describe('referenciasCompletas', () => {
  const ok = { activo: true, nombre: 'Vino A', tipo: 'tinto', precio_botella: 20, coste_compra: 8 }
  it('array vacío → false (no hay vinos activos)', () => {
    assert.equal(referenciasCompletas([]), false)
  })
  it('sólo inactivos → false', () => {
    assert.equal(referenciasCompletas([{ ...ok, activo: false }]), false)
  })
  it('todos los activos completos → true', () => {
    assert.equal(referenciasCompletas([ok, { ...ok, nombre: 'B' }]), true)
  })
  it('algún activo sin precio → false', () => {
    assert.equal(referenciasCompletas([ok, { ...ok, nombre: 'B', precio_botella: 0 }]), false)
  })
  it('algún activo sin coste → false', () => {
    assert.equal(referenciasCompletas([ok, { ...ok, nombre: 'B', coste_compra: 0, coste_medio_pmp: 0 }]), false)
  })
  it('coste_medio_pmp cuenta como coste', () => {
    assert.equal(referenciasCompletas([{ activo: true, nombre: 'X', tipo: 'blanco', precio_botella: 15, coste_compra: 0, coste_medio_pmp: 5 }]), true)
  })
  it('algún activo sin nombre o sin tipo → false', () => {
    assert.equal(referenciasCompletas([{ ...ok, nombre: '' }]), false)
    assert.equal(referenciasCompletas([{ ...ok, tipo: null }]), false)
  })
  it('entrada no-array → false', () => {
    assert.equal(referenciasCompletas(null), false)
    assert.equal(referenciasCompletas('[]'), false)
  })
})

describe('confirmacionMarcada', () => {
  it('fecha ISO → true', () => {
    assert.equal(confirmacionMarcada({ qr_probado_en: '2026-11-22T10:00:00Z' }, 'qr_probado_en'), true)
  })
  it('null/vacío → false', () => {
    assert.equal(confirmacionMarcada({ qr_probado_en: null }, 'qr_probado_en'), false)
    assert.equal(confirmacionMarcada({ qr_probado_en: '' }, 'qr_probado_en'), false)
    assert.equal(confirmacionMarcada({}, 'qr_probado_en'), false)
  })
  it('clave fuera de la lista permitida → false (defensa)', () => {
    assert.equal(confirmacionMarcada({ ajeno: '2026-11-22' }, 'ajeno'), false)
  })
  it('checklistEntrega null → false', () => {
    assert.equal(confirmacionMarcada(null, 'qr_probado_en'), false)
  })
})

describe('estadoChecklistEntrega — integración', () => {
  it('restaurante recién creado (nada hecho) → 4 pendientes', () => {
    const e = estadoChecklistEntrega({
      respuestaConteos: { conteos: [], control_stock_desde: null },
      vinos: [],
      checklistEntrega: {},
    })
    assert.equal(e.inventario_preparado.pendiente, true)
    assert.equal(e.referencias_completas.pendiente, true)
    assert.equal(e.qr_probado.pendiente, true)
    assert.equal(e.mapa_revisado.pendiente, true)
  })

  it('todo hecho → 0 pendientes', () => {
    const e = estadoChecklistEntrega({
      respuestaConteos: { control_stock_desde: '2026-11-21', conteos: [] },
      vinos: [
        { activo: true, nombre: 'A', tipo: 'tinto', precio_botella: 20, coste_compra: 6 },
        { activo: true, nombre: 'B', tipo: 'blanco', precio_botella: 15, coste_medio_pmp: 5 },
      ],
      checklistEntrega: { qr_probado_en: '2026-11-22', mapa_revisado_en: '2026-11-22' },
    })
    assert.equal(e.inventario_preparado.pendiente, false)
    assert.equal(e.referencias_completas.pendiente, false)
    assert.equal(e.qr_probado.pendiente, false)
    assert.equal(e.mapa_revisado.pendiente, false)
  })

  it('shape estable: confirmable y clave en los 2 manuales', () => {
    const e = estadoChecklistEntrega({})
    assert.equal(e.qr_probado.confirmable, true)
    assert.equal(e.qr_probado.clave, 'qr_probado_en')
    assert.equal(e.mapa_revisado.confirmable, true)
    assert.equal(e.mapa_revisado.clave, 'mapa_revisado_en')
    assert.equal(e.inventario_preparado.confirmable, false)
    assert.equal(e.referencias_completas.confirmable, false)
  })
})

describe('validarMarcarConfirmacion', () => {
  it('body válido', () => {
    assert.deepEqual(
      validarMarcarConfirmacion({ clave: 'qr_probado_en', marcar: true }),
      { ok: true, clave: 'qr_probado_en', marcar: true },
    )
    assert.deepEqual(
      validarMarcarConfirmacion({ clave: 'mapa_revisado_en', marcar: false }),
      { ok: true, clave: 'mapa_revisado_en', marcar: false },
    )
  })
  it('rechaza claves ajenas', () => {
    assert.equal(validarMarcarConfirmacion({ clave: 'inyectada', marcar: true }).ok, false)
  })
  it('rechaza marcar no-boolean', () => {
    assert.equal(validarMarcarConfirmacion({ clave: 'qr_probado_en', marcar: 'si' }).ok, false)
  })
  it('rechaza body inválido', () => {
    assert.equal(validarMarcarConfirmacion(null).ok, false)
    assert.equal(validarMarcarConfirmacion('x').ok, false)
  })
})
