/**
 * limpiar-parte-test-b4.mjs
 * Elimina el parte de prueba B4 de La Taberna del Puerto y restaura Ariyanas Natural.
 *
 * Por defecto: --dry-run (solo imprime lo que haría, sin escribir)
 * Para ejecutar: node --env-file=.env.local scripts/limpiar-parte-test-b4.mjs --apply
 *
 * Qué elimina (filtrado solo por IDs fijos — nunca toca otros datos):
 *   · 1 movimiento de stock  (parte_servicio_id = PARTE_ID, id = MOV_ID)
 *   · 1 línea de parte       (id = LINEA_ID)
 *   · 1 parte de servicio    (id = PARTE_ID)
 *   · 2 filas botellas_abiertas de Ariyanas Natural (ids fijos)
 *
 * Orden seguro (vino primero, botellas al final):
 *   1. Restaurar Ariyanas Natural: stock → 8
 *   2. Borrar movimiento_stock
 *   3. Borrar línea del parte
 *   4. Borrar parte de servicio
 *   5. Borrar botellas_abiertas
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

const DRY_RUN = !process.argv.includes('--apply')
const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// ── IDs fijos — solo se tocan estos registros ─────────────────────────────────
const RESTAURANTE_ID = 'a4346301-4dc5-4cb5-a2f5-3ca6469acd66'  // La Taberna del Puerto
const PARTE_ID       = 'f1803295-b209-416e-8711-c04aa43050af'
const LINEA_ID       = '63f129ef-1044-4de6-a588-5cfbaf72b6cb'
const MOV_ID         = 'a35b8ea2-a4b5-41ce-8cbd-00a396f981a9'
const VINO_ID        = '760a5295-2146-4e0f-8261-21ca3a59a469'  // Ariyanas Natural
const BOTELLA_IDS    = [
  '85553837-054b-4a49-9782-9f4108570f67',  // agotada (4/4.5 copas)
  '89206253-0b95-4ebd-adf6-8ad8188d8fca',  // abierta (saldo 2.5)
]
const STOCK_RESTORE  = 8

console.log(`\nlimpiar-parte-test-b4.mjs  [${DRY_RUN ? 'DRY RUN — sin cambios' : 'APPLY'}]\n`)
console.log(`Restaurante : ${RESTAURANTE_ID}  (La Taberna del Puerto)`)
console.log(`Parte       : ${PARTE_ID}`)
console.log(`Vino        : ${VINO_ID}  (Ariyanas Natural)\n`)

// ── 1. Verificar estado actual ────────────────────────────────────────────────
const { data: vino, error: vinoErr } = await db
  .from('vinos')
  .select('id, nombre, stock, coste_compra, coste_medio_pmp, por_copa')
  .eq('id', VINO_ID)
  .single()
if (vinoErr) { console.error(`ERROR leyendo vino: ${vinoErr.message}`); process.exit(1) }
console.log(`Vino actual : ${vino.nombre}`)
console.log(`  stock          = ${vino.stock}  →  restaurará a ${STOCK_RESTORE}`)
console.log(`  coste_compra   = ${vino.coste_compra}  (sin cambio)`)
console.log(`  coste_medio_pmp= ${vino.coste_medio_pmp}  (sin cambio)`)
console.log(`  por_copa       = ${vino.por_copa}  (sin cambio)`)

const { data: parte, error: parteErr } = await db
  .from('partes_servicio')
  .select('id, fecha, turno, estado')
  .eq('id', PARTE_ID)
  .maybeSingle()
if (parteErr) { console.error(`ERROR leyendo parte: ${parteErr.message}`); process.exit(1) }
if (!parte) { console.log('\nParte no encontrado — ya fue borrado.'); process.exit(0) }
console.log(`\nParte : ${parte.fecha} ${parte.turno} [${parte.estado}]`)

const { data: lineas } = await db
  .from('partes_servicio_lineas')
  .select('id, tipo, cantidad, copas_vendidas, precio_unitario')
  .eq('id', LINEA_ID)
console.log(`Líneas a borrar (${lineas?.length ?? 0}):`)
for (const l of lineas || []) {
  console.log(`  ${l.id}  ${l.tipo}  cantidad=${l.cantidad}  copas=${l.copas_vendidas}  precio=${l.precio_unitario}€`)
}

const { data: movs } = await db
  .from('movimientos_stock')
  .select('id, tipo, cantidad, stock_anterior, stock_nuevo, copas_vendidas')
  .eq('id', MOV_ID)
  .eq('restaurante_id', RESTAURANTE_ID)
console.log(`Movimientos a borrar (${movs?.length ?? 0}):`)
for (const m of movs || []) {
  console.log(`  ${m.id}  ${m.tipo}  cantidad=${m.cantidad}  stock ${m.stock_anterior}→${m.stock_nuevo}  copas=${m.copas_vendidas}`)
}

const { data: bots } = await db
  .from('botellas_abiertas')
  .select('id, estado, copas_restantes, copas_servidas')
  .in('id', BOTELLA_IDS)
  .eq('restaurante_id', RESTAURANTE_ID)
console.log(`Botellas_abiertas a borrar (${bots?.length ?? 0}):`)
for (const b of bots || []) {
  console.log(`  ${b.id}  [${b.estado}]  servidas=${b.copas_servidas}  restantes=${b.copas_restantes}`)
}

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log('Acciones que se ejecutarán:')
console.log(`  1. Restaurar ${vino.nombre}: stock → ${STOCK_RESTORE}`)
console.log(`  2. Borrar movimiento  ${MOV_ID}`)
console.log(`  3. Borrar línea parte ${LINEA_ID}`)
console.log(`  4. Borrar parte       ${PARTE_ID}`)
console.log(`  5. Borrar botellas    ${BOTELLA_IDS.join(', ')}`)

if (DRY_RUN) {
  console.log(`\nDRY RUN completado — sin cambios.`)
  console.log(`Para aplicar:`)
  console.log(`  node --env-file=.env.local scripts/limpiar-parte-test-b4.mjs --apply\n`)
  process.exit(0)
}

// ── Aplicar cambios ───────────────────────────────────────────────────────────
console.log('\nAplicando cambios...\n')

// Paso 1: restaurar vino (si falla aquí, nada fue borrado)
const { error: vinoUpdErr } = await db
  .from('vinos')
  .update({ stock: STOCK_RESTORE })
  .eq('id', VINO_ID)
if (vinoUpdErr) {
  console.error(`ERROR restaurando vino — abortando (no se borró nada): ${vinoUpdErr.message}`)
  process.exit(1)
}
console.log(`✓ ${vino.nombre}: stock → ${STOCK_RESTORE}`)

// Paso 2: borrar movimiento
const { error: movDelErr } = await db
  .from('movimientos_stock')
  .delete()
  .eq('id', MOV_ID)
  .eq('restaurante_id', RESTAURANTE_ID)
if (movDelErr) {
  console.error(`ERROR borrando movimiento — vino ya restaurado, borra el resto manualmente: ${movDelErr.message}`)
  process.exit(1)
}
console.log(`✓ Movimiento eliminado (${MOV_ID})`)

// Paso 3: borrar línea del parte
const { error: lineaDelErr } = await db
  .from('partes_servicio_lineas')
  .delete()
  .eq('id', LINEA_ID)
if (lineaDelErr) {
  console.error(`ERROR borrando línea — borra parte y botellas manualmente: ${lineaDelErr.message}`)
  process.exit(1)
}
console.log(`✓ Línea eliminada (${LINEA_ID})`)

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
const { error: botDelErr } = await db
  .from('botellas_abiertas')
  .delete()
  .in('id', BOTELLA_IDS)
  .eq('restaurante_id', RESTAURANTE_ID)
if (botDelErr) {
  console.error(`ERROR borrando botellas_abiertas: ${botDelErr.message}`)
  process.exit(1)
}
console.log(`✓ botellas_abiertas eliminadas (${BOTELLA_IDS.length})`)

// ── Verificación final ────────────────────────────────────────────────────────
const { data: vinoFinal } = await db.from('vinos').select('stock, por_copa').eq('id', VINO_ID).single()
const { data: parteCheck } = await db.from('partes_servicio').select('id').eq('id', PARTE_ID).maybeSingle()
const { data: botCheck } = await db.from('botellas_abiertas').select('id').in('id', BOTELLA_IDS)

console.log(`\nVerificación:`)
console.log(`  stock = ${vinoFinal?.stock} (esperado ${STOCK_RESTORE}) ${vinoFinal?.stock === STOCK_RESTORE ? '✓' : '✗'}`)
console.log(`  por_copa = ${vinoFinal?.por_copa} (sin cambio) ✓`)
console.log(`  parte borrado = ${!parteCheck ? '✓' : '✗ (sigue existiendo)'}`)
console.log(`  botellas_abiertas restantes = ${(botCheck || []).length} (esperado 0) ${(botCheck || []).length === 0 ? '✓' : '✗'}`)

console.log('\nLimpieza completada.\n')
