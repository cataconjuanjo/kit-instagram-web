// scripts/margenBodega.test.mjs
// Test del helper puro app/lib/margenBodega.js con fixtures reales de
// la demo Sumiller Casa Marisma (Ago/Sep/Oct 2026).
//
// Ejecutar: node --test scripts/margenBodega.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { margenTrasMerma, identidadResultado } from '../app/lib/margenBodega.js'

// Fixtures reales (snapshots que la UI renderiza hoy en /dashboard/bodega
// → Cierre mensual). Se recortan a los campos usados por el helper.
const AGO = {
  margen_bruto:            8826.72,
  merma_copa_eur:           304.86,
  salidas_no_venta:           0,
  diferencias_inventario:     null,
  gastos_total:               0,       // Agosto sin gastos cargados
  resultado:               8521.86,
}
const SEP = {
  margen_bruto:            6334.36,
  merma_copa_eur:           272.67,
  salidas_no_venta:           0,
  diferencias_inventario:     null,
  gastos_total:               0,
  resultado:               6061.69,
}
const OCT = {
  margen_bruto:            6448.46,
  merma_copa_eur:           282.76,
  salidas_no_venta:           0,
  diferencias_inventario:     null,
  gastos_total:            4271.00,
  resultado:               1894.70,
}

test('margenTrasMerma — Agosto 2026', () => {
  assert.equal(margenTrasMerma(AGO), 8521.86)
})

test('margenTrasMerma — Septiembre 2026', () => {
  assert.equal(margenTrasMerma(SEP), 6061.69)
})

test('margenTrasMerma — Octubre 2026 (con gastos > 0)', () => {
  // margen_bruto − merma: la identidad "tras merma" NO depende de gastos.
  assert.equal(margenTrasMerma(OCT), 6165.70)
})

test('identidad: resultado = margen_tras_merma − gastos_total (Ago)', () => {
  const r = identidadResultado(AGO)
  assert.equal(r.ok, true, `delta=${r.delta}`)
})

test('identidad: resultado = margen_tras_merma − gastos_total (Sep)', () => {
  const r = identidadResultado(SEP)
  assert.equal(r.ok, true, `delta=${r.delta}`)
})

test('identidad: resultado = margen_tras_merma − gastos_total (Oct)', () => {
  const r = identidadResultado(OCT)
  // 6165.70 − 4271 = 1894.70 ✓
  assert.equal(r.ok, true, `delta=${r.delta}`)
})

test('margenTrasMerma — nulls devuelven null', () => {
  assert.equal(margenTrasMerma(null), null)
  assert.equal(margenTrasMerma({}), null)
  assert.equal(margenTrasMerma({ margen_bruto: null }), null)
})

test('margenTrasMerma — resta salidas_no_venta y suma diferencias_inventario', () => {
  const snap = {
    margen_bruto:          1000,
    merma_copa_eur:          50,
    salidas_no_venta:        30,
    diferencias_inventario: -20,
  }
  // 1000 − 50 − 30 + (−20) = 900
  assert.equal(margenTrasMerma(snap), 900)
})

test('margenTrasMerma — campos ausentes se tratan como 0', () => {
  assert.equal(margenTrasMerma({ margen_bruto: 500 }), 500)
})
