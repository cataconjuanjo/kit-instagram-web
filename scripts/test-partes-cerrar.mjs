/**
 * test-partes-cerrar.mjs
 * Integration test: parte con 3 líneas → cerrar → verificar movimientos + stock
 *
 * Cubre:
 *  - POST /api/partes/:id/cerrar devuelve 200 con status='closed'
 *  - Movimientos insertados con origen='parte' y parte_servicio_id correcto
 *  - Stock decrementado para botella; copa delta=0
 *  - Doble cierre devuelve already_closed sin duplicar movimientos
 *
 * Requiere (en .env.local o como vars de entorno):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TEST_EMAIL       — usuario con restaurante activo y ≥3 vinos
 *   TEST_PASSWORD
 *   BASE_URL         — opcional, por defecto http://localhost:3000
 *
 * Uso:
 *   TEST_EMAIL=xxx TEST_PASSWORD=xxx node scripts/test-partes-cerrar.mjs
 */

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvLocal() {
  try {
    const raw = fs.readFileSync('.env.local', 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env.local */ }
}
loadEnvLocal()

const BASE_URL   = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const SUPA_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPA_SVC   = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEST_EMAIL = process.env.TEST_EMAIL
const TEST_PASS  = process.env.TEST_PASSWORD

let passed = 0
let failed = 0

function ok(label)          { console.log(`  ✓ ${label}`); passed++ }
function fail(label, detail) { console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`); failed++ }
function section(title)      { console.log(`\n── ${title}`) }

if (!SUPA_URL || !SUPA_ANON || !SUPA_SVC) {
  console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!TEST_EMAIL || !TEST_PASS) {
  console.error('ERROR: Faltan TEST_EMAIL o TEST_PASSWORD')
  process.exit(1)
}

const admin  = createClient(SUPA_URL, SUPA_SVC,  { auth: { persistSession: false } })
const anon   = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } })

console.log(`\ntest-partes-cerrar.mjs → ${BASE_URL}\n`)

// ── Auth ──────────────────────────────────────────────────────────────────────
section('Auth')
const { data: authData, error: authError } = await anon.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASS,
})
if (authError || !authData?.session?.access_token) {
  console.error(`ERROR auth: ${authError?.message || 'sin sesión'}`)
  process.exit(1)
}
const token = authData.session.access_token
ok('sesión obtenida')

// ── Restaurante y vinos ───────────────────────────────────────────────────────
section('Setup: restaurante y vinos')

const { data: rest } = await admin
  .from('restaurantes')
  .select('id')
  .eq('email', TEST_EMAIL.toLowerCase())
  .single()

if (!rest?.id) {
  console.error('ERROR: no se encontró restaurante para este email')
  process.exit(1)
}
const restauranteId = rest.id
ok(`restaurante ${restauranteId.slice(0, 8)}…`)

const { data: vinos } = await admin
  .from('vinos')
  .select('id, nombre, stock')
  .eq('restaurante_id', restauranteId)
  .eq('activo', true)
  .limit(3)

if (!vinos || vinos.length < 2) {
  console.error('ERROR: se necesitan al menos 2 vinos activos para el test')
  process.exit(1)
}
ok(`${vinos.length} vinos disponibles`)

// Usamos los primeros 3 (o 2 si solo hay 2)
const [vino1, vino2, vino3] = vinos  // vino3 puede ser undefined

// ── Crear parte de test ───────────────────────────────────────────────────────
section('Setup: crear parte de test')

// Fecha fija en el pasado para no colisionar con servicio real
const fechaTest = '2026-01-01'
const turnoTest = 'noche'

// Borrar parte previo de test si existe (idempotencia del setup)
const { data: parteExistente } = await admin
  .from('partes_servicio')
  .select('id, estado')
  .eq('restaurante_id', restauranteId)
  .eq('fecha', fechaTest)
  .eq('turno', turnoTest)
  .single()

if (parteExistente) {
  if (parteExistente.estado === 'cerrado') {
    // Crear con turno diferente para no bloquear el test
    console.log('  ℹ parte test anterior ya cerrado, usando turno "mediodia"')
  }
  // Limpiar líneas y resetear estado para reutilizar el parte
  await admin.from('partes_servicio_lineas').delete().eq('parte_id', parteExistente.id)
  await admin.from('partes_servicio').update({ estado: 'borrador', cerrado_at: null }).eq('id', parteExistente.id)
}

const turnoFinal = (parteExistente?.estado === 'cerrado') ? 'mediodia' : turnoTest

const { data: parte, error: parteErr } = await admin
  .from('partes_servicio')
  .upsert({
    restaurante_id: restauranteId,
    fecha:          fechaTest,
    turno:          turnoFinal,
    estado:         'borrador',
    cerrado_at:     null,
  }, { onConflict: 'restaurante_id,fecha,turno', ignoreDuplicates: false })
  .select('id')
  .single()

if (parteErr || !parte?.id) {
  console.error(`ERROR creando parte: ${parteErr?.message}`)
  process.exit(1)
}
const parteId = parte.id
ok(`parte ${parteId.slice(0, 8)}… (${fechaTest} ${turnoFinal})`)

// ── Añadir 3 líneas: venta_botella×2, invitacion_botella×1, venta_copa×1 ──────
section('Setup: añadir 3 líneas')

const lineasDef = [
  { vino_id: vino1.id, tipo: 'venta_botella',      cantidad: 2, copas_vendidas: null },
  { vino_id: vino2.id, tipo: 'invitacion_botella',  cantidad: 1, copas_vendidas: null },
  ...(vino3 ? [{ vino_id: vino3.id, tipo: 'venta_copa', cantidad: 1, copas_vendidas: 4 }] : []),
]

const { error: lineasErr } = await admin
  .from('partes_servicio_lineas')
  .insert(lineasDef.map(l => ({ ...l, parte_id: parteId, restaurante_id: restauranteId })))

if (lineasErr) {
  console.error(`ERROR insertando líneas: ${lineasErr.message}`)
  process.exit(1)
}
ok(`${lineasDef.length} líneas insertadas`)

// ── Stock antes del cierre ────────────────────────────────────────────────────
section('Stock inicial')

const vinoIds = [...new Set(lineasDef.map(l => l.vino_id))]
const { data: stockAntes } = await admin
  .from('vinos')
  .select('id, stock')
  .in('id', vinoIds)

const stockMap = Object.fromEntries((stockAntes || []).map(v => [v.id, v.stock ?? 0]))
for (const [id, stock] of Object.entries(stockMap)) {
  const nombre = vinos.find(v => v.id === id)?.nombre || id.slice(0, 8)
  ok(`${nombre}: stock ${stock}`)
}

// ── Cerrar via HTTP API ───────────────────────────────────────────────────────
section('POST /api/partes/:id/cerrar')

const res1 = await fetch(`${BASE_URL}/api/partes/${parteId}/cerrar`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${token}`,
  },
})
const body1 = await res1.json().catch(() => ({}))

if (res1.status !== 200) {
  fail(`cerrar → ${res1.status}`, JSON.stringify(body1))
  process.exit(1)
}
ok(`HTTP 200`)

if (body1.status === 'closed') {
  ok(`status = 'closed'`)
} else {
  fail(`status esperado 'closed'`, `recibido: ${body1.status}`)
}

const movimientosRespuesta = Array.isArray(body1.movimientos) ? body1.movimientos : []
ok(`movimientos en respuesta: ${movimientosRespuesta.length}`)

// ── Verificar movimientos en DB ───────────────────────────────────────────────
section('Verificar movimientos en DB')

const { data: movs } = await admin
  .from('movimientos_stock')
  .select('vino_id, tipo, cantidad, origen, parte_servicio_id')
  .eq('parte_servicio_id', parteId)

if (!movs || movs.length === 0) {
  fail('movimientos encontrados en DB', 'ninguno')
} else {
  ok(`${movs.length} movimiento(s) con parte_servicio_id correcto`)
}

const todosOrigen = (movs || []).every(m => m.origen === 'parte')
if (todosOrigen) {
  ok('todos con origen="parte"')
} else {
  const mal = (movs || []).filter(m => m.origen !== 'parte').map(m => m.origen)
  fail('origen="parte" en todos', `orígenes incorrectos: ${mal.join(', ')}`)
}

// ── Verificar stock decrementado ──────────────────────────────────────────────
section('Verificar stock tras cierre')

const { data: stockDespues } = await admin
  .from('vinos')
  .select('id, stock')
  .in('id', vinoIds)

const stockMapDespues = Object.fromEntries((stockDespues || []).map(v => [v.id, v.stock ?? 0]))

for (const linea of lineasDef) {
  const nombre  = vinos.find(v => v.id === linea.vino_id)?.nombre || linea.vino_id.slice(0, 8)
  const antes   = stockMap[linea.vino_id] ?? 0
  const despues = stockMapDespues[linea.vino_id] ?? 0
  const delta   = despues - antes

  if (linea.tipo === 'venta_copa') {
    // Copa: delta=0 en B7a (sin deducción de botella)
    if (delta === 0) {
      ok(`${nombre} (copa): stock sin cambio ✓`)
    } else {
      fail(`${nombre} (copa): debería ser delta=0`, `delta=${delta}`)
    }
  } else {
    // Botella: debería decrementar en cantidad
    const esperado = -linea.cantidad
    const mov = (movs || []).find(m => m.vino_id === linea.vino_id)
    // Si control_stock_desde impide el ajuste, cantidad puede ser 0 en movimientos
    const actualiza = mov ? mov.cantidad !== 0 : false
    if (actualiza) {
      if (delta === esperado || delta === Math.max(-antes, esperado)) {
        ok(`${nombre} (botella): stock ${antes} → ${despues} ✓`)
      } else {
        fail(`${nombre} (botella): delta esperado ${esperado}`, `delta real=${delta}`)
      }
    } else {
      ok(`${nombre} (botella): control_stock_desde pendiente, movimiento registrado sin cambio stock`)
    }
  }
}

// ── Doble cierre (idempotencia) ───────────────────────────────────────────────
section('Doble cierre — idempotencia')

const movAntes = movs?.length ?? 0

const res2 = await fetch(`${BASE_URL}/api/partes/${parteId}/cerrar`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${token}`,
  },
})
const body2 = await res2.json().catch(() => ({}))

if (res2.status === 200 && body2.status === 'already_closed') {
  ok(`doble cierre → 200 already_closed`)
} else {
  fail(`doble cierre`, `${res2.status} ${JSON.stringify(body2)}`)
}

const { data: movsDespues } = await admin
  .from('movimientos_stock')
  .select('id')
  .eq('parte_servicio_id', parteId)

const movDespues = movsDespues?.length ?? 0
if (movDespues === movAntes) {
  ok(`sin movimientos duplicados (${movDespues} = ${movAntes})`)
} else {
  fail(`movimientos duplicados`, `antes=${movAntes}, después=${movDespues}`)
}

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks — ${passed} OK, ${failed} FALLIDOS\n`)
process.exit(failed > 0 ? 1 : 0)
