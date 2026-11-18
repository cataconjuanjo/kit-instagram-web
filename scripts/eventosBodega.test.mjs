/**
 * Unit tests para app/lib/eventosBodega.js.
 * Ejecutar: node --test scripts/eventosBodega.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIPOS_EVENTO,
  MENU_TIPOS,
  brutoDesdeNeto,
  esRelacionInexistente,
  ingresosCanalDesdeEventos,
  netoDesdeBruto,
  parseEventoForm,
  sumarEventosPorTipo,
} from '../app/lib/eventosBodega.js'

describe('Constantes del dominio', () => {
  it('tipos y menús canónicos', () => {
    assert.deepEqual([...TIPOS_EVENTO], ['grupo', 'maridaje'])
    assert.deepEqual([...MENU_TIPOS], ['rock', 'premium', 'otro'])
  })
})

describe('netoDesdeBruto / brutoDesdeNeto', () => {
  it('IVA 10 %: 110 bruto → 100 neto; 100 neto → 110 bruto', () => {
    assert.equal(netoDesdeBruto(110, 10), 100)
    assert.equal(brutoDesdeNeto(100, 10), 110)
  })
  it('IVA 0 %: neto = bruto', () => {
    assert.equal(netoDesdeBruto(250, 0), 250)
    assert.equal(brutoDesdeNeto(250, 0), 250)
  })
  it('IVA fuera de rango (negativo / >25) → null', () => {
    assert.equal(netoDesdeBruto(110, -1), null)
    assert.equal(netoDesdeBruto(110, 30), null)
    assert.equal(brutoDesdeNeto(100, 30), null)
  })
  it('null-safe', () => {
    assert.equal(netoDesdeBruto(null, 10), null)
    assert.equal(netoDesdeBruto(100, null), null)
    assert.equal(netoDesdeBruto('', 10), null)
  })
  it('parser es-ES: "1.234,56" / "99,00"', () => {
    assert.equal(netoDesdeBruto('1.100,00', 10), 1000)
    assert.equal(netoDesdeBruto('110,00', 10), 100)
  })
})

describe('parseEventoForm — validaciones', () => {
  it('fecha vacía / mal formada → error', () => {
    assert.equal(parseEventoForm({}).ok, false)
    assert.equal(parseEventoForm({ fecha: '2026/11/18' }).ok, false)
    assert.equal(parseEventoForm({ fecha: 'mañana' }).ok, false)
  })
  it('tipo inválido → error', () => {
    const r = parseEventoForm({ fecha: '2026-11-18', tipo: 'otro' })
    assert.equal(r.ok, false)
    assert.equal(r.field, 'tipo')
  })
  it('menu_tipo inválido → error', () => {
    const r = parseEventoForm({ fecha: '2026-11-18', tipo: 'grupo', menu_tipo: 'jazz' })
    assert.equal(r.ok, false)
    assert.equal(r.field, 'menu_tipo')
  })
  it('num_comensales negativo o decimal → error', () => {
    const r1 = parseEventoForm({ fecha: '2026-11-18', tipo: 'grupo', num_comensales: -1 })
    assert.equal(r1.field, 'num_comensales')
    const r2 = parseEventoForm({ fecha: '2026-11-18', tipo: 'grupo', num_comensales: 3.5 })
    assert.equal(r2.field, 'num_comensales')
  })
  it('IVA fuera de rango → error', () => {
    const r = parseEventoForm({ fecha: '2026-11-18', tipo: 'grupo', iva_pct: 30 })
    assert.equal(r.ok, false)
    assert.equal(r.field, 'iva_pct')
  })
  it('importes negativos → error', () => {
    const r = parseEventoForm({ fecha: '2026-11-18', tipo: 'grupo', importe_neto: -5 })
    assert.equal(r.ok, false)
    assert.equal(r.field, 'importe_neto')
  })
})

describe('parseEventoForm — normalización', () => {
  it('derive neto desde bruto cuando sólo llega bruto + iva', () => {
    const r = parseEventoForm({
      fecha: '2026-11-18', tipo: 'maridaje', menu_tipo: 'rock',
      importe_bruto: 220, iva_pct: 10, num_comensales: 5,
    })
    assert.equal(r.ok, true)
    assert.equal(r.value.importe_neto, 200)
    assert.equal(r.value.importe_bruto, 220)
  })
  it('derive bruto desde neto cuando sólo llega neto', () => {
    const r = parseEventoForm({
      fecha: '2026-11-18', tipo: 'grupo', importe_neto: 500,
    })
    assert.equal(r.value.importe_bruto, 550)   // 500 × 1.10 (IVA default 10)
  })
  it('sin importes → neto=0, bruto=null', () => {
    const r = parseEventoForm({ fecha: '2026-11-18', tipo: 'grupo' })
    assert.equal(r.value.importe_neto, 0)
    assert.equal(r.value.importe_bruto, null)
  })
  it('acepta coma decimal es-ES "1.100,00"', () => {
    const r = parseEventoForm({
      fecha: '2026-11-18', tipo: 'maridaje',
      importe_bruto: '1.100,00', iva_pct: 10,
    })
    assert.equal(r.value.importe_neto, 1000)
  })
  it('normaliza menu_nombre (trim, slice 120)', () => {
    const r = parseEventoForm({
      fecha: '2026-11-18', tipo: 'maridaje',
      menu_nombre: '   Menú Rock 2026-11   ',
    })
    assert.equal(r.value.menu_nombre, 'Menú Rock 2026-11')
    const largo = 'x'.repeat(200)
    const r2 = parseEventoForm({ fecha: '2026-11-18', tipo: 'maridaje', menu_nombre: largo })
    assert.equal(r2.value.menu_nombre.length, 120)
  })
  it('incluido_en_tpv respeta booleano', () => {
    const r = parseEventoForm({
      fecha: '2026-11-18', tipo: 'grupo', incluido_en_tpv: true,
    })
    assert.equal(r.value.incluido_en_tpv, true)
    const r2 = parseEventoForm({ fecha: '2026-11-18', tipo: 'grupo' })
    assert.equal(r2.value.incluido_en_tpv, false)
  })
})

// ── Agregación ──────────────────────────────────────────────────────

function ev({ tipo, neto, bruto = null, pax = 0, tpv = false }) {
  return {
    tipo, importe_neto: neto, importe_bruto: bruto,
    num_comensales: pax, incluido_en_tpv: tpv,
  }
}

describe('sumarEventosPorTipo', () => {
  it('suma por tipo y excluye incluido_en_tpv de ingresos_para_canal', () => {
    const eventos = [
      ev({ tipo: 'maridaje', neto: 200, bruto: 220, pax: 4 }),
      ev({ tipo: 'maridaje', neto: 500, bruto: 550, pax: 10 }),
      ev({ tipo: 'grupo',    neto: 300, bruto: 330, pax: 8 }),
      ev({ tipo: 'grupo',    neto: 100, bruto: 110, pax: 2, tpv: true }),
    ]
    const r = sumarEventosPorTipo(eventos)
    assert.equal(r.maridaje.n, 2)
    assert.equal(r.maridaje.importe_neto_total, 700)
    assert.equal(r.maridaje.comensales_total, 14)
    assert.equal(r.grupo.n, 2)
    assert.equal(r.grupo.importe_neto_total, 400)
    // Ingresos para canal: grupo-tpv NO cuenta, maridaje-tpv tampoco.
    // Resultado: 200+500+300 = 1000.
    assert.equal(r.ingresos_netos_para_canal, 1000)
    assert.equal(r.excluidos_tpv, 1)
  })
  it('array vacío → ceros', () => {
    const r = sumarEventosPorTipo([])
    assert.equal(r.grupo.n, 0)
    assert.equal(r.maridaje.n, 0)
    assert.equal(r.ingresos_netos_para_canal, 0)
  })
  it('null-safe', () => {
    assert.equal(sumarEventosPorTipo(null).ingresos_netos_para_canal, 0)
  })
})

describe('ingresosCanalDesdeEventos', () => {
  it('mapea grupo→evento, maridaje→maridaje, excluye tpv', () => {
    const r = ingresosCanalDesdeEventos([
      ev({ tipo: 'grupo',    neto: 300 }),
      ev({ tipo: 'maridaje', neto: 500 }),
      ev({ tipo: 'maridaje', neto: 100, tpv: true }),
    ])
    assert.deepEqual(r, { evento: 300, maridaje: 500 })
  })
  it('todo tpv → {0,0}', () => {
    const r = ingresosCanalDesdeEventos([
      ev({ tipo: 'grupo',    neto: 300, tpv: true }),
      ev({ tipo: 'maridaje', neto: 500, tpv: true }),
    ])
    assert.deepEqual(r, { evento: 0, maridaje: 0 })
  })
})

describe('esRelacionInexistente — códigos reales de PostgREST/Postgres', () => {
  it('code PGRST205 → true (el que devuelve Supabase cuando falta migración)', () => {
    // Mensaje real tomado del preview de Casa Marisma 50f5c3d5:
    assert.equal(
      esRelacionInexistente({
        code: 'PGRST205',
        message: "Could not find the table 'public.eventos_bodega' in the schema cache",
        hint: null,
        details: null,
      }),
      true,
    )
  })
  it('code 42P01 → true (undefined_table de Postgres nativo)', () => {
    assert.equal(esRelacionInexistente({ code: '42P01' }), true)
  })
  it('code PGRST200 → true (variante legacy de PostgREST)', () => {
    assert.equal(esRelacionInexistente({ code: 'PGRST200' }), true)
  })
  it('message con "relation ... does not exist" → true (sin code)', () => {
    assert.equal(
      esRelacionInexistente({ message: 'relation "eventos_bodega" does not exist' }),
      true,
    )
  })
  it('message con "schema cache" → true', () => {
    assert.equal(
      esRelacionInexistente({ message: "table not found in schema cache" }),
      true,
    )
  })
  it('message con "Could not find the table" → true (case-insensitive)', () => {
    assert.equal(
      esRelacionInexistente({ message: "Could not find the table 'public.X'" }),
      true,
    )
  })
  it('hint con la frase (fallback) → true', () => {
    assert.equal(
      esRelacionInexistente({ hint: "The table does not exist, apply migration" }),
      true,
    )
  })
  it('42501 insufficient_privilege (RLS) → false (es error REAL)', () => {
    assert.equal(
      esRelacionInexistente({ code: '42501', message: 'permission denied for table eventos_bodega' }),
      false,
    )
  })
  it('23505 unique_violation → false', () => {
    assert.equal(
      esRelacionInexistente({ code: '23505', message: 'duplicate key value violates unique constraint' }),
      false,
    )
  })
  it('error de red / desconocido → false', () => {
    assert.equal(esRelacionInexistente({ message: 'fetch failed' }), false)
    assert.equal(esRelacionInexistente({ message: 'network error' }), false)
    assert.equal(esRelacionInexistente(new Error('timeout')), false)
  })
  it('null / undefined / vacío → false', () => {
    assert.equal(esRelacionInexistente(null), false)
    assert.equal(esRelacionInexistente(undefined), false)
    assert.equal(esRelacionInexistente({}), false)
    assert.equal(esRelacionInexistente({ message: '' }), false)
  })
})
