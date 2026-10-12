/**
 * test-agregar-periodo-bodega.mjs
 * Unit tests para _agruparLineas (sin conexión a base de datos).
 *
 * Uso: node --test scripts/test-agregar-periodo-bodega.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { _agruparLineas } from '../app/lib/agregarPeriodoBodega.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function linea(tipo, cantidad, precioUnitario, extra = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    vino_id: extra.vino_id || 'vino-A',
    tipo,
    cantidad,
    copas_vendidas: extra.copas_vendidas ?? null,
    mesa: extra.mesa ?? null,
    precio_unitario: precioUnitario,
    vino: { id: extra.vino_id || 'vino-A', nombre: extra.nombre || 'Vino A',
            coste_medio_pmp: extra.coste ?? null, coste_compra: null },
    parte: extra.parte ?? { fecha: '2026-10-07', turno: 'noche' },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('_agruparLineas — lineas vacías', () => {
  it('devuelve ceros para array vacío', () => {
    const r = _agruparLineas([])
    assert.equal(r.resumen.ingresos_venta, 0)
    assert.equal(r.resumen.botellas_vendidas, 0)
    assert.equal(r.por_vino.length, 0)
  })
})

describe('_agruparLineas — venta_botella', () => {
  const lineas = [
    linea('venta_botella', 2, 30, { vino_id: 'vino-A', nombre: 'Ribera',  coste: 10 }),
    linea('venta_botella', 1, 45, { vino_id: 'vino-B', nombre: 'Priorat', coste: null }),
  ]
  const r = _agruparLineas(lineas, { copas_por_botella: 5 })

  it('ingresos_venta = 2×30 + 1×45 = 105', () => {
    assert.equal(r.resumen.ingresos_venta, 105)
  })
  it('botellas_vendidas = 3', () => {
    assert.equal(r.resumen.botellas_vendidas, 3)
  })
  it('canal.botella.uds = 3', () => {
    assert.equal(r.por_canal.botella.uds, 3)
  })
  it('canal.botella.ingresos = 105', () => {
    assert.equal(r.por_canal.botella.ingresos, 105)
  })
  it('vino con coste tiene margen_pct', () => {
    const v = r.por_vino.find(v => v.vino_id === 'vino-A')
    assert.ok(v.tiene_coste)
    // margen = (60 - 20) / 60 = 66.67% → 67
    assert.equal(v.margen_pct, 67)
  })
  it('vino sin coste: tiene_coste=false, margen_pct=null', () => {
    const v = r.por_vino.find(v => v.vino_id === 'vino-B')
    assert.equal(v.tiene_coste, false)
    assert.equal(v.margen_pct, null)
  })
})

describe('_agruparLineas — venta_copa', () => {
  const lineas = [
    linea('venta_copa', 1, 8, { vino_id: 'vino-C', nombre: 'Albariño', copas_vendidas: 4 }),
  ]
  const r = _agruparLineas(lineas, { copas_por_botella: 5 })

  it('ingresos_venta = 8 × 4 copas = 32', () => {
    assert.equal(r.resumen.ingresos_venta, 32)
  })
  it('copas_vendidas = 4', () => {
    assert.equal(r.resumen.copas_vendidas, 4)
  })
  it('botellas_equivalentes = 4/5 = 0.8', () => {
    assert.equal(r.resumen.botellas_equivalentes, 0.8)
  })
  it('copa no suma a botellas_vendidas', () => {
    assert.equal(r.resumen.botellas_vendidas, 0)
  })
  it('canal.copa.copas = 4', () => {
    assert.equal(r.por_canal.copa.copas, 4)
  })
  it('por_vino: copa suma a copas, no a uds', () => {
    const v = r.por_vino.find(v => v.vino_id === 'vino-C')
    assert.equal(v.copas, 4)
    assert.equal(v.uds,   0)
  })
})

describe('_agruparLineas — invitaciones y consumos', () => {
  const lineas = [
    linea('invitacion_botella', 1, 0, { vino_id: 'vino-A' }),
    linea('invitacion_copa',    1, 0, { vino_id: 'vino-A', copas_vendidas: 2 }),
    linea('cocina',    1, 20, { vino_id: 'vino-B' }),
    linea('grupo_evento', 2, 0, { vino_id: 'vino-C' }),
    linea('maridaje',  1, 15, { vino_id: 'vino-D' }),
    linea('rotura',    1, 0,  { vino_id: 'vino-E' }),
    linea('cata',      2, 10, { vino_id: 'vino-F' }),
  ]
  const r = _agruparLineas(lineas)

  it('ingresos_venta = 0 (solo ventas cuentan)', () => {
    assert.equal(r.resumen.ingresos_venta, 0)
  })
  it('invitaciones_uds: 1 botella + 2 copas = 3', () => {
    assert.equal(r.resumen.invitaciones_uds, 3)
  })
  it('consumos_uds = 1+2+1+1+2 = 7', () => {
    assert.equal(r.resumen.consumos_uds, 7)
  })
  it('consumos_valor = 20+0+15+0+20 = 55', () => {
    assert.equal(r.resumen.consumos_valor, 55)
  })
})

describe('_agruparLineas — por_dia_turno y por_mesa', () => {
  const lineas = [
    linea('venta_botella', 1, 30, {
      parte: { fecha: '2026-10-07', turno: 'mediodia' }, mesa: '5',
    }),
    linea('venta_botella', 2, 25, {
      parte: { fecha: '2026-10-07', turno: 'noche'    }, mesa: '5',
    }),
    linea('venta_botella', 1, 40, {
      parte: { fecha: '2026-10-08', turno: 'noche'    }, mesa: null,
    }),
  ]
  const r = _agruparLineas(lineas)

  it('por_dia_turno: 3 entradas', () => {
    assert.equal(r.por_dia_turno.length, 3)
  })
  it('primer día: mediodia, ingresos=30', () => {
    const d = r.por_dia_turno.find(d => d.turno === 'mediodia')
    assert.equal(d.ingresos, 30)
  })
  it('por_mesa: 1 entrada para mesa "5"', () => {
    assert.equal(r.por_mesa.length, 1)
    assert.equal(r.por_mesa[0].mesa, '5')
    assert.equal(r.por_mesa[0].ingresos, 30 + 50)
  })
})

describe('_agruparLineas — top 5 vinos', () => {
  const lineas = [
    linea('venta_botella', 1, 10, { vino_id: 'v1', nombre: 'V1' }),
    linea('venta_botella', 2, 20, { vino_id: 'v2', nombre: 'V2' }),
    linea('venta_botella', 3, 30, { vino_id: 'v3', nombre: 'V3' }),
    linea('venta_botella', 4, 40, { vino_id: 'v4', nombre: 'V4' }),
    linea('venta_botella', 5, 50, { vino_id: 'v5', nombre: 'V5' }),
    linea('venta_botella', 6, 60, { vino_id: 'v6', nombre: 'V6' }),
  ]
  const r = _agruparLineas(lineas)

  it('top_ingresos tiene 5 elementos', () => {
    assert.equal(r.top_ingresos.length, 5)
  })
  it('top_ingresos[0] es v6 (360 EUR)', () => {
    assert.equal(r.top_ingresos[0].vino_id, 'v6')
  })
  it('top_uds[0] es v6 (6 uds)', () => {
    assert.equal(r.top_uds[0].vino_id, 'v6')
  })
})
