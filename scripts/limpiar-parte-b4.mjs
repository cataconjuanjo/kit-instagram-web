/**
 * limpiar-parte-b4.mjs
 * Localiza y elimina un parte de servicio B4 por restaurante + fecha + turno.
 *
 * Por defecto:  --dry-run (solo imprime, sin escribir)
 * Para aplicar: node --env-file=.env.local scripts/limpiar-parte-b4.mjs --apply
 *
 * Args opcionales:
 *   --fecha YYYY-MM-DD    (defecto: 2026-10-14)
 *   --turno <texto>       (defecto: Mediodía)
 *
 * Defaults fijos:
 *   Restaurante : La Taberna del Puerto (a4346301-4dc5-4cb5-a2f5-3ca6469acd66)
 *   Vino        : Ariyanas Natural     (760a5295-2146-4e0f-8261-21ca3a59a469)
 *   Stock rest. : 8
 *
 * Para si encuentra más de 1 parte con esa fecha+turno.
 * Verifica exactamente: 1 parte, 1 línea, 2 movimientos, 1 botella.
 *
 * Orden seguro:
 *   1. Restaurar vino (stock → 8)
 *   2. Borrar movimientos (por parte_servicio_id)
 *   3. Borrar líneas del parte (por parte_id)
 *   4. Borrar parte de servicio
 *   5. Borrar botellas_abiertas (vino + restaurante, estados activos)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const faltantes = [
  !SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
  !SUPABASE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean)
if (faltantes.length) {
  console.error(`ERROR: faltan: ${faltantes.join(', ')}`)
  process.exit(1)
}

// ── Defaults fijos ────────────────────────────────────────────────────────────
const RESTAURANTE_ID = 'a4346301-4dc5-4cb5-a2f5-3ca6469acd66'  // La Taberna del Puerto
const VINO_ID        = '760a5295-2146-4e0f-8261-21ca3a59a469'  // Ariyanas Natural
const STOCK_RESTORE  = 8

// ── Argumentos ────────────────────────────────────────────────────────────────
const argv  = process.argv
const arg   = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] ?? null : null }
const FECHA  = arg('--fecha') ?? '2026-10-14'
const TURNO  = arg('--turno') ?? 'Mediodía'
const DRY_RUN = !argv.includes('--apply')

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

console.log(`\nlimpiar-parte-b4.mjs  [${DRY_RUN ? 'DRY RUN — sin cambios' : 'APPLY'}]\n`)
console.log(`Restaurante : ${RESTAURANTE_ID}  (La Taberna del Puerto)`)
console.log(`Vino        : ${VINO_ID}  (Ariyanas Natural)`)
console.log(`Fecha       : ${FECHA}`)
console.log(`Turno       : ${TURNO}\n`)

// ── 1. Buscar parte por restaurante + fecha + turno ───────────────────────────
const { data: partes, error: partesErr } = await db
  .from('partes_servicio')
  .select('id, fecha, turno, estado')
  .eq('restaurante_id', RESTAURANTE_ID)
  .eq('fecha', FECHA)
  .eq('turno', TURNO)

if (partesErr) {
  console.error(`ERROR buscando parte: ${partesErr.message}`)
  process.exit(1)
}

if (!partes || partes.length === 0) {
  console.log('Parte no encontrado para esa fecha+turno — ya fue borrado o no existe.')
  process.exit(0)
}

if (partes.length > 1) {
  console.error(`ERROR: ${partes.length} partes encontrados para ${FECHA} / ${TURNO}:`)
  for (const p of partes) console.error(`  ${p.id}  [${p.estado}]`)
  console.error('Identifica el ID correcto y usa limpiar-parte-test-b4.mjs con IDs fijos.')
  process.exit(1)
}

const parte = partes[0]
const PARTE_ID = parte.id
console.log(`Parte encontrado : ${PARTE_ID}  [${parte.estado}]`)

// ── 2. Estado actual del vino ─────────────────────────────────────────────────
const { data: vino, error: vinoErr } = await db
  .from('vinos')
  .select('id, nombre, stock, coste_compra, coste_medio_pmp, por_copa')
  .eq('id', VINO_ID)
  .single()
if (vinoErr) { console.error(`ERROR leyendo vino: ${vinoErr.message}`); process.exit(1) }
console.log(`\nVino   : ${vino.nombre}`)
console.log(`  stock = ${vino.stock}  →  restaurará a ${STOCK_RESTORE}`)

// ── 3. Líneas del parte ───────────────────────────────────────────────────────
const { data: lineas, error: lineasErr } = await db
  .from('partes_servicio_lineas')
  .select('id, tipo, cantidad, copas_vendidas, precio_unitario')
  .eq('parte_id', PARTE_ID)
if (lineasErr) { console.error(`ERROR leyendo líneas: ${lineasErr.message}`); process.exit(1) }

console.log(`\nLíneas a borrar (${lineas?.length ?? 0} — esperado 1):`)
for (const l of lineas || []) {
  console.log(`  ${l.id}  ${l.tipo}  cantidad=${l.cantidad}  copas=${l.copas_vendidas}  precio=${l.precio_unitario}€`)
}

// ── 4. Movimientos vinculados al parte ────────────────────────────────────────
const { data: movs, error: movsErr } = await db
  .from('movimientos_stock')
  .select('id, tipo, cantidad, stock_anterior, stock_nuevo, copas_vendidas, motivo')
  .eq('parte_servicio_id', PARTE_ID)
  .eq('restaurante_id', RESTAURANTE_ID)
if (movsErr) { console.error(`ERROR leyendo movimientos: ${movsErr.message}`); process.exit(1) }

console.log(`\nMovimientos a borrar (${movs?.length ?? 0} — esperado 2):`)
for (const m of movs || []) {
  console.log(`  ${m.id}  ${m.tipo}  cantidad=${m.cantidad}  stock ${m.stock_anterior}→${m.stock_nuevo}  copas=${m.copas_vendidas}  motivo=${m.motivo}`)
}

// ── 5. Botellas abiertas del vino (estados activos) ───────────────────────────
const { data: bots, error: botsErr } = await db
  .from('botellas_abiertas')
  .select('id, estado, copas_restantes, copas_servidas, copas_teoricas')
  .eq('vino_id', VINO_ID)
  .eq('restaurante_id', RESTAURANTE_ID)
  .in('estado', ['abierta', 'agotada', 'cerrada_manual'])
if (botsErr) { console.error(`ERROR leyendo botellas: ${botsErr.message}`); process.exit(1) }

console.log(`\nBotellas_abiertas a borrar (${bots?.length ?? 0} — esperado 1):`)
for (const b of bots || []) {
  console.log(`  ${b.id}  [${b.estado}]  servidas=${b.copas_servidas}  restantes=${b.copas_restantes}  teoricas=${b.copas_teoricas}`)
}

// ── Verificación de conteos esperados ────────────────────────────────────────
const alertas = []
if ((lineas?.length ?? 0) !== 1)  alertas.push(`líneas: ${lineas?.length ?? 0} (esperado 1)`)
if ((movs?.length ?? 0) !== 2)    alertas.push(`movimientos: ${movs?.length ?? 0} (esperado 2)`)
if ((bots?.length ?? 0) !== 1)    alertas.push(`botellas: ${bots?.length ?? 0} (esperado 1)`)

console.log(`\n${'─'.repeat(60)}`)
if (alertas.length) {
  console.warn(`⚠  Conteos inesperados: ${alertas.join('; ')}`)
  console.warn('   Revisa los datos antes de aplicar.')
} else {
  console.log('Conteos verificados: 1 parte, 1 línea, 2 movimientos, 1 botella ✓')
}

const botIds = (bots || []).map(b => b.id)
console.log('\nAcciones que se ejecutarán:')
console.log(`  1. Restaurar ${vino.nombre}: stock → ${STOCK_RESTORE}`)
console.log(`  2. Borrar ${movs?.length ?? 0} movimiento(s) (parte_servicio_id=${PARTE_ID})`)
console.log(`  3. Borrar ${lineas?.length ?? 0} línea(s)    (parte_id=${PARTE_ID})`)
console.log(`  4. Borrar parte ${PARTE_ID}`)
console.log(`  5. Borrar ${botIds.length} botella(s) [${botIds.join(', ')}]`)

if (DRY_RUN) {
  console.log(`\nDRY RUN completado — sin cambios.`)
  console.log(`Para aplicar:`)
  console.log(`  node --env-file=.env.local scripts/limpiar-parte-b4.mjs --apply\n`)
  process.exit(0)
}

// ── Aplicar cambios ───────────────────────────────────────────────────────────
console.log('\nAplicando cambios...\n')

// Paso 1: restaurar vino
const { error: vinoUpdErr } = await db
  .from('vinos')
  .update({ stock: STOCK_RESTORE })
  .eq('id', VINO_ID)
if (vinoUpdErr) {
  console.error(`ERROR restaurando vino — abortando (no se borró nada): ${vinoUpdErr.message}`)
  process.exit(1)
}
console.log(`✓ ${vino.nombre}: stock → ${STOCK_RESTORE}`)

// Paso 2: borrar movimientos
const { error: movDelErr } = await db
  .from('movimientos_stock')
  .delete()
  .eq('parte_servicio_id', PARTE_ID)
  .eq('restaurante_id', RESTAURANTE_ID)
if (movDelErr) {
  console.error(`ERROR borrando movimientos — vino ya restaurado, borra el resto manualmente: ${movDelErr.message}`)
  process.exit(1)
}
console.log(`✓ ${movs?.length ?? 0} movimiento(s) eliminado(s)`)

// Paso 3: borrar líneas
const { error: linDelErr } = await db
  .from('partes_servicio_lineas')
  .delete()
  .eq('parte_id', PARTE_ID)
if (linDelErr) {
  console.error(`ERROR borrando líneas — borra parte y botellas manualmente: ${linDelErr.message}`)
  process.exit(1)
}
console.log(`✓ ${lineas?.length ?? 0} línea(s) eliminada(s)`)

// Paso 4: borrar parte
const { error: parteDelErr } = await db
  .from('partes_servicio')
  .delete()
  .eq('id', PARTE_ID)
  .eq('restaurante_id', RESTAURANTE_ID)
if (parteDelErr) {
  console.error(`ERROR borrando parte — borra botellas manualmente: ${parteDelErr.message}`)
  process.exit(1)
}
console.log(`✓ Parte eliminado (${PARTE_ID})`)

// Paso 5: borrar botellas_abiertas
if (botIds.length > 0) {
  const { error: botDelErr } = await db
    .from('botellas_abiertas')
    .delete()
    .in('id', botIds)
    .eq('restaurante_id', RESTAURANTE_ID)
  if (botDelErr) {
    console.error(`ERROR borrando botellas_abiertas: ${botDelErr.message}`)
    process.exit(1)
  }
  console.log(`✓ ${botIds.length} botella(s) eliminada(s)`)
} else {
  console.log('  (no hay botellas_abiertas activas que borrar)')
}

// ── Verificación final ────────────────────────────────────────────────────────
const { data: vinoFinal } = await db.from('vinos').select('stock').eq('id', VINO_ID).single()
const { data: parteCheck } = await db.from('partes_servicio').select('id').eq('id', PARTE_ID).maybeSingle()
const { data: botCheck } = await db.from('botellas_abiertas').select('id')
  .eq('vino_id', VINO_ID).eq('restaurante_id', RESTAURANTE_ID)
  .in('estado', ['abierta', 'agotada', 'cerrada_manual'])

console.log(`\nVerificación:`)
console.log(`  stock = ${vinoFinal?.stock} (esperado ${STOCK_RESTORE}) ${vinoFinal?.stock === STOCK_RESTORE ? '✓' : '✗'}`)
console.log(`  parte borrado = ${!parteCheck ? '✓' : '✗ (sigue existiendo)'}`)
console.log(`  botellas activas restantes = ${(botCheck || []).length} (esperado 0) ${(botCheck || []).length === 0 ? '✓' : '✗'}`)

console.log('\nLimpieza completada.\n')
