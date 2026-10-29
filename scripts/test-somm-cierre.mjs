import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historicoPayloadDesdeCierre } from '../app/lib/sommCierre.js'
import { añadirVinosStockAlSnapshot, insertarStockMensualBodega } from '../app/lib/insertarStockMensualBodega.js'

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

// ── Tests añadirVinosStockAlSnapshot (fix consumo_mp) ────────────────────────

test('añadirVinosStockAlSnapshot: stock_final = Σ(stock_uds × coste_medio)', () => {
  const vinos = [
    { id: 'v1', stock: '10', coste_medio_pmp: '5.00', coste_compra: '4.00' },
    { id: 'v2', stock: '3',  coste_medio_pmp: '20.00', coste_compra: '18.00' },
  ]
  // v1: 10×5 = 50, v2: 3×20 = 60  → total 110
  const result = añadirVinosStockAlSnapshot({ ventas_neto: 1000 }, vinos)
  assert.equal(result.ventas_neto, 1000, 'preserva campos del snapshot original')
  assert.equal(result.stock_final, 110)
  assert.equal(result.vinos_stock.length, 2)
  assert.equal(result.vinos_stock[0].vino_id, 'v1')
  assert.equal(result.vinos_stock[0].stock_uds, 10)
  assert.equal(result.vinos_stock[0].coste_medio, 5)
})

test('añadirVinosStockAlSnapshot: coste_medio nulo/0 → usa coste_compra', () => {
  const vinos = [
    { id: 'v3', stock: '5', coste_medio_pmp: null,    coste_compra: '8.00' },
    { id: 'v4', stock: '2', coste_medio_pmp: '0',     coste_compra: '12.00' },
  ]
  // v3: 5×8=40, v4: 2×12=24 (coste_medio_pmp=0 → falsy → usa coste_compra)
  const result = añadirVinosStockAlSnapshot({}, vinos)
  assert.equal(result.vinos_stock[0].coste_medio, 8)
  assert.equal(result.vinos_stock[1].coste_medio, 12)
  assert.equal(result.stock_final, 64)
})

test('añadirVinosStockAlSnapshot: stock 0 → stock_uds=0, contribuye 0 al stock_final', () => {
  const vinos = [
    { id: 'v5', stock: '0',  coste_medio_pmp: '10', coste_compra: '10' },
    { id: 'v6', stock: '-3', coste_medio_pmp: '10', coste_compra: '10' },
  ]
  const result = añadirVinosStockAlSnapshot({}, vinos)
  assert.equal(result.vinos_stock[0].stock_uds, 0)
  assert.equal(result.vinos_stock[1].stock_uds, 0)
  assert.equal(result.stock_final, 0)
})

test('añadirVinosStockAlSnapshot: lista vacía → stock_final=0, vinos_stock=[]', () => {
  const result = añadirVinosStockAlSnapshot({ gastos_total: 500 }, [])
  assert.equal(result.stock_final, 0)
  assert.deepEqual(result.vinos_stock, [])
  assert.equal(result.gastos_total, 500)
})

test('añadirVinosStockAlSnapshot: vinos=null → stock_final=0', () => {
  const result = añadirVinosStockAlSnapshot({}, null)
  assert.equal(result.stock_final, 0)
  assert.deepEqual(result.vinos_stock, [])
})

// ── Tests encadenamiento de meses (fix consumo_mp ≠ compras_total) ───────────

test('encadenamiento: stock_inicial(N) = stock_final(N-1)', () => {
  // Mes 1 (enero): sin stock previo, compras=2000, stock_final=1800
  const mesEne = historicoPayloadDesdeCierre({
    restaurante_id: ID, mes: '2026-01',
    snapshot: { ventas_neto: 8000, stock_final: 1800 },
    stock_inicial_valor: 0,
    compras_total: 2000,
  })
  // Mes 2 (febrero): stock_inicial = stock_final de enero = 1800
  const mesFeb = historicoPayloadDesdeCierre({
    restaurante_id: ID, mes: '2026-02',
    snapshot: { ventas_neto: 7000, stock_final: 2100 },
    stock_inicial_valor: mesEne.stock_final_valor,
    compras_total: 1500,
  })

  assert.equal(mesFeb.stock_inicial_valor, mesEne.stock_final_valor,
    'stock_inicial(feb) = stock_final(ene)')
  assert.equal(mesFeb.stock_inicial_valor, 1800)

  // consumo_mp(feb) = 1800 + 1500 - 2100 = 1200  ≠ compras_total(1500)
  assert.equal(mesFeb.consumo_mp, 1200)
  assert.notEqual(mesFeb.consumo_mp, mesFeb.compras_total,
    'consumo_mp ≠ compras_total cuando hay stock')
})

test('encadenamiento: tres meses en cadena son consistentes', () => {
  const meses = [
    { mes: '2026-01', ventas_neto: 8000, stock_final: 2000, compras_total: 2500 },
    { mes: '2026-02', ventas_neto: 7000, stock_final: 1800, compras_total: 1200 },
    { mes: '2026-03', ventas_neto: 9000, stock_final: 2400, compras_total: 3000 },
  ]
  const payloads = []
  for (let i = 0; i < meses.length; i++) {
    const { mes, ventas_neto, stock_final, compras_total } = meses[i]
    payloads.push(historicoPayloadDesdeCierre({
      restaurante_id: ID, mes,
      snapshot: { ventas_neto, stock_final },
      stock_inicial_valor: i === 0 ? 0 : payloads[i - 1].stock_final_valor,
      compras_total,
    }))
  }
  // ene: 0+2500-2000=500 | feb: 2000+1200-1800=1400 | mar: 1800+3000-2400=2400
  assert.equal(payloads[0].consumo_mp, 500)
  assert.equal(payloads[1].consumo_mp, 1400)
  assert.equal(payloads[2].consumo_mp, 2400)
  // Comprobamos que ninguno iguala compras_total
  for (const p of payloads) {
    assert.notEqual(p.consumo_mp, p.compras_total,
      `consumo_mp ${p.consumo_mp} no debe igualar compras_total ${p.compras_total} en mes ${p.mes}`)
  }
})

// ── Tests insertarStockMensualBodega (resilencia + conteo inventario) ─────────

test('insertarStockMensualBodega: error de upsert devuelve { error }, no lanza', async () => {
  const mockSupabase = {
    from: () => ({ upsert: () => Promise.resolve({ error: { message: 'connection refused' } }) }),
  }
  const result = await insertarStockMensualBodega(mockSupabase, {
    restaurante_id: ID,
    mes: '2026-01',
    vinos_stock: [{ vino_id: 'v1', stock_uds: 5, coste_medio: 10 }],
  })
  assert.ok(result.error, 'debe devolver el error')
  assert.equal(result.error.message, 'connection refused')
})

test('conteo inventario: stock_final existente no se pisa, vinos_stock siempre se adjunta', () => {
  const vinos = [
    { id: 'v1', stock: '10', coste_medio_pmp: '5.00', coste_compra: '4.00' },
  ]
  const snapshotConConteo = { ventas_neto: 3000, stock_final: 9999 }
  const enriched = añadirVinosStockAlSnapshot(snapshotConConteo, vinos)
  // Lógica de la ruta: preservar stock_final si ya venía del snapshot
  const snapshotFinal = snapshotConConteo.stock_final != null
    ? { ...enriched, stock_final: snapshotConConteo.stock_final }
    : enriched
  assert.equal(snapshotFinal.stock_final, 9999, 'stock_final de conteo no se pisa')
  assert.equal(snapshotFinal.vinos_stock.length, 1, 'vinos_stock siempre se adjunta')
  assert.equal(snapshotFinal.ventas_neto, 3000, 'resto del snapshot se preserva')
})
