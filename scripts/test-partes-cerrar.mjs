/**
 * test-partes-cerrar.mjs
 * Integration test: parte → cerrar → verificar movimientos + stock
 *
 * Fase A — control_stock_desde NULL
 *   venta_botella: movimiento registrado, delta stock = 0
 *   Doble cierre: already_closed sin duplicados
 *
 * Fase B — control_stock_desde = hoy (Europe/Madrid)
 *   venta_botella: delta stock = -cantidad (si fuente_ventas ≠ 'ambas')
 *   Doble cierre: already_closed sin duplicados
 *
 * Limpieza automática al final (try/finally):
 *   - Elimina movimientos de los partes de test
 *   - Restaura stock de los vinos afectados
 *   - Elimina líneas y partes de test
 *   - Restaura control_stock_desde al valor original
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TEST_RESTAURANTE_ID  (UUID; ≥2 vinos activos)
 *
 * Uso:
 *   node --env-file=.env.local scripts/test-partes-cerrar.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL   = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID = process.env.TEST_RESTAURANTE_ID

const faltantes = [
  !SUPABASE_URL   && 'NEXT_PUBLIC_SUPABASE_URL',
  !SUPABASE_KEY   && 'SUPABASE_SERVICE_ROLE_KEY',
  !RESTAURANTE_ID && 'TEST_RESTAURANTE_ID',
].filter(Boolean)
if (faltantes.length) {
  console.error(`ERROR: falta${faltantes.length > 1 ? 'n' : ''}: ${faltantes.join(', ')}`)
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

let passed = 0
let failed = 0
function ok(label)            { console.log(`  ✓ ${label}`); passed++ }
function fail(label, detail)  { console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`); failed++ }
function section(title)       { console.log(`\n── ${title}`) }
function madridToday()        {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

// ── Recopilar IDs a limpiar ───────────────────────────────────────────────────
const parteIds      = []           // partes creados en el test
const stockAnterior = new Map()    // vinoId → stock antes de fase B

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getStock(vinoId) {
  const { data } = await db.from('vinos').select('stock').eq('id', vinoId).single()
  return data?.stock ?? 0
}

async function crearYCerrarParte(fecha, turno, lineasDef) {
  // Limpiar parte previo si existe
  const { data: existente } = await db
    .from('partes_servicio')
    .select('id')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('fecha', fecha).eq('turno', turno)
    .maybeSingle()
  if (existente) {
    await db.from('partes_servicio_lineas').delete().eq('parte_id', existente.id)
    await db.from('movimientos_stock').delete().eq('parte_servicio_id', existente.id)
    await db.from('partes_servicio').delete().eq('id', existente.id)
  }

  const { data: parte, error: pErr } = await db
    .from('partes_servicio')
    .insert({ restaurante_id: RESTAURANTE_ID, fecha, turno, estado: 'borrador' })
    .select('id').single()
  if (pErr || !parte?.id) throw new Error(`crear parte: ${pErr?.message}`)
  parteIds.push(parte.id)

  const { error: lErr } = await db
    .from('partes_servicio_lineas')
    .insert(lineasDef.map(l => ({ ...l, parte_id: parte.id, restaurante_id: RESTAURANTE_ID })))
  if (lErr) throw new Error(`insertar líneas: ${lErr.message}`)

  return parte.id
}

// ── Preflight ─────────────────────────────────────────────────────────────────
console.log('\ntest-partes-cerrar.mjs\n')
section('Preflight')

const { data: vinos } = await db
  .from('vinos').select('id, nombre, stock')
  .eq('restaurante_id', RESTAURANTE_ID).eq('activo', true).limit(3)
if (!vinos || vinos.length < 2) {
  console.error(`ERROR: necesito ≥2 vinos activos en ${RESTAURANTE_ID} (hay ${vinos?.length ?? 0})`)
  process.exit(1)
}
const [vino1, vino2, vino3] = vinos
ok(`${vinos.length} vinos disponibles`)

const { data: settings } = await db
  .from('restaurant_economic_settings')
  .select('control_stock_desde, fuente_ventas')
  .eq('restaurante_id', RESTAURANTE_ID).maybeSingle()

const ctrlStockOriginal = settings?.control_stock_desde ?? null
const fuente            = settings?.fuente_ventas ?? 'parte'
ok(`control_stock_desde original: ${ctrlStockOriginal ?? 'NULL'}`)
ok(`fuente_ventas: ${fuente}`)

if (ctrlStockOriginal !== null) {
  console.log('  ℹ  control_stock_desde no es NULL — fase A se ejecuta pero los efectos en stock dependen de la fecha')
}
if (fuente === 'ambas') {
  console.log('  ℹ  fuente_ventas=ambas — en fase B el stock tampoco cambia (TPV es fuente de verdad); se verifica delta=0')
}

const lineasDef = [
  { vino_id: vino1.id, tipo: 'venta_botella',     cantidad: 2, copas_vendidas: null },
  { vino_id: vino2.id, tipo: 'invitacion_botella', cantidad: 1, copas_vendidas: null },
  ...(vino3 ? [{ vino_id: vino3.id, tipo: 'venta_copa', cantidad: 1, copas_vendidas: 4 }] : []),
]
const vinoIds = [...new Set(lineasDef.map(l => l.vino_id))]

try {

  // ── FASE A: control_stock_desde NULL ────────────────────────────────────────
  section('Fase A — control_stock_desde NULL (delta botella esperado: 0)')

  // Asegurar NULL para la fase A
  await db.from('restaurant_economic_settings')
    .upsert({ restaurante_id: RESTAURANTE_ID, control_stock_desde: null },
             { onConflict: 'restaurante_id' })

  const stockAntesA = {}
  for (const id of vinoIds) stockAntesA[id] = await getStock(id)

  let parteAId
  try {
    parteAId = await crearYCerrarParte('2026-01-01', 'noche', lineasDef)
    ok(`parte A creado: ${parteAId.slice(0, 8)}…`)
  } catch (e) {
    fail('crear parte A', e.message); throw e
  }

  const { data: rpcA, error: rpcAErr } = await db.rpc('cerrar_parte_servicio', { p_parte_id: parteAId })
  if (rpcAErr) { fail('RPC fase A', rpcAErr.message); throw new Error(rpcAErr.message) }
  ok('RPC ejecutado')
  if (rpcA?.status === 'closed') ok("status = 'closed'")
  else fail("status esperado 'closed'", `recibido: ${rpcA?.status}`)

  // Movimientos
  const { data: movsA } = await db
    .from('movimientos_stock').select('vino_id, cantidad, origen, parte_servicio_id')
    .eq('parte_servicio_id', parteAId)
  if (movsA?.length > 0) ok(`${movsA.length} movimiento(s) registrado(s)`)
  else fail('movimientos registrados en fase A', 'ninguno')

  // Delta de stock = 0 para venta_botella
  for (const l of lineasDef) {
    const nombre  = vinos.find(v => v.id === l.vino_id)?.nombre || l.vino_id.slice(0, 8)
    const despues = await getStock(l.vino_id)
    const delta   = despues - stockAntesA[l.vino_id]
    if (l.tipo === 'venta_botella') {
      if (delta === 0) ok(`${nombre} (botella): delta=0 con control_stock_desde NULL ✓`)
      else fail(`${nombre} (botella): esperado delta=0`, `real=${delta}`)
    } else if (l.tipo === 'venta_copa') {
      if (delta === 0) ok(`${nombre} (copa): delta=0 ✓`)
      else fail(`${nombre} (copa): esperado delta=0`, `real=${delta}`)
    }
    // invitacion_botella: no testamos stock (comportamiento propio)
  }

  // Doble cierre
  const { data: rpcA2, error: rpcAErr2 } = await db.rpc('cerrar_parte_servicio', { p_parte_id: parteAId })
  if (rpcAErr2) fail('doble cierre A', rpcAErr2.message)
  else if (rpcA2?.status === 'already_closed') ok("doble cierre → already_closed ✓")
  else fail("doble cierre A status", `esperado 'already_closed', recibido: ${rpcA2?.status}`)

  const { data: movsA2 } = await db.from('movimientos_stock').select('id').eq('parte_servicio_id', parteAId)
  if ((movsA2?.length ?? 0) === (movsA?.length ?? 0)) ok('sin duplicados en doble cierre ✓')
  else fail('duplicados en doble cierre A', `antes=${movsA?.length}, después=${movsA2?.length}`)

  // ── FASE B: control_stock_desde = hoy ──────────────────────────────────────
  section(`Fase B — control_stock_desde = hoy ${madridToday()} (delta botella esperado: ${fuente === 'ambas' ? '0 (fuente=ambas)' : '-2'})`)

  await db.from('restaurant_economic_settings')
    .upsert({ restaurante_id: RESTAURANTE_ID, control_stock_desde: madridToday() },
             { onConflict: 'restaurante_id' })
  ok(`control_stock_desde → ${madridToday()}`)

  // Capturar stock antes de fase B para restauración posterior
  for (const id of vinoIds) stockAnterior.set(id, await getStock(id))

  let parteBId
  try {
    parteBId = await crearYCerrarParte('2026-01-02', 'noche', lineasDef)
    ok(`parte B creado: ${parteBId.slice(0, 8)}…`)
  } catch (e) {
    fail('crear parte B', e.message); throw e
  }

  const { data: rpcB, error: rpcBErr } = await db.rpc('cerrar_parte_servicio', { p_parte_id: parteBId })
  if (rpcBErr) { fail('RPC fase B', rpcBErr.message); throw new Error(rpcBErr.message) }
  ok('RPC ejecutado')
  if (rpcB?.status === 'closed') ok("status = 'closed'")
  else fail("status esperado 'closed'", `recibido: ${rpcB?.status}`)

  const { data: movsB } = await db
    .from('movimientos_stock').select('vino_id, cantidad, origen, parte_servicio_id')
    .eq('parte_servicio_id', parteBId)
  if (movsB?.length > 0) ok(`${movsB.length} movimiento(s) registrado(s)`)
  else fail('movimientos registrados en fase B', 'ninguno')

  for (const l of lineasDef) {
    const nombre  = vinos.find(v => v.id === l.vino_id)?.nombre || l.vino_id.slice(0, 8)
    const antes   = stockAnterior.get(l.vino_id) ?? 0
    const despues = await getStock(l.vino_id)
    const delta   = despues - antes

    if (l.tipo === 'venta_botella') {
      const esperado = fuente === 'ambas' ? 0 : -l.cantidad
      if (delta === esperado) ok(`${nombre} (botella): delta=${delta} ✓`)
      else fail(`${nombre} (botella): esperado delta=${esperado}`, `real=${delta}`)
    } else if (l.tipo === 'venta_copa') {
      if (delta === 0) ok(`${nombre} (copa): delta=0 ✓`)
      else fail(`${nombre} (copa): esperado delta=0`, `real=${delta}`)
    }
  }

  // Doble cierre B
  const { data: rpcB2, error: rpcBErr2 } = await db.rpc('cerrar_parte_servicio', { p_parte_id: parteBId })
  if (rpcBErr2) fail('doble cierre B', rpcBErr2.message)
  else if (rpcB2?.status === 'already_closed') ok("doble cierre → already_closed ✓")
  else fail("doble cierre B status", `esperado 'already_closed', recibido: ${rpcB2?.status}`)

  const { data: movsB2 } = await db.from('movimientos_stock').select('id').eq('parte_servicio_id', parteBId)
  if ((movsB2?.length ?? 0) === (movsB?.length ?? 0)) ok('sin duplicados en doble cierre ✓')
  else fail('duplicados en doble cierre B', `antes=${movsB?.length}, después=${movsB2?.length}`)

} finally {

  // ── Limpieza ──────────────────────────────────────────────────────────────
  section('Limpieza')

  // 1. Restaurar stock (revertir cambios de fase B)
  if (stockAnterior.size > 0) {
    for (const [vinoId, stock] of stockAnterior) {
      const { error } = await db.from('vinos').update({ stock }).eq('id', vinoId)
      const nombre = vinos.find(v => v.id === vinoId)?.nombre || vinoId.slice(0, 8)
      if (error) console.error(`  ✗ restaurar stock ${nombre}: ${error.message}`)
      else console.log(`  ✓ stock ${nombre} restaurado a ${stock}`)
    }
  }

  // 2. Eliminar movimientos de test
  if (parteIds.length > 0) {
    const { error } = await db.from('movimientos_stock').delete().in('parte_servicio_id', parteIds)
    if (error) console.error(`  ✗ eliminar movimientos: ${error.message}`)
    else console.log(`  ✓ movimientos de test eliminados`)
  }

  // 3. Eliminar líneas y partes
  if (parteIds.length > 0) {
    await db.from('partes_servicio_lineas').delete().in('parte_id', parteIds)
    const { error } = await db.from('partes_servicio').delete().in('id', parteIds)
    if (error) console.error(`  ✗ eliminar partes: ${error.message}`)
    else console.log(`  ✓ partes de test eliminados (${parteIds.length})`)
  }

  // 4. Restaurar control_stock_desde
  const { error: restoreErr } = await db
    .from('restaurant_economic_settings')
    .upsert({ restaurante_id: RESTAURANTE_ID, control_stock_desde: ctrlStockOriginal },
             { onConflict: 'restaurante_id' })
  if (restoreErr) console.error(`  ✗ restaurar control_stock_desde: ${restoreErr.message}`)
  else console.log(`  ✓ control_stock_desde restaurado a ${ctrlStockOriginal ?? 'NULL'}`)

}

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks — ${passed} OK, ${failed} FALLIDOS\n`)
process.exit(failed > 0 ? 1 : 0)
