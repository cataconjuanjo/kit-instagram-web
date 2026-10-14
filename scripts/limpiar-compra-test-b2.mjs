/**
 * limpiar-compra-test-b2.mjs
 * Elimina la cabecera de compra TEST-B2-001 creada durante la verificación de B2
 * en La Taberna del Puerto y restaura Ariyanas Natural a su estado previo.
 *
 * Por defecto: --dry-run (solo imprime lo que haría, sin escribir)
 * Para ejecutar: node --env-file=.env.local scripts/limpiar-compra-test-b2.mjs --apply
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
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
  console.error(`ERROR: falta${faltantes.length > 1 ? 'n' : ''}: ${faltantes.join(', ')}`)
  process.exit(1)
}

const DRY_RUN = !process.argv.includes('--apply')
const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// Filtros fijos — solo tocan La Taberna del Puerto, solo el documento de prueba
const RESTAURANTE_ID   = 'a4346301-4dc5-4cb5-a2f5-3ca6469acd66'
const NUMERO_DOCUMENTO = 'TEST-B2-001'

console.log(`\nlimpiar-compra-test-b2.mjs  [${DRY_RUN ? 'DRY RUN — sin cambios' : 'APPLY'}]\n`)
console.log(`Filtro: restaurante_id = ${RESTAURANTE_ID}`)
console.log(`        numero_documento = ${NUMERO_DOCUMENTO}\n`)

// ── 1. Localizar la cabecera ──────────────────────────────────────────────────
const { data: cabecera, error: cabErr } = await db
  .from('cabecera_compras')
  .select('id, fecha, proveedor, numero_documento, total_neto, estado')
  .eq('restaurante_id', RESTAURANTE_ID)
  .eq('numero_documento', NUMERO_DOCUMENTO)
  .maybeSingle()

if (cabErr) { console.error(`ERROR buscando cabecera: ${cabErr.message}`); process.exit(1) }
if (!cabecera) {
  console.log('No se encontró ninguna cabecera con ese numero_documento. Nada que limpiar.')
  process.exit(0)
}

console.log('Cabecera encontrada:')
console.log(`  id            = ${cabecera.id}`)
console.log(`  proveedor     = ${cabecera.proveedor}`)
console.log(`  fecha         = ${cabecera.fecha}`)
console.log(`  total_neto    = ${cabecera.total_neto} €`)
console.log(`  estado        = ${cabecera.estado}`)

// ── 2. Líneas de compra ───────────────────────────────────────────────────────
const { data: lineas, error: linErr } = await db
  .from('lineas_compra')
  .select('id, vino_id, uds, uds_bonificadas, precio_tarifa, desc_linea, importe_neto, precio_neto_ud')
  .eq('cabecera_compra_id', cabecera.id)

if (linErr) { console.error(`ERROR buscando líneas: ${linErr.message}`); process.exit(1) }

console.log(`\nLíneas de compra (${lineas?.length ?? 0}):`)
for (const l of lineas || []) {
  console.log(`  ${l.id}  vino=${l.vino_id}  uds=${l.uds}  bonus=${l.uds_bonificadas}  neto=${l.importe_neto} €  precio_neto_ud=${l.precio_neto_ud}`)
}

// ── 3. Movimientos asociados ──────────────────────────────────────────────────
const { data: movs, error: movErr } = await db
  .from('movimientos_stock')
  .select('id, vino_id, tipo, cantidad, stock_anterior, stock_nuevo')
  .eq('restaurante_id', RESTAURANTE_ID)
  .eq('cabecera_compra_id', cabecera.id)

if (movErr) { console.error(`ERROR buscando movimientos: ${movErr.message}`); process.exit(1) }

console.log(`\nMovimientos a eliminar (${movs?.length ?? 0}):`)
for (const m of movs || []) {
  console.log(`  ${m.id}  tipo=${m.tipo}  cantidad=${m.cantidad}  stock ${m.stock_anterior}→${m.stock_nuevo}`)
}

// ── 4. Calcular estado previo del vino (Ariyanas Natural) ─────────────────────
// Hay una sola línea en este pedido de prueba; si hubiera más de un vino afectado
// el script avisa y sale para evitar ambigüedad.
const vinosAfectados = [...new Set((movs || []).map(m => m.vino_id))]
if (vinosAfectados.length > 1) {
  console.error(`\nERROR: la cabecera toca ${vinosAfectados.length} vinos distintos.`)
  console.error('Este script solo cubre el caso de un único vino. Limpia manualmente.')
  process.exit(1)
}

const vinoId = vinosAfectados[0] ?? lineas?.[0]?.vino_id
if (!vinoId) {
  console.error('\nERROR: no se encontró ningún vino asociado a la cabecera.')
  process.exit(1)
}

const { data: vino, error: vinoErr } = await db
  .from('vinos')
  .select('id, nombre, stock, coste_compra, coste_medio_pmp')
  .eq('id', vinoId)
  .single()

if (vinoErr) { console.error(`ERROR leyendo vino: ${vinoErr.message}`); process.exit(1) }

// Recuperar PMP previo a la compra usando la fórmula inversa:
//   PMP_nuevo = (stock_ant × PMP_ant + uds × precio_neto_ud) / (stock_ant + uds)
//   → PMP_ant  = (PMP_nuevo × (stock_ant + uds) - uds × precio_neto_ud) / stock_ant
const mov     = movs?.[0]
const linea   = lineas?.[0]
const stockAnt = mov?.stock_anterior ?? 0
const uds      = (linea?.uds ?? 0) + (linea?.uds_bonificadas ?? 0)
const precioNu = linea?.precio_neto_ud ?? 0
const pmpActual = vino.coste_medio_pmp ?? 0

let pmpPrevio = null
if (stockAnt > 0 && uds > 0 && pmpActual > 0) {
  const pmpCalc = (pmpActual * (stockAnt + uds) - uds * precioNu) / stockAnt
  pmpPrevio = Math.round(pmpCalc * 10000) / 10000  // 4 decimales
} else if (stockAnt === 0) {
  // Era la primera entrada; antes de la compra no había PMP acumulado
  pmpPrevio = null
}

console.log(`\nVino a restaurar: ${vino.nombre} (${vino.id})`)
console.log(`  stock actual      = ${vino.stock}  →  se restaurará a 8`)
console.log(`  coste_compra      = ${vino.coste_compra}  →  se restaurará a 14`)
console.log(`  coste_medio_pmp   = ${vino.coste_medio_pmp}  →  se restaurará a ${pmpPrevio ?? 'null'}`)
if (pmpPrevio !== null) {
  console.log(`  (calculado: (${pmpActual} × ${stockAnt + uds} − ${uds} × ${precioNu}) / ${stockAnt})`)
}

// ── 5. Resumen y salida si dry-run ────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
if (DRY_RUN) {
  console.log('DRY RUN completado. Para aplicar los cambios:')
  console.log(`  node --env-file=.env.local scripts/limpiar-compra-test-b2.mjs --apply\n`)
  process.exit(0)
}

// ── 6. Aplicar cambios ────────────────────────────────────────────────────────
console.log('Aplicando cambios...\n')

// Movimientos (antes que la cabecera, por si la FK tiene restricción)
if (movs?.length) {
  const { error } = await db
    .from('movimientos_stock')
    .delete()
    .eq('cabecera_compra_id', cabecera.id)
    .eq('restaurante_id', RESTAURANTE_ID)
  if (error) { console.error(`ERROR eliminando movimientos: ${error.message}`); process.exit(1) }
  console.log(`✓ ${movs.length} movimiento(s) eliminado(s)`)
}

// Líneas (CASCADE desde cabecera, pero lo hacemos explícito)
if (lineas?.length) {
  const { error } = await db
    .from('lineas_compra')
    .delete()
    .eq('cabecera_compra_id', cabecera.id)
  if (error) { console.error(`ERROR eliminando líneas: ${error.message}`); process.exit(1) }
  console.log(`✓ ${lineas.length} línea(s) eliminada(s)`)
}

// Cabecera
const { error: cabDelErr } = await db
  .from('cabecera_compras')
  .delete()
  .eq('id', cabecera.id)
  .eq('restaurante_id', RESTAURANTE_ID)
if (cabDelErr) { console.error(`ERROR eliminando cabecera: ${cabDelErr.message}`); process.exit(1) }
console.log('✓ Cabecera eliminada')

// Vino → estado previo
const vinoUpdate = {
  stock:          8,
  coste_compra:   14,
  coste_medio_pmp: pmpPrevio,
}
const { error: vinoUpdErr } = await db
  .from('vinos')
  .update(vinoUpdate)
  .eq('id', vinoId)
if (vinoUpdErr) { console.error(`ERROR restaurando vino: ${vinoUpdErr.message}`); process.exit(1) }
console.log(`✓ ${vino.nombre}: stock=8, coste_compra=14, coste_medio_pmp=${pmpPrevio ?? 'null'}`)

console.log('\nLimpieza completada.\n')
