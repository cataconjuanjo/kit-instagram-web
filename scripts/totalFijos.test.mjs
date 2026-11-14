// scripts/totalFijos.test.mjs
// Verifica calcularTotalFijos: fuente unica para Motor y Explotacion.
// Ejecutar: node --test scripts/totalFijos.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularTotalFijos, calcularBreakEven } from '../app/lib/sommExplotacion.js'

test('suma los 4 componentes', () => {
  const r = calcularTotalFijos({ personal: 1000, alquiler: 300, generales: 142.26, bancarios: 60 })
  assert.equal(r.total, 1502.26)
  assert.equal(r.personal, 1000)
  assert.equal(r.bancarios, 60)
})

test('caso de la demo: Motor sin bancarios vs Explotacion con bancarios', () => {
  // Datos observados en la demo del 14/11:
  //   Motor:       1.442,26 (personal + alquiler + generales)
  //   Explotacion: 1.502,00 (anterior + 60 bancarios)
  // Con el canonico ambos deben sumar 1.502,26 (incluyendo bancarios).
  const r = calcularTotalFijos({ personal: 1000, alquiler: 300, generales: 142.26, bancarios: 60 })
  assert.equal(r.total, 1502.26)
})

test('componentes opcionales default 0', () => {
  assert.equal(calcularTotalFijos({ personal: 500 }).total, 500)
  assert.equal(calcularTotalFijos().total, 0)
})

test('calcularBreakEven delega en calcularTotalFijos (mismos componentes)', () => {
  // personal=1000, generales=142.26, alquiler=300, bancarios=60, mp=35%
  const r = calcularBreakEven(1000, 142.26, 300, 60, 35)
  assert.equal(r.gastosFijos, 1502.26)
  assert.equal(r.margenContribucion, 65)
  // breakEven = 1502.26 / 0.65 = 2311.17
  assert.ok(Math.abs(r.breakEven - 2311.17) < 0.01)
})
