/**
 * limpiar-conteo-lo-de-carmen.mjs
 * Elimina el parte de prueba del 2026-10-12 creado durante la verificación de B3
 * y restaura el stock de Pintia a 10.
 *
 * Por defecto: --dry-run (solo imprime lo que haría, sin escribir)
 * Para ejecutar: node --env-file=.env.local scripts/limpiar-conteo-lo-de-carmen.mjs --apply
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TEST_RESTAURANTE_ID   — UUID de Lo de Carmen
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

const DRY_RUN = !process.argv.includes('--apply')
const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

console.log(`\nlimpiar-conteo-lo-de-carmen.mjs  [${DRY_RUN ? 'DRY RUN — sin cambios' : 'APPLY'}]\n`)

// ── 1. Localizar el parte del 2026-10-12 ─────────────────────────────────────
const { data: partes, error: partesErr } = await db
  .from('partes_servicio')
  .select('id, fecha, turno, estado')
  .eq('restaurante_id', RESTAURANTE_ID)
  .eq('fecha', '2026-10-12')
  .order('turno')

if (partesErr) { console.error(`ERROR buscando partes: ${partesErr.message}`); process.exit(1) }
if (!partes?.length) {
  console.log('No se encontró ningún parte con fecha 2026-10-12. Nada que limpiar.')
  process.exit(0)
}

console.log(`Partes encontrados (2026-10-12):`)
for (const p of partes) console.log(`  ${p.id}  turno=${p.turno}  estado=${p.estado}`)

const parteIds = partes.map(p => p.id)

// ── 2. Líneas asociadas ───────────────────────────────────────────────────────
const { data: lineas } = await db
  .from('partes_servicio_lineas')
  .select('id, vino_id, tipo, cantidad')
  .in('parte_id', parteIds)

console.log(`\nLíneas a eliminar (${lineas?.length ?? 0}):`)
for (const l of lineas || []) console.log(`  ${l.id}  tipo=${l.tipo}  cantidad=${l.cantidad}`)

// ── 3. Movimientos asociados ──────────────────────────────────────────────────
const { data: movs } = await db
  .from('movimientos_stock')
  .select('id, vino_id, tipo, cantidad, stock_anterior, stock_nuevo')
  .in('parte_servicio_id', parteIds)

console.log(`\nMovimientos a eliminar (${movs?.length ?? 0}):`)
for (const m of movs || []) {
  console.log(`  ${m.id}  tipo=${m.tipo}  cantidad=${m.cantidad}  stock ${m.stock_anterior}→${m.stock_nuevo}`)
}

// ── 4. Vino Pintia ────────────────────────────────────────────────────────────
const { data: pintia } = await db
  .from('vinos')
  .select('id, nombre, stock')
  .eq('restaurante_id', RESTAURANTE_ID)
  .ilike('nombre', '%pintia%')
  .maybeSingle()

if (pintia) {
  console.log(`\nPintia: stock actual = ${pintia.stock}  →  se restaurará a 10`)
} else {
  console.log('\nPintia: no encontrado (se buscó con ilike %pintia%)')
}

// ── 5. Resumen y salida si dry-run ────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
if (DRY_RUN) {
  console.log(`DRY RUN completado. Para aplicar los cambios:`)
  console.log(`  node --env-file=.env.local scripts/limpiar-conteo-lo-de-carmen.mjs --apply\n`)
  process.exit(0)
}

// ── 6. Aplicar cambios ────────────────────────────────────────────────────────
console.log('Aplicando cambios...\n')

// Movimientos
if (movs?.length) {
  const { error } = await db.from('movimientos_stock').delete().in('parte_servicio_id', parteIds)
  if (error) { console.error(`ERROR eliminando movimientos: ${error.message}`); process.exit(1) }
  console.log(`✓ ${movs.length} movimiento(s) eliminado(s)`)
}

// Líneas
if (lineas?.length) {
  const { error } = await db.from('partes_servicio_lineas').delete().in('parte_id', parteIds)
  if (error) { console.error(`ERROR eliminando líneas: ${error.message}`); process.exit(1) }
  console.log(`✓ ${lineas.length} línea(s) eliminada(s)`)
}

// Partes
const { error: parteDelErr } = await db.from('partes_servicio').delete().in('id', parteIds)
if (parteDelErr) { console.error(`ERROR eliminando partes: ${parteDelErr.message}`); process.exit(1) }
console.log(`✓ ${partes.length} parte(s) eliminado(s)`)

// Pintia → stock 10
if (pintia) {
  const { error } = await db.from('vinos').update({ stock: 10 }).eq('id', pintia.id)
  if (error) { console.error(`ERROR actualizando stock Pintia: ${error.message}`); process.exit(1) }
  console.log(`✓ Pintia: stock restaurado a 10`)
}

console.log('\nLimpieza completada.\n')
