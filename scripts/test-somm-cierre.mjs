import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historicoPayloadDesdeCierre } from '../app/lib/sommCierre.js'

const ID = '11111111-1111-4111-8111-111111111111'

test('payload básico: mapea snapshot a historico_mensual', () => {
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2026-03',
    snapshot: {
      ventas_neto: 12345.678,
      coste_ventas_teorico: 3456.789,
      gastos_total: 2100.5,
      stock_final: 9876.54,
    },
  })

  assert.equal(payload.restaurante_id, ID)
  assert.equal(payload.anio, 2026)
  assert.equal(payload.mes, 3)
  assert.equal(payload.ingresos, 12345.68)
  assert.equal(payload.consumo_mp, 3456.79)
  assert.equal(payload.gastos_fijos, 2100.5)
  assert.equal(payload.valor_stock_bodega, 9876.54)
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
  assert.equal(payload.valor_stock_bodega, 0)
  assert.equal(payload.origen, 'auto')
})

test('snapshot null → todos los valores 0', () => {
  const payload = historicoPayloadDesdeCierre({
    restaurante_id: ID,
    mes: '2025-12',
    snapshot: null,
  })
  assert.equal(payload.ingresos, 0)
  assert.equal(payload.valor_stock_bodega, 0)
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
