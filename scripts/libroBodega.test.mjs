/**
 * Unit tests for app/lib/libroBodega.js — funciones puras.
 * Ejecutar: node --test scripts/libroBodega.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  r2,
  indexarMovimientos,
  indexarCompras,
  indexarPartes,
  calcularFilaVino,
  totalizarFilas,
  exportarCSV,
} from '../app/lib/libroBodega.js'

// ── r2 ────────────────────────────────────────────────────────────────────────

describe('r2', () => {
  it('redondea a 2 decimales', () => {
    assert.strictEqual(r2(1.006), 1.01)   // 1.005 es artefacto FP; 1.006 × 100 = 100.6 → 101 / 100 = 1.01
    assert.strictEqual(r2(1.004), 1)
    assert.strictEqual(r2(10.575), 10.58)
    assert.strictEqual(r2(null), 0)
    assert.strictEqual(r2(undefined), 0)
  })
})

// ── indexarMovimientos ────────────────────────────────────────────────────────

describe('indexarMovimientos', () => {
  const movs = [
    { tipo: 'compra',         cantidad:  6, fecha_movimiento: '2026-01-10', vino_id: 'v1' },
    { tipo: 'venta_botella',  cantidad: -2, fecha_movimiento: '2026-01-15', vino_id: 'v1' },
    { tipo: 'venta_copa',     cantidad: -1, fecha_movimiento: '2026-01-20', vino_id: 'v1' },
    { tipo: 'ajuste',         cantidad:  1, fecha_movimiento: '2026-01-25', vino_id: 'v1' },
    { tipo: 'merma',          cantidad: -1, fecha_movimiento: '2026-01-28', vino_id: 'v1' },
    { tipo: 'compra',         cantidad:  3, fecha_movimiento: '2026-02-05', vino_id: 'v1' },
  ]

  it('separa por mes', () => {
    const idx = indexarMovimientos(movs)
    assert.ok(idx['2026-01'])
    assert.ok(idx['2026-02'])
    assert.strictEqual(idx['2026-03'], undefined)
  })

  it('acumula entradas_u desde compra', () => {
    const idx = indexarMovimientos(movs)
    assert.strictEqual(idx['2026-01']['v1'].entradas_u, 6)
    assert.strictEqual(idx['2026-02']['v1'].entradas_u, 3)
  })

  it('acumula ventas_bot_u con abs(cantidad)', () => {
    const idx = indexarMovimientos(movs)
    assert.strictEqual(idx['2026-01']['v1'].ventas_bot_u, 2)
  })

  it('ventas_copa_u = botellas abiertas (abs de movimientos, no copas)', () => {
    const idx = indexarMovimientos(movs)
    assert.strictEqual(idx['2026-01']['v1'].ventas_copa_u, 1)
  })

  it('acumula ajustes_u con signo', () => {
    const idx = indexarMovimientos(movs)
    assert.strictEqual(idx['2026-01']['v1'].ajustes_u, 1)
  })

  it('otras_u incluye merma', () => {
    const idx = indexarMovimientos(movs)
    assert.strictEqual(idx['2026-01']['v1'].otras_u, 1)
  })

  it('omite filas con fecha_movimiento null (sin fallback: política documentada)', () => {
    // Decisión: skip. En el demo actual no hay filas con fecha_movimiento NULL
    // (query de verificación: 0 filas). Si en el futuro aparecen, hay que
    // decidir el fallback (parte.fecha vs created_at) por tipo de movimiento.
    const idx = indexarMovimientos([
      { tipo: 'compra', cantidad: 1, fecha_movimiento: null,         vino_id: 'v1' },
      { tipo: 'compra', cantidad: 5, fecha_movimiento: '2026-01-10', vino_id: 'v1' },
    ])
    assert.strictEqual(idx['2026-01']['v1'].entradas_u, 5)  // solo la que tiene fecha
    assert.strictEqual(Object.keys(idx).length, 1)
  })
})

// ── indexarCompras ────────────────────────────────────────────────────────────

describe('indexarCompras', () => {
  const cabFechaMap = { 'cab1': '2026-01-10', 'cab2': '2026-02-15' }
  const lineas = [
    { cabecera_id: 'cab1', vino_id: 'v1', importe_neto: 100 },
    { cabecera_id: 'cab1', vino_id: 'v1', importe_neto: 50.5 },
    { cabecera_id: 'cab2', vino_id: 'v1', importe_neto: 200 },
  ]

  it('suma importe_neto por mes y vino', () => {
    const idx = indexarCompras(lineas, cabFechaMap)
    assert.strictEqual(idx['2026-01']['v1'].eur, 150.5)
    assert.strictEqual(idx['2026-02']['v1'].eur, 200)
  })

  it('ignora lineas con cabecera desconocida', () => {
    const idx = indexarCompras([{ cabecera_id: 'x', vino_id: 'v1', importe_neto: 99 }], {})
    assert.deepStrictEqual(idx, {})
  })
})

// ── indexarPartes ─────────────────────────────────────────────────────────────

describe('indexarPartes', () => {
  const parteFechaMap = { 'p1': '2026-01-10' }
  // venta_copa: cantidad=1 (evento), copas_vendidas=4 (copas reales servidas)
  const lineas = [
    { parte_id: 'p1', vino_id: 'v1', tipo: 'venta_botella', cantidad: 2, copas_vendidas: 0, precio_unitario: 30 },
    { parte_id: 'p1', vino_id: 'v1', tipo: 'venta_copa',    cantidad: 1, copas_vendidas: 4, precio_unitario: 4 },
  ]

  it('acumula bot_u y bot_eur_bruto', () => {
    const idx = indexarPartes(lineas, parteFechaMap)
    assert.strictEqual(idx['2026-01']['v1'].bot_u, 2)
    assert.strictEqual(idx['2026-01']['v1'].bot_eur_bruto, 60)
  })

  it('copas_servidas_u usa copas_vendidas (no cantidad) y copa_eur_bruto = copas × pvp', () => {
    const idx = indexarPartes(lineas, parteFechaMap)
    assert.strictEqual(idx['2026-01']['v1'].copas_servidas_u, 4)  // de copas_vendidas, no cantidad
    assert.strictEqual(idx['2026-01']['v1'].copa_eur_bruto, 16)    // 4 copas × 4€
  })
})

// ── calcularFilaVino ──────────────────────────────────────────────────────────

describe('calcularFilaVino', () => {
  const vino = { id: 'v1', nombre: 'Granito 2022', tipo: 'tinto' }

  it('calcula stock_fin y descuadre cero cuando cuadra', () => {
    const fila = calcularFilaVino({
      vino,
      smbPrev:      { stock_final_real: 5, coste_medio: 10 },
      smbCurrent:   { stock_final_real: 8, coste_medio: 10 },
      movsEntry:    { entradas_u: 6, ventas_bot_u: 2, ventas_copa_u: 1, otras_u: 0, ajustes_u: 0 },
      comprasEntry: { eur: 60 },
      partesEntry:  { bot_u: 2, bot_eur_bruto: 44, copas_servidas_u: 1, copa_eur_bruto: 11 },
      ivaPct: 10,
    })
    // stock_fin_rec = 5 + 6 - 2 - 1 + 0 = 8, SMB = 8 → descuadre = 0
    assert.strictEqual(fila.stock_fin, 8)
    assert.strictEqual(fila.descuadre, 0)
  })

  it('tres cifras de consumo: (a) teórico, (b) real stock, (c) merma implícita', () => {
    const fila = calcularFilaVino({
      vino,
      smbPrev:      { stock_final_real: 10, coste_medio: 10 },
      smbCurrent:   { stock_final_real: 8,  coste_medio: 10 },
      movsEntry:    { entradas_u: 5, ventas_bot_u: 3, ventas_copa_u: 2, otras_u: 2, ajustes_u: 0 },
      comprasEntry: { eur: 50 },
      partesEntry:  { bot_u: 3, bot_eur_bruto: 90, copas_servidas_u: 5, copa_eur_bruto: 25 },
      ivaPct: 10,
    })
    // (a) coste_teorico = (ventas_bot_u + copas_servidas/5) × coste_fin = (3 + 5/5) × 10 = 40
    assert.strictEqual(fila.coste_teorico_ventas, 40)
    // (b) consumo_real = 10×10 + 50 - 8×10 = 100+50-80 = 70
    assert.strictEqual(fila.consumo_real_stock, 70)
    // (c) merma implícita = 70 - 40 = 30 (hay 2 bot abiertas vs 1 teórica → 1 extra + 2 otras_salidas)
    assert.strictEqual(fila.diferencia_consumo, 30)
  })

  it('descuadre no cero cuando movimientos no cuadran con SMB', () => {
    const fila = calcularFilaVino({
      vino,
      smbPrev:    { stock_final_real: 5, coste_medio: 10 },
      smbCurrent: { stock_final_real: 9, coste_medio: 10 },
      movsEntry:  { entradas_u: 6, ventas_bot_u: 2, ventas_copa_u: 1, otras_u: 0, ajustes_u: 0 },
      comprasEntry: null, partesEntry: null, ivaPct: 10,
    })
    // stock_fin_rec = 5 + 6 - 2 - 1 = 8, SMB = 9 → descuadre = -1
    assert.strictEqual(fila.descuadre, -1)
  })

  it('ventas_bot_eur divide por 1+ivaPct/100', () => {
    const fila = calcularFilaVino({
      vino,
      smbPrev: null, smbCurrent: null, movsEntry: null, comprasEntry: null,
      partesEntry: { bot_u: 1, bot_eur_bruto: 33, copas_servidas_u: 0, copa_eur_bruto: 0 },
      ivaPct: 10,
    })
    assert.strictEqual(fila.ventas_bot_eur, r2(33 / 1.1))
  })

  it('stock_ini null cuando no hay SMB previo ni vinoStockActual', () => {
    const fila = calcularFilaVino({
      vino,
      smbPrev: null, smbCurrent: null, movsEntry: null, comprasEntry: null, partesEntry: null,
    })
    assert.strictEqual(fila.stock_ini, null)
    assert.strictEqual(fila.descuadre, 0)
  })

  it('ajuste positivo sube stock_fin_rec', () => {
    const fila = calcularFilaVino({
      vino,
      smbPrev:    { stock_final_real: 1, coste_medio: 30 },
      smbCurrent: { stock_final_real: 2, coste_medio: 30 },
      movsEntry:  { entradas_u: 0, ventas_bot_u: 0, ventas_copa_u: 0, otras_u: 0, ajustes_u: 1 },
      comprasEntry: null, partesEntry: null, ivaPct: 10,
    })
    // rec = 1 + 0 + 1 = 2, SMB = 2 → descuadre = 0
    assert.strictEqual(fila.descuadre, 0)
    assert.strictEqual(fila.ajustes_u, 1)
  })

  it('mes abierto: reconstruye stock_ini hacia atrás desde vinoStockActual', () => {
    const fila = calcularFilaVino({
      vino,
      smbPrev: null, smbCurrent: null,
      movsEntry: { entradas_u: 6, ventas_bot_u: 2, ventas_copa_u: 1, otras_u: 0, ajustes_u: 0 },
      comprasEntry: null, partesEntry: null, ivaPct: 10,
      vinoStockActual: 4,
    })
    // ini = 4 - 6 + 2 + 1 + 0 - 0 = 1
    assert.strictEqual(fila.stock_fin, 4)
    assert.strictEqual(fila.stock_ini, 1)
    assert.strictEqual(fila.descuadre, 0)  // no hay SMB para comparar
  })

  it('copas_servidas_u viene de partesEntry, ventas_copa_u de movsEntry', () => {
    const fila = calcularFilaVino({
      vino,
      smbPrev: null, smbCurrent: null, movsEntry: { entradas_u:0, ventas_bot_u:0, ventas_copa_u:2, otras_u:0, ajustes_u:0 },
      comprasEntry: null,
      partesEntry: { bot_u: 0, bot_eur_bruto: 0, copas_servidas_u: 7, copa_eur_bruto: 28 },
      ivaPct: 10,
    })
    assert.strictEqual(fila.ventas_copa_u, 2)       // botellas abiertas (movimientos)
    assert.strictEqual(fila.copas_servidas_u, 7)    // copas servidas (partes)
    assert.strictEqual(fila.ventas_copa_eur, r2(28 / 1.1))
  })
})

// ── totalizarFilas ────────────────────────────────────────────────────────────

describe('totalizarFilas', () => {
  it('suma todas las columnas numéricas incluidas las 3 cifras de consumo', () => {
    const filas = [
      { entradas_u:2, entradas_eur:100, ventas_bot_u:1, ventas_bot_eur:30,
        ventas_copa_u:0, copas_servidas_u:3, ventas_copa_eur:0, otras_salidas_u:0, ajustes_u:0,
        stock_ini:5, stock_fin:6,
        coste_teorico_ventas:10, consumo_real_stock:30, diferencia_consumo:20 },
      { entradas_u:3, entradas_eur:150, ventas_bot_u:2, ventas_bot_eur:60,
        ventas_copa_u:1, copas_servidas_u:4, ventas_copa_eur:15, otras_salidas_u:0, ajustes_u:0,
        stock_ini:10, stock_fin:11,
        coste_teorico_ventas:30, consumo_real_stock:75, diferencia_consumo:45 },
    ]
    const t = totalizarFilas(filas)
    assert.strictEqual(t.entradas_u, 5)
    assert.strictEqual(t.entradas_eur, 250)
    assert.strictEqual(t.ventas_bot_eur, 90)
    assert.strictEqual(t.copas_servidas_u, 7)
    assert.strictEqual(t.coste_teorico_ventas, 40)
    assert.strictEqual(t.consumo_real_stock, 105)
    assert.strictEqual(t.diferencia_consumo, 65)
    assert.strictEqual(t.stock_ini, 15)
  })

  it('array vacío → ceros', () => {
    const t = totalizarFilas([])
    assert.strictEqual(t.entradas_u, 0)
    assert.strictEqual(t.copas_servidas_u, 0)
    assert.strictEqual(t.coste_teorico_ventas, 0)
    assert.strictEqual(t.consumo_real_stock, 0)
    assert.strictEqual(t.diferencia_consumo, 0)
  })
})

// ── exportarCSV ───────────────────────────────────────────────────────────────

describe('exportarCSV', () => {
  const meses = [{
    mes: '2026-01', estado: 'cerrado',
    vinos: [{ vino_id:'v1', nombre:'Test "vino"', tipo:'tinto',
              stock_ini:5, entradas_u:6, entradas_eur:60,
              ventas_bot_u:2, ventas_bot_eur:40,
              ventas_copa_u:1, copas_servidas_u:4, ventas_copa_eur:10,
              otras_salidas_u:0, ajustes_u:0, stock_fin:8,
              coste_teorico_ventas:30, consumo_real_stock:35, diferencia_consumo:5,
              coste_medio:10, descuadre:0 }],
  }]

  it('primera línea es cabecera con copas_servidas_u y las 3 cifras de consumo', () => {
    const csv = exportarCSV(meses)
    assert.ok(csv.startsWith('mes,estado,vino,'))
    assert.ok(csv.includes('copas_servidas_u'))
    assert.ok(csv.includes('coste_teorico_ventas'))
    assert.ok(csv.includes('consumo_real_stock'))
    assert.ok(csv.includes('diferencia_consumo'))
  })

  it('segunda línea contiene el mes y el vino', () => {
    const lines = exportarCSV(meses).split('\n')
    assert.ok(lines[1].startsWith('2026-01,cerrado,'))
  })

  it('escapa comillas en nombre', () => {
    const csv = exportarCSV(meses)
    assert.ok(csv.includes('"Test ""vino"""'))
  })

  it('genera una línea por vino por mes', () => {
    const lines = exportarCSV(meses).split('\n')
    assert.strictEqual(lines.length, 2)  // header + 1 vino
  })
})
