// Test unitario del helper requireCatalogoConsultor.
//
// Simula 4 escenarios con mocks (sin servidor ni base):
//   1. Restaurante pro + sesión NO admin  → 403 (plan sin feature)
//   2. Restaurante sumiller + sesión NO admin → 403 (plan sin feature)
//   3. Restaurante pro + sesión ADMIN     → 403 (el admin NO salta)
//   4. Restaurante premium + sesión NO admin → OK
//   5. Restaurante premium + suscripción cancelled → 403
//
// Ejecutar: node --test scripts/requireCatalogoConsultor.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requireCatalogoConsultorImpl } from '../app/api/_lib/requireCatalogoConsultorImpl.js'
import { puedeUsar } from '../app/lib/plans.js'

const REST_ID = 'rest-demo-1'

function fakeSupabase({ plan, subscription_status = 'active', restauranteExiste = true }) {
  return {
    from(tabla) {
      assert.equal(tabla, 'restaurantes', 'solo lee restaurantes')
      const chain = {
        select() { return chain },
        eq() { return chain },
        async single() {
          if (!restauranteExiste) return { data: null, error: { code: 'PGRST116' } }
          return { data: { plan, subscription_status }, error: null }
        },
      }
      return chain
    },
  }
}

function fakeAuth({ esAdmin, esOwner, hayToken = true }) {
  return async (_req, _db, _id) => {
    if (!hayToken) return { error: 'Sesion no recibida', status: 401 }
    if (!esAdmin && !esOwner) return { error: 'No autorizado', status: 403 }
    return { user: { email: esAdmin ? 'cataconjuanjo@gmail.com' : 'owner@casa-marisma.com' } }
  }
}

function hacerPeticion() {
  return new Request('http://localhost/x', { headers: { authorization: 'Bearer x' } })
}

test('pro + sesión owner (no admin) → 403 plan sin feature', async () => {
  const r = await requireCatalogoConsultorImpl(hacerPeticion(), REST_ID, {
    requireRestaurantAccessFn: fakeAuth({ esAdmin: false, esOwner: true }),
    supabaseAdminClient: fakeSupabase({ plan: 'pro' }),
    puedeUsarFn: puedeUsar,
  })
  assert.equal(r.status, 403)
  assert.match(r.error, /catálogo/i)
})

test('sumiller + sesión owner (no admin) → 403 plan sin feature', async () => {
  const r = await requireCatalogoConsultorImpl(hacerPeticion(), REST_ID, {
    requireRestaurantAccessFn: fakeAuth({ esAdmin: false, esOwner: true }),
    supabaseAdminClient: fakeSupabase({ plan: 'sumiller' }),
    puedeUsarFn: puedeUsar,
  })
  assert.equal(r.status, 403)
})

test('pro + sesión ADMIN → 403 (el admin NO salta el plan del restaurante)', async () => {
  // Este es el caso de la fuga: admin probando un restaurante pro recibía
  // 200 porque los endpoints bypaseaban por esConsultor. El helper lo
  // cierra: solo cuenta el plan del restaurante.
  const r = await requireCatalogoConsultorImpl(hacerPeticion(), REST_ID, {
    requireRestaurantAccessFn: fakeAuth({ esAdmin: true, esOwner: false }),
    supabaseAdminClient: fakeSupabase({ plan: 'pro' }),
    puedeUsarFn: puedeUsar,
  })
  assert.equal(r.status, 403, 'admin sobre restaurante pro: 403')
})

test('bodega + sesión ADMIN → 403', async () => {
  const r = await requireCatalogoConsultorImpl(hacerPeticion(), REST_ID, {
    requireRestaurantAccessFn: fakeAuth({ esAdmin: true, esOwner: false }),
    supabaseAdminClient: fakeSupabase({ plan: 'bodega' }),
    puedeUsarFn: puedeUsar,
  })
  assert.equal(r.status, 403)
})

test('premium + sesión owner → OK', async () => {
  const r = await requireCatalogoConsultorImpl(hacerPeticion(), REST_ID, {
    requireRestaurantAccessFn: fakeAuth({ esAdmin: false, esOwner: true }),
    supabaseAdminClient: fakeSupabase({ plan: 'premium' }),
    puedeUsarFn: puedeUsar,
  })
  assert.equal(r.ok, true)
  assert.equal(r.restaurante.plan, 'premium')
})

test('premium + sesión ADMIN → OK (admin puede entrar en premium)', async () => {
  const r = await requireCatalogoConsultorImpl(hacerPeticion(), REST_ID, {
    requireRestaurantAccessFn: fakeAuth({ esAdmin: true, esOwner: false }),
    supabaseAdminClient: fakeSupabase({ plan: 'premium' }),
    puedeUsarFn: puedeUsar,
  })
  assert.equal(r.ok, true)
})

test('premium con suscripción cancelled → 403', async () => {
  const r = await requireCatalogoConsultorImpl(hacerPeticion(), REST_ID, {
    requireRestaurantAccessFn: fakeAuth({ esAdmin: false, esOwner: true }),
    supabaseAdminClient: fakeSupabase({ plan: 'premium', subscription_status: 'cancelled' }),
    puedeUsarFn: puedeUsar,
  })
  assert.equal(r.status, 403)
})

test('sin bearer token → 401 (antes del check de plan)', async () => {
  const r = await requireCatalogoConsultorImpl(hacerPeticion(), REST_ID, {
    requireRestaurantAccessFn: fakeAuth({ esAdmin: false, esOwner: false, hayToken: false }),
    supabaseAdminClient: fakeSupabase({ plan: 'premium' }),
    puedeUsarFn: puedeUsar,
  })
  assert.equal(r.status, 401)
})

test('restaurante inexistente → 404', async () => {
  const r = await requireCatalogoConsultorImpl(hacerPeticion(), REST_ID, {
    requireRestaurantAccessFn: fakeAuth({ esAdmin: true, esOwner: false }),
    supabaseAdminClient: fakeSupabase({ plan: 'pro', restauranteExiste: false }),
    puedeUsarFn: puedeUsar,
  })
  assert.equal(r.status, 404)
})
