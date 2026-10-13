/**
 * Test de integración: conteo de inventario (B3)
 *
 * Uso:
 *   . .env.local && node scripts/test-conteo-inventario.mjs
 *
 * Requiere: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_RESTAURANTE_ID
 * Necesita al menos 3 vinos activos en el restaurante de prueba.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = process.env.SUPABASE_URL      || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID    = process.env.TEST_RESTAURANTE_ID

if (!SUPABASE_URL || !SUPABASE_KEY || !RESTAURANTE_ID) {
  console.error('Falta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o TEST_RESTAURANTE_ID')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY)

let passed = 0
let failed = 0

function ok(label) { console.log(`  ✓ ${label}`); passed++ }
function fail(label, detail) { console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failed++ }

async function assert(label, condition, detail = '') {
  if (condition) ok(label)
  else fail(label, detail)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function limpiarBorradores() {
  const { data } = await db
    .from('conteos_inventario')
    .select('id')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('estado', 'borrador')
  if (data?.length) {
    const ids = data.map(c => c.id)
    await db.from('conteos_inventario_lineas').delete().in('conteo_id', ids)
    await db.from('conteos_inventario').delete().in('id', ids)
  }
}

async function obtenerVinosActivos() {
  const { data, error } = await db
    .from('vinos')
    .select('id, nombre, stock')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('activo', true)
    .order('nombre')
    .limit(3)
  if (error) throw new Error(error.message)
  return data || []
}

async function stockActual(vinoId) {
  const { data } = await db.from('vinos').select('stock').eq('id', vinoId).single()
  return data?.stock ?? null
}

// ── Suite ─────────────────────────────────────────────────────────────────────

console.log('\n── test-conteo-inventario ──────────────────────────────────────\n')

// Arranque limpio
await limpiarBorradores()

const vinos = await obtenerVinosActivos()
if (vinos.length < 3) {
  console.error(`Necesito al menos 3 vinos activos en restaurante ${RESTAURANTE_ID} (hay ${vinos.length})`)
  process.exit(1)
}
console.log(`Vinos de prueba: ${vinos.map(v => v.nombre).join(', ')}\n`)

// ── 1. Crear conteo periódico ─────────────────────────────────────────────────
console.log('1. Crear borrador')

const { data: conteoData, error: conteoErr } = await db
  .from('conteos_inventario')
  .insert({ restaurante_id: RESTAURANTE_ID, tipo: 'periodico' })
  .select()
  .single()

await assert('conteo creado sin error', !conteoErr, conteoErr?.message)
await assert('estado = borrador', conteoData?.estado === 'borrador')

const conteoId = conteoData?.id

// Insertar líneas (snapshot manual para el test)
const lineas = vinos.map(v => ({
  conteo_id:     conteoId,
  restaurante_id: RESTAURANTE_ID,
  vino_id:       v.id,
  stock_teorico: Math.max(0, Number(v.stock) || 0),
}))
const { error: lineasErr } = await db.from('conteos_inventario_lineas').insert(lineas)
await assert('líneas insertadas', !lineasErr, lineasErr?.message)

// ── 2. PATCH líneas ───────────────────────────────────────────────────────────
console.log('\n2. Actualizar líneas')

const [v0, v1, v2] = vinos
const stockTeorico0 = Math.max(0, Number(v0.stock) || 0)
const stockTeorico1 = Math.max(0, Number(v1.stock) || 0)

// Vino 0: contado = stock_teorico (sin diferencia)
await db.from('conteos_inventario_lineas')
  .update({ stock_contado: stockTeorico0, contado: true })
  .eq('conteo_id', conteoId).eq('vino_id', v0.id)

// Vino 1: contado = stock_teorico - 2 (faltante)
const stockContado1 = Math.max(0, stockTeorico1 - 2)
await db.from('conteos_inventario_lineas')
  .update({ stock_contado: stockContado1, contado: true, motivo: 'rotura' })
  .eq('conteo_id', conteoId).eq('vino_id', v1.id)

// Vino 2: sin contar

const { data: lineasCheck } = await db
  .from('conteos_inventario_lineas')
  .select('vino_id, stock_contado, contado, motivo, diferencia')
  .eq('conteo_id', conteoId)

const l0 = lineasCheck?.find(l => l.vino_id === v0.id)
const l1 = lineasCheck?.find(l => l.vino_id === v1.id)
const l2 = lineasCheck?.find(l => l.vino_id === v2.id)

await assert('vino0: contado=true, diferencia=0',  l0?.contado && l0?.diferencia === 0)
await assert('vino1: contado=true, diferencia=-2', l1?.contado && l1?.diferencia === -2, `diferencia=${l1?.diferencia}`)
await assert('vino1: motivo=rotura',               l1?.motivo === 'rotura')
await assert('vino2: contado=false',               l2?.contado === false)

// ── 3. Cerrar conteo ──────────────────────────────────────────────────────────
console.log('\n3. Cerrar conteo')

const stockAntes1 = await stockActual(v1.id)

const { data: rpcData, error: rpcErr } = await db.rpc('cerrar_conteo_inventario', {
  p_conteo_id: conteoId,
})
await assert('RPC cerrar sin error', !rpcErr, rpcErr?.message)
await assert('status = closed',      rpcData?.status === 'closed', JSON.stringify(rpcData))

// Verificar estado en tabla
const { data: conteoCerrado } = await db
  .from('conteos_inventario')
  .select('estado, cerrado_en')
  .eq('id', conteoId)
  .single()

await assert('estado = cerrado',   conteoCerrado?.estado === 'cerrado')
await assert('cerrado_en poblado', !!conteoCerrado?.cerrado_en)

// ── 4. Verificar que el stock de vino1 cambió ─────────────────────────────────
console.log('\n4. Verificar stock tras cierre')

const stockDespues1 = await stockActual(v1.id)
const diferenciaEsperada = stockContado1 - stockTeorico1  // negativo

if (stockTeorico1 !== stockContado1) {
  await assert(
    `stock vino1 ajustado (${stockAntes1} → ${stockDespues1}, diff=${diferenciaEsperada})`,
    stockDespues1 === stockContado1,
    `esperado=${stockContado1}, obtenido=${stockDespues1}`
  )
} else {
  await assert('vino1 sin diferencia, stock sin cambio', stockDespues1 === stockAntes1)
}

// Stock de vino0 no debería cambiar (diferencia=0)
const stockDespues0 = await stockActual(v0.id)
await assert('stock vino0 sin cambio (diferencia=0)', stockDespues0 === v0.stock)

// Verificar movimiento generado para vino1
if (stockTeorico1 !== stockContado1) {
  const { data: movs } = await db
    .from('movimientos_stock')
    .select('id, tipo, origen, stock_nuevo, stock_anterior')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('vino_id', v1.id)
    .eq('origen', 'manual')
    .order('created_at', { ascending: false })
    .limit(1)

  await assert('movimiento origen=manual generado', movs?.length > 0)
  await assert('stock_nuevo = stock_contado',       movs?.[0]?.stock_nuevo === stockContado1)
}

// ── 5. Doble cierre = idempotente ─────────────────────────────────────────────
console.log('\n5. Doble cierre (idempotencia)')

const { data: rpc2, error: rpc2Err } = await db.rpc('cerrar_conteo_inventario', {
  p_conteo_id: conteoId,
})
await assert('doble cierre sin error',          !rpc2Err, rpc2Err?.message)
await assert('status = already_closed',         rpc2?.status === 'already_closed', JSON.stringify(rpc2))

// Stock no cambió en el segundo cierre
const stockFinal1 = await stockActual(v1.id)
await assert('stock no cambia en doble cierre', stockFinal1 === stockDespues1)

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────────`)
console.log(`  Resultado: ${passed} pasados, ${failed} fallidos`)
console.log(`────────────────────────────────────────────────────────────────\n`)
process.exit(failed > 0 ? 1 : 0)
