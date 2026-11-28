// Matriz plan → editor_carta y catalogo_consultor. Asegura que F1 abre el
// simulador/carta imprimible a pro/bodega/sumiller/premium pero deja el
// catálogo privado del consultor solo en premium.
//
// Ejecutar: node --test scripts/planAccessEditorCarta.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeUsar, puedeUsarEditorCarta, PLANES } from '../app/lib/plans.js'

function r(plan, subscription_status = 'active') { return { plan, subscription_status } }

test('editor_carta: pro/bodega/sumiller/premium SÍ; basic NO', () => {
  assert.equal(puedeUsarEditorCarta(r('pro')),      true)
  assert.equal(puedeUsarEditorCarta(r('bodega')),   true)
  assert.equal(puedeUsarEditorCarta(r('sumiller')), true)
  assert.equal(puedeUsarEditorCarta(r('premium')),  true)
  assert.equal(puedeUsarEditorCarta(r('basic')),    false)
})

test('catalogo_consultor sigue SOLO en premium', () => {
  assert.equal(puedeUsar(r('basic'),    'catalogo_consultor'), false)
  assert.equal(puedeUsar(r('pro'),      'catalogo_consultor'), false)
  assert.equal(puedeUsar(r('bodega'),   'catalogo_consultor'), false)
  assert.equal(puedeUsar(r('sumiller'), 'catalogo_consultor'), false)
  assert.equal(puedeUsar(r('premium'),  'catalogo_consultor'), true)
})

test('suscripción inactiva bloquea editor_carta incluso en premium', () => {
  assert.equal(puedeUsarEditorCarta({ plan: 'premium', subscription_status: 'cancelled' }), false)
  assert.equal(puedeUsarEditorCarta({ plan: 'pro',     subscription_status: 'past_due'  }), false)
})

test('trialing se considera activo (acceso durante prueba)', () => {
  assert.equal(puedeUsarEditorCarta({ plan: 'pro', subscription_status: 'trialing' }), true)
})

test('plan basic nunca tiene editor_carta aunque esté active', () => {
  assert.equal(puedeUsarEditorCarta({ plan: 'basic', subscription_status: 'active' }), false)
})

test('no regresión: features clave siguen en sus planes', () => {
  assert.ok(PLANES.pro.features.includes('editor_carta'))
  assert.ok(PLANES.bodega.features.includes('editor_carta'))
  assert.ok(PLANES.sumiller.features.includes('editor_carta'))
  assert.ok(PLANES.premium.features.includes('editor_carta'))
  assert.ok(!PLANES.basic.features.includes('editor_carta'))
  assert.ok(PLANES.premium.features.includes('catalogo_consultor'))
  assert.ok(!PLANES.sumiller.features.includes('catalogo_consultor'))
})
