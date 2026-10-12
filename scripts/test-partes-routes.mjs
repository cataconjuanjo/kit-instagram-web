/**
 * test-partes-routes.mjs
 * Integration test: crear parte → añadir línea → borrar línea → cerrar
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL   — en .env.local o como env var
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   TEST_EMAIL                 — email de un usuario con restaurante activo
 *   TEST_PASSWORD
 *   BASE_URL                   — opcional, por defecto http://localhost:3000
 *
 * Uso:
 *   TEST_EMAIL=demo@... TEST_PASSWORD=... node scripts/test-partes-routes.mjs
 *   # o con dev server arrancado y .env.local ya cargado via Next:
 *   BASE_URL=https://www.cataconjuanjo.com node scripts/test-partes-routes.mjs
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── Cargar .env.local si existe (sin imprimir valores) ───────────────────────
function loadEnvLocal() {
  try {
    const raw = fs.readFileSync('.env.local', 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {
    // no .env.local — se usan las vars del entorno
  }
}
loadEnvLocal()

const BASE_URL    = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const SUPA_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const TEST_EMAIL  = process.env.TEST_EMAIL
const TEST_PASS   = process.env.TEST_PASSWORD

// ── Helpers ──────────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

function ok(label) { console.log(`  ✓ ${label}`); passed++ }
function fail(label, detail) { console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`); failed++ }

async function api(path, options = {}, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body }
}

// ── Verificaciones previas ────────────────────────────────────────────────────
if (!SUPA_URL || !SUPA_KEY) {
  console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}
if (!TEST_EMAIL || !TEST_PASS) {
  console.error('ERROR: Faltan TEST_EMAIL o TEST_PASSWORD')
  console.error('  Ejemplo: TEST_EMAIL=demo@xxx.com TEST_PASSWORD=xxx node scripts/test-partes-routes.mjs')
  process.exit(1)
}

// ── Test ─────────────────────────────────────────────────────────────────────
console.log(`\ntest-partes-routes.mjs → ${BASE_URL}\n`)

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

// Paso 0: Autenticación
const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASS,
})
if (authError || !authData?.session?.access_token) {
  console.error(`ERROR auth: ${authError?.message || 'sin sesión'}`)
  process.exit(1)
}
const token = authData.session.access_token
ok('auth — sesión obtenida')

// Obtener restaurante_id y vino_id del usuario autenticado
const { data: restaurante } = await supabase
  .from('restaurantes')
  .select('id')
  .eq('email', TEST_EMAIL.toLowerCase())
  .single()

if (!restaurante?.id) {
  console.error('ERROR: no se encontró restaurante para este email')
  process.exit(1)
}
const restauranteId = restaurante.id

const { data: vinoRow } = await supabase
  .from('vinos')
  .select('id')
  .eq('restaurante_id', restauranteId)
  .eq('activo', true)
  .limit(1)
  .single()

if (!vinoRow?.id) {
  console.error('ERROR: el restaurante no tiene vinos activos para el test')
  process.exit(1)
}
const vinoId = vinoRow.id

// ── Paso 1: Crear parte ───────────────────────────────────────────────────────
const fechaHoy = new Date().toISOString().slice(0, 10)
let parteId

{
  const { status, body } = await api('/api/partes', {
    method: 'POST',
    body: JSON.stringify({ restaurante_id: restauranteId, fecha: fechaHoy, turno: 'unico' }),
  }, token)

  if (status === 201 && body.parte?.id) {
    parteId = body.parte.id
    ok(`POST /api/partes → 201 (parte ${parteId.slice(0,8)}…)`)
  } else if (status === 409 && body.parte?.id && body.parte?.estado === 'borrador') {
    parteId = body.parte.id
    ok(`POST /api/partes → 409 (parte borrador ya existe, reutilizando ${parteId.slice(0,8)}…)`)
  } else {
    fail('POST /api/partes', `${status} ${JSON.stringify(body)}`)
    process.exit(1)
  }
}

// ── Paso 2: Añadir línea ──────────────────────────────────────────────────────
let lineaId

{
  const { status, body } = await api(`/api/partes/${parteId}/lineas`, {
    method: 'POST',
    body: JSON.stringify({ vino_id: vinoId, tipo: 'venta_botella', cantidad: 1 }),
  }, token)

  if (status === 201 && body.linea?.id) {
    lineaId = body.linea.id
    ok(`POST /api/partes/:id/lineas → 201 (linea ${lineaId.slice(0,8)}…)`)
  } else {
    fail(`POST /api/partes/${parteId.slice(0,8)}…/lineas`, `${status} ${JSON.stringify(body)}`)
    process.exit(1)
  }
}

// ── Paso 3: Borrar línea ──────────────────────────────────────────────────────
{
  const { status, body } = await api(
    `/api/partes/${parteId}/lineas?linea_id=${lineaId}`,
    { method: 'DELETE' },
    token
  )

  if (status === 200 && body.ok) {
    ok(`DELETE /api/partes/:id/lineas?linea_id=… → 200`)
  } else {
    fail(`DELETE /api/partes/${parteId.slice(0,8)}…/lineas`, `${status} ${JSON.stringify(body)}`)
    process.exit(1)
  }
}

// ── Paso 4: Cerrar parte (vacío — sin movimientos de stock) ───────────────────
{
  const { status, body } = await api(`/api/partes/${parteId}/cerrar`, {
    method: 'POST',
    body: JSON.stringify({}),
  }, token)

  if (status === 200 && body.estado === 'cerrado') {
    ok(`POST /api/partes/:id/cerrar → 200 (estado: cerrado)`)
  } else if (status === 409) {
    ok(`POST /api/partes/:id/cerrar → 409 (ya estaba cerrado — idempotencia OK)`)
  } else {
    fail(`POST /api/partes/${parteId.slice(0,8)}…/cerrar`, `${status} ${JSON.stringify(body)}`)
  }
}

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks — ${passed} OK, ${failed} FALLIDOS\n`)
process.exit(failed > 0 ? 1 : 0)
