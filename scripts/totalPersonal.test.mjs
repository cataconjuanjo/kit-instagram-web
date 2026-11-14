// scripts/totalPersonal.test.mjs
// Verifica que calcularTotalPersonal NO suma retenciones IRPF al total.
// Las retenciones IRPF ya estan incluidas en la nomina bruta: la empresa
// las ingresa en Hacienda por cuenta del trabajador, no son coste extra.
//
// Ejecutar: node --test scripts/totalPersonal.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularTotalPersonal } from '../app/lib/sommExplotacion.js'

test('total = nominas + ss + extras (no incluye retenciones)', () => {
  const r = calcularTotalPersonal({
    nominas_brutas: 2000,
    ss_empresa: 660,         // ~33%
    retenciones_irpf: 300,   // informativo, no debe sumar
    extras_personal: 100,
  })
  assert.equal(r.total, 2760)      // 2000 + 660 + 100
  assert.equal(r.retenciones, 300) // se expone informativo
  assert.equal(r.nominas, 2000)
  assert.equal(r.ss, 660)
})

test('sin retenciones el total coincide con el anterior modelo', () => {
  const r = calcularTotalPersonal({
    nominas_brutas: 2000,
    ss_empresa: 660,
    retenciones_irpf: 0,
    extras_personal: 100,
  })
  assert.equal(r.total, 2760)
})

test('pctSobreNominas usa el nuevo total (sin IRPF)', () => {
  const r = calcularTotalPersonal({
    nominas_brutas: 1000,
    ss_empresa: 330,
    retenciones_irpf: 200,
    extras_personal: 0,
  })
  // total = 1330; (1330 − 1000) / 1000 × 100 = 33.0
  assert.equal(r.total, 1330)
  assert.equal(r.pctSobreNominas, 33)
})

test('con solo nominas, total = nominas', () => {
  const r = calcularTotalPersonal({ nominas_brutas: 500 })
  assert.equal(r.total, 500)
  assert.equal(r.pctSobreNominas, 0)
})
