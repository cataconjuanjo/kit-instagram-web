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
 *
 * Orden de --apply (más seguro primero):
 *   1. Restaurar vino (stock / coste_compra / coste_medio_pmp)
 *   2. Borrar movimientos_stock
 *   3. Borrar lineas_compra
 *   4. Borrar cabecera_compras
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
console.log(`Filtro: restaurante_id   = ${RESTAURANTE_ID}`)
console.log(`        numero_documento = ${NUMERO_DOCUMENTO}\n`)

// ── 1. Localizar la cabecera ──────────────────────────────────────────────────
// Columnas reales de cabecera_compras (no hay total_neto):
//   id, restaurante_id, proveedor, fecha, numero_documento, referencia_externa,
//   descuento_global, iva_pct, notas, origen, estado, created_at
const { data: cabecera, error: cabErr } = await db
  .from('cabecera_compras')
  .select('id, fecha, proveedor, numero_documento, descuento_global, iva_pct, estado')
  .eq('restaurante_id', RESTAURANTE_ID)
  .eq('numero_documento', NUMERO_DOCUMENTO)
  .maybeSingle()

if (cabErr) { console.error(`ERROR buscando cabecera: ${cabErr.message}`); process.exit(1) }
if (!cabecera) {
  console.log('No se encontró ninguna cabecera con ese numero_documento. Nada que limpiar.')
  process.exit(0)
}

console.log('Cabecera encontrada:')
console.log(`  id               = ${cabecera.id}`)
console.log(`  proveedor        = ${cabecera.proveedor}`)
console.log(`  fecha            = ${cabecera.fecha}`)
console.log(`  descuento_global = ${cabecera.descuento_global}%`)
console.log(`  iva_pct          = ${cabecera.iva_pct}%`)
console.log(`  estado           = ${cabecera.estado}`)

// ── 2. Líneas de compra ───────────────────────────────────────────────────────
// FK en lineas_compra es "cabecera_id" (no cabecera_compra_id)
// Columna de descuento se llama "descuento_linea" (no desc_linea)
const { data: lineas, error: linErr } = await db
  .from('lineas_compra')
  .select('id, vino_id, uds, uds_bonificadas, precio_tarifa, descuento_linea, importe_neto, precio_neto_ud')
  .eq('cabecera_id', cabecera.id)

if (linErr) { console.error(`ERROR buscando líneas: ${linErr.message}`); process.exit(1) }

console.log(`\nLíneas de compra (${lineas?.length ?? 0}):`)
for (const l of lineas || []) {
  const udsTotal = (l.uds ?? 0) + (l.uds_bonificadas ?? 0)
  console.log(
    `  ${l.id}  vino=${l.vino_id}` +
    `  uds=${l.uds}+bon=${l.uds_bonificadas}=${udsTotal}` +
    `  precio_tarifa=${l.precio_tarifa}  desc=${l.descuento_linea}%` +
    `  neto=${l.importe_neto}€  precio_neto_ud=${l.precio_neto_ud}`
  )
}

// ── 3. Movimientos asociados ──────────────────────────────────────────────────
// movimientos_stock SÍ usa cabecera_compra_id (columna añadida por B2)
const { data: movs, error: movErr } = await db
  .from('movimientos_stock')
  .select('id, vino_id, tipo, cantidad, stock_anterior, stock_nuevo, coste_medio_ponderado')
  .eq('restaurante_id', RESTAURANTE_ID)
  .eq('cabecera_compra_id', cabecera.id)

if (movErr) { console.error(`ERROR buscando movimientos: ${movErr.message}`); process.exit(1) }

console.log(`\nMovimientos a eliminar (${movs?.length ?? 0}):`)
for (const m of movs || []) {
  console.log(
    `  ${m.id}  tipo=${m.tipo}  cantidad=${m.cantidad}` +
    `  stock ${m.stock_anterior}→${m.stock_nuevo}` +
    `  coste_snapshot=${m.coste_medio_ponderado}`
  )
}

// ── 4. Calcular estado previo del vino ────────────────────────────────────────
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

// Recuperar PMP previo a la compra con la fórmula inversa:
//   PMP_nuevo = (stock_ant × PMP_ant + uds_totales × precio_neto_ud) / (stock_ant + uds_totales)
//   → PMP_ant  = (PMP_nuevo × (stock_ant + uds_totales) - uds_totales × precio_neto_ud) / stock_ant
const mov       = movs?.[0]
const linea     = lineas?.[0]
const stockAnt  = mov?.stock_anterior ?? 0
const udsTotal  = (linea?.uds ?? 0) + (linea?.uds_bonificadas ?? 0)
const precioNu  = linea?.precio_neto_ud ?? 0
const pmpActual = vino.coste_medio_pmp ?? 0

let pmpPrevio = null
if (stockAnt > 0 && udsTotal > 0 && pmpActual > 0) {
  const raw = (pmpActual * (stockAnt + udsTotal) - udsTotal * precioNu) / stockAnt
  pmpPrevio = Math.round(raw * 10000) / 10000
} else if (stockAnt === 0) {
  // Era la primera entrada; antes de la compra no había PMP acumulado
  pmpPrevio = null
}

const STOCK_RESTORE       = 8
const COSTE_COMPRA_RESTORE = 14

console.log(`\nVino a restaurar: ${vino.nombre} (${vino.id})`)
console.log(`  stock actual       = ${vino.stock}      →  restaurará a ${STOCK_RESTORE}`)
console.log(`  coste_compra       = ${vino.coste_compra}  →  restaurará a ${COSTE_COMPRA_RESTORE}`)
console.log(`  coste_medio_pmp    = ${vino.coste_medio_pmp}  →  restaurará a ${pmpPrevio ?? 'null'}`)
if (pmpPrevio !== null) {
  console.log(
    `  (fórmula: (${pmpActual} × (${stockAnt}+${udsTotal}) − ${udsTotal} × ${precioNu}) / ${stockAnt} = ${pmpPrevio})`
  )
}

// ── 5. Resumen y salida si dry-run ────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`Acciones que se ejecutarían:`)
console.log(`  1. Restaurar ${vino.nombre}: stock=${STOCK_RESTORE}, coste_compra=${COSTE_COMPRA_RESTORE}, coste_medio_pmp=${pmpPrevio ?? 'null'}`)
console.log(`  2. Borrar ${movs?.length ?? 0} movimiento(s) (cabecera_compra_id=${cabecera.id})`)
console.log(`  3. Borrar ${lineas?.length ?? 0} línea(s) (cabecera_id=${cabecera.id})`)
console.log(`  4. Borrar cabecera ${cabecera.id}`)

if (DRY_RUN) {
  console.log(`\nDRY RUN completado — sin cambios.`)
  console.log(`Para aplicar:`)
  console.log(`  node --env-file=.env.local scripts/limpiar-compra-test-b2.mjs --apply\n`)
  process.exit(0)
}

// ── 6. Aplicar cambios (orden seguro: vino primero, cabecera al final) ─────────
console.log('\nAplicando cambios...\n')

// Paso 1: restaurar vino (si falla aquí, nada fue borrado)
const { error: vinoUpdErr } = await db
  .from('vinos')
  .update({ stock: STOCK_RESTORE, coste_compra: COSTE_COMPRA_RESTORE, coste_medio_pmp: pmpPrevio })
  .eq('id', vinoId)
if (vinoUpdErr) {
  console.error(`ERROR restaurando vino — abortando (no se borró nada): ${vinoUpdErr.message}`)
  process.exit(1)
}
console.log(`✓ ${vino.nombre}: stock=${STOCK_RESTORE}, coste_compra=${COSTE_COMPRA_RESTORE}, coste_medio_pmp=${pmpPrevio ?? 'null'}`)

// Paso 2: borrar movimientos
if (movs?.length) {
  const { error } = await db
    .from('movimientos_stock')
    .delete()
    .eq('cabecera_compra_id', cabecera.id)
    .eq('restaurante_id', RESTAURANTE_ID)
  if (error) {
    console.error(`ERROR borrando movimientos — el vino ya fue restaurado, borra manualmente el resto: ${error.message}`)
    process.exit(1)
  }
  console.log(`✓ ${movs.length} movimiento(s) eliminado(s)`)
}

// Paso 3: borrar líneas (cabecera_id es la FK en lineas_compra)
if (lineas?.length) {
  const { error } = await db
    .from('lineas_compra')
    .delete()
    .eq('cabecera_id', cabecera.id)
  if (error) {
    console.error(`ERROR borrando líneas — vino y movimientos ya procesados, borra cabecera manualmente: ${error.message}`)
    process.exit(1)
  }
  console.log(`✓ ${lineas.length} línea(s) eliminada(s)`)
}

// Paso 4: borrar cabecera
const { error: cabDelErr } = await db
  .from('cabecera_compras')
  .delete()
  .eq('id', cabecera.id)
  .eq('restaurante_id', RESTAURANTE_ID)
if (cabDelErr) {
  console.error(`ERROR borrando cabecera — todo lo demás ya fue procesado, bórrala manualmente (id=${cabecera.id}): ${cabDelErr.message}`)
  process.exit(1)
}
console.log(`✓ Cabecera eliminada (${cabecera.id})`)

console.log('\nLimpieza completada.\n')
