// scripts/planAccess.test.mjs
// Matriz plan → acceso a pantallas económicas de bodega.
//
// El objetivo: el dueño de restaurante (plan 'premium' / Acompañado)
// tiene acceso a Motor de Precios, Explotación, Histórico y Bonus y
// Libro de Compras, igual que el sumiller. Planes operativos (basic,
// pro, bodega) NO tienen acceso.
//
// Ejecutar: node --test scripts/planAccess.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeUsar, esPerfilSomm, PLANES } from '../app/lib/plans.js'

const FEATURES_ECONOMICAS = [
  'somm_simulador_mult', // /dashboard/precios-somm
  'somm_explotacion',    // /dashboard/explotacion
  'somm_historico',      // /dashboard/analitica-somm
  'somm_libro_compras',  // /dashboard/compras-somm
]

function restaurante(plan) {
  return { plan, subscription_status: 'active' }
}

for (const feature of FEATURES_ECONOMICAS) {
  test(`${feature}: sumiller y premium SÍ; basic/pro/bodega NO`, () => {
    assert.equal(puedeUsar(restaurante('sumiller'), feature), true,
      `sumiller debería tener acceso a ${feature}`)
    assert.equal(puedeUsar(restaurante('premium'), feature), true,
      `premium (Acompañado) debería tener acceso a ${feature}`)
    assert.equal(puedeUsar(restaurante('basic'), feature), false,
      `basic NO debería tener ${feature}`)
    assert.equal(puedeUsar(restaurante('pro'), feature), false,
      `pro NO debería tener ${feature}`)
    assert.equal(puedeUsar(restaurante('bodega'), feature), false,
      `bodega NO debería tener ${feature}`)
  })
}

test('esPerfilSomm sigue gobernando SOLO la vista reducida (plan === sumiller)', () => {
  assert.equal(esPerfilSomm(restaurante('sumiller')), true)
  assert.equal(esPerfilSomm(restaurante('premium')),  false,
    'premium NO es perfilSomm — debe ver la vista COMPLETA en Cierre/Explotación')
  assert.equal(esPerfilSomm(restaurante('basic')),    false)
  assert.equal(esPerfilSomm(restaurante('pro')),      false)
  assert.equal(esPerfilSomm(restaurante('bodega')),   false)
})

test('suscripción no activa bloquea el acceso aunque el plan tenga la feature', () => {
  const r = { plan: 'premium', subscription_status: 'cancelled' }
  for (const feature of FEATURES_ECONOMICAS) {
    assert.equal(puedeUsar(r, feature), false,
      `cancelled debería bloquear ${feature}`)
  }
})

test('plan "sumiller" sigue teniendo todas las features (no regresión PR #16)', () => {
  const feats = PLANES.sumiller.features
  for (const f of FEATURES_ECONOMICAS) {
    assert.ok(feats.includes(f), `sumiller perdió ${f}`)
  }
})

test('plan "premium" no pierde features anteriores (bodega, precios_margenes, consultoria, etc.)', () => {
  const feats = PLANES.premium.features
  const invariantes = ['bodega', 'precios_margenes', 'inventario', 'informes',
                       'proveedores', 'consultoria', 'catalogo_consultor',
                       'cierre_servicio', 'modo_camarero']
  for (const f of invariantes) {
    assert.ok(feats.includes(f), `premium perdió la feature ${f}`)
  }
})
