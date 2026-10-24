import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historicoPayloadDesdeCierre } from '../app/lib/sommCierre.js'

const ID = '11111111-1111-4111-8111-111111111111'

// ── Existing tests (updated for inventory-method consumo_mp) ─────────────────

test('payload básico: mapea snapshot a historico_mensual', () => {
  // consumo_mp = stock_inicial(11000) + compras(2333.33) - stock_final(9876.54) = 3456.79
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2026-03',
    snapshot: {
      ventas_neto:  12345.678,
      gastos_total: 2100.5,
      stock_final:  9876.54,
    },
    stock_inicial_valor: 11000,
    compras_total:       2333.33,
  })

  assert.equal(payload.restaurante_id, ID)
  assert.equal(payload.anio, 2026)
  assert.equal(payload.mes, 3)
  assert.equal(payload.ingresos, 12345.68)
  assert.equal(payload.consumo_mp, 3456.79)
  assert.equal(payload.gastos_fijos, 2100.5)
  assert.equal(payload.stock_final_valor, 9876.54)
  assert.equal(payload.valor_stock_bodega, 9876.54)
  assert.equal(payload.stock_inicial_valor, 11000)
  assert.equal(payload.compras_total, 2333.33)
  assert.equal(payload.origen, 'auto')
})

test('campos ausentes en snapshot → 0', () => {
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2026-01',
    snapshot: {},
  })
  assert.equal(payload.ingresos, 0)
  assert.equal(payload.consumo_mp, 0)
  assert.equal(payload.gastos_fijos, 0)
  assert.equal(payload.stock_final_valor, 0)
  assert.equal(payload.origen, 'auto')
})

test('snapshot null → todos los valores 0', () => {
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2025-12',
    snapshot: null,
  })
  assert.equal(payload.ingresos, 0)
  assert.equal(payload.stock_final_valor, 0)
  assert.equal(payload.consumo_mp, 0)
})

test('mes con string decimal → redondea a 2 decimales', () => {
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2026-06',
    snapshot: { ventas_neto: 0.005 },
  })
  assert.equal(payload.ingresos, 0.01)
})

test('mes inválido → lanza error', () => {
  assert.throws(
    () => historicoPayloadDesdeCierre({ restaurante_id: ID, mes: 'no-valido', snapshot: {} }),
    /YYYY-MM/
  )
})

test('restaurante_id vacío → lanza error', () => {
  assert.throws(
    () => historicoPayloadDesdeCierre({ restaurante_id: '', mes: '2026-01', snapshot: {} }),
    /restaurante_id/
  )
})

// ── Nuevos tests (F1.1) ──────────────────────────────────────────────────────

test('consumo_mp método inventario: stock_inicial + compras - stock_final', () => {
  // 5000 + 1500 - 3500 = 3000
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2026-04',
    snapshot: { ventas_neto: 10000, stock_final: 3500 },
    stock_inicial_valor: 5000,
    compras_total:       1500,
  })
  assert.equal(payload.consumo_mp, 3000)
  assert.equal(payload.stock_inicial_valor, 5000)
  assert.equal(payload.compras_total, 1500)
  assert.equal(payload.stock_final_valor, 3500)
})

test('mes sin compras: consumo_mp = stock_inicial - stock_final', () => {
  // 8000 + 0 - 6000 = 2000
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2026-05',
    snapshot: { ventas_neto: 9000, stock_final: 6000 },
    stock_inicial_valor: 8000,
    compras_total:       0,
  })
  assert.equal(payload.consumo_mp, 2000)
})

test('mes sin cierre anterior: stock_inicial = 0', () => {
  // 0 + 2000 - 800 = 1200
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2026-07',
    snapshot: { ventas_neto: 5000, stock_final: 800 },
    stock_inicial_valor: 0,
    compras_total:       2000,
  })
  assert.equal(payload.consumo_mp, 1200)
})

test('consumo_mp negativo cuando stock_final > stock_inicial + compras', () => {
  // 1000 + 500 - 2000 = -500 (discrepancia real, no se trunca a 0)
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2026-08',
    snapshot: { ventas_neto: 7000, stock_final: 2000 },
    stock_inicial_valor: 1000,
    compras_total:       500,
  })
  assert.equal(payload.consumo_mp, -500)
})

test('pct_mp = 0 cuando ingresos = 0 (sin división por cero)', () => {
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2026-09',
    snapshot: { ventas_neto: 0, stock_final: 1000 },
    stock_inicial_valor: 2000,
    compras_total:       500,
  })
  assert.equal(payload.ingresos, 0)
  assert.equal(payload.pct_mp, 0)
})
