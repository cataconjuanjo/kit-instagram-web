/**
 * Limpieza de la demo Casa Marisma:
 *   A) Deja restaurantes.ciudad y restaurantes.provincia en NULL (por
 *      coherencia con la UI: la cabecera del dashboard y el subtítulo del
 *      hub público dependen de esos campos).
 *   B) Borra el movimiento de stock con motivo 'TEST SEGURIDAD' del vino
 *      Albamar y restaura vinos.stock al valor stock_anterior del propio
 *      movimiento.
 *   C) Escanea tablas del demo en busca de otros restos de prueba
 *      (TEST, prueba, demo test, lorem, asdf). Solo LISTA — no borra.
 *
 * Idempotente, dry-run por defecto, blindado al UUID y al nombre
 * exacto "Casa Marisma". Scope en cada UPDATE/DELETE (R2).
 *
 * Uso:
 *   node --env-file=.env.local scripts/fix-casa-marisma-limpieza.mjs           # dry-run
 *   node --env-file=.env.local scripts/fix-casa-marisma-limpieza.mjs --apply   # escribe
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

const TARGET_ID      = '65d26545-7c7e-424c-9c29-33bfe8bbaafa'
const TARGET_NAME_LC = 'casa marisma'
const UUID_DENYLIST = new Set([
  'db3af496-00f1-4295-82b6-35427b9b6286',
  '7af94e33-48cd-43b8-b939-4796ba58e4d8',
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66',
  '6b528438-3d24-432d-9728-dc2ff868baf6',
])
if (UUID_DENYLIST.has(TARGET_ID)) { console.error('ERROR denylist'); process.exit(1) }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.')
  console.error('Lanza con: node --env-file=.env.local scripts/fix-casa-marisma-limpieza.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa
  .from('restaurantes')
  .select('id, nombre, ciudad, provincia')
  .eq('id', TARGET_ID)
  .maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

console.log(`\n[limpieza Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)

// ────────────────────────────────────────────────────────────────────────────
// A) Nullificar ciudad / provincia
// ────────────────────────────────────────────────────────────────────────────
console.log(`\n── A · restaurantes.ciudad / provincia ───────────────────────────`)
console.log(`  ciudad actual:    ${rest.ciudad == null ? 'NULL' : JSON.stringify(rest.ciudad)}`)
console.log(`  provincia actual: ${rest.provincia == null ? 'NULL' : JSON.stringify(rest.provincia)}`)
const cambioCiudad = rest.ciudad != null && rest.ciudad !== ''
const cambioProv   = rest.provincia != null && rest.provincia !== ''
if (!cambioCiudad && !cambioProv) {
  console.log(`  ✓ ya están vacíos. Nada que hacer en A.`)
}

// ────────────────────────────────────────────────────────────────────────────
// B) Borrar movimiento TEST SEGURIDAD
// ────────────────────────────────────────────────────────────────────────────
console.log(`\n── B · movimiento 'TEST SEGURIDAD' ───────────────────────────────`)

// Localiza el movimiento con un ILIKE sobre motivo. Scope por restaurante_id.
const { data: movsTest, error: errMov } = await supa
  .from('movimientos_stock')
  .select('id, restaurante_id, vino_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, created_at, vinos(nombre, stock)')
  .eq('restaurante_id', TARGET_ID)
  .ilike('motivo', '%TEST SEGURIDAD%')
if (errMov) { console.error('ERROR leyendo movimientos_stock:', errMov.message); process.exit(1) }

if (!movsTest || movsTest.length === 0) {
  console.log(`  ✓ no hay movimientos con motivo 'TEST SEGURIDAD'. Nada que hacer.`)
} else {
  console.log(`  ${movsTest.length} movimiento(s) encontrado(s):`)
  for (const m of movsTest) {
    const stockActual = m.vinos?.stock ?? '?'
    console.log(`    - id=${m.id}`)
    console.log(`      vino=${m.vinos?.nombre || m.vino_id}  (stock actual=${stockActual})`)
    console.log(`      fecha=${m.created_at}  tipo=${m.tipo}  cantidad=${m.cantidad}`)
    console.log(`      stock_anterior=${m.stock_anterior} → stock_nuevo=${m.stock_nuevo}  motivo=${JSON.stringify(m.motivo)}`)
    console.log(`      → se borra la fila y vinos.stock vuelve a ${m.stock_anterior}`)
  }
}

// Avisa de rastros en libro_compras (no borra).
const { data: lcTest } = await supa
  .from('libro_compras')
  .select('periodo, proveedor, facturas')
  .eq('restaurante_id', TARGET_ID)
let lcHits = []
for (const row of (lcTest || [])) {
  const facs = Array.isArray(row.facturas) ? row.facturas : []
  for (const f of facs) {
    const texto = JSON.stringify(f).toLowerCase()
    if (/test\s*seguridad|lorem|asdf/.test(texto)) {
      lcHits.push({ periodo: row.periodo, proveedor: row.proveedor, factura: f })
    }
  }
}
if (lcHits.length) {
  console.log(`\n  ⚠ Avisos en libro_compras (NO se tocan; revísalos):`)
  for (const h of lcHits) {
    console.log(`    - [${h.periodo}] ${h.proveedor}  → ${JSON.stringify(h.factura)}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// C) Rastreo amplio de restos de prueba (solo lista; no toca nada)
// ────────────────────────────────────────────────────────────────────────────
console.log(`\n── C · rastreo de restos de prueba ───────────────────────────────`)

const PATRONES = ['test', 'prueba', 'demo test', 'lorem', 'asdf']
function matchPatron(s) {
  const t = String(s || '').toLowerCase()
  return PATRONES.some(p => t.includes(p))
}

async function escanearTabla(tabla, columnas) {
  const colList = columnas.join(', ')
  const { data, error } = await supa.from(tabla).select(`id, ${colList}`).eq('restaurante_id', TARGET_ID).limit(2000)
  if (error) {
    if (error.code === '42P01') return // undefined_table
    console.log(`  (aviso) ${tabla}: ${error.message}`)
    return
  }
  const hits = []
  for (const row of (data || [])) {
    for (const c of columnas) {
      if (matchPatron(row[c])) { hits.push({ id: row.id, col: c, val: row[c] }); break }
    }
  }
  if (hits.length) {
    console.log(`  · ${tabla}: ${hits.length} fila(s) con rastro de prueba`)
    for (const h of hits.slice(0, 10)) {
      console.log(`      id=${h.id}  ${h.col}=${JSON.stringify(h.val).slice(0, 120)}`)
    }
    if (hits.length > 10) console.log(`      ... y ${hits.length - 10} más`)
  }
}

// Columnas con texto libre que podrían tener rastros de prueba.
await escanearTabla('movimientos_stock', ['motivo'])
await escanearTabla('vinos',             ['nombre', 'bodega', 'notas_cata', 'proveedor', 'referencia_proveedor'])
await escanearTabla('platos',            ['nombre', 'descripcion'])
await escanearTabla('consultor_propuestas', ['titulo', 'detalle'])
await escanearTabla('partes_servicio',   ['notas'])
await escanearTabla('cierres_servicio',  ['notas'])
await escanearTabla('libro_compras',     ['proveedor'])  // texto plano del proveedor

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar A y B.')
  process.exit(0)
}

// ────────────────────────────────────────────────────────────────────────────
// APPLY
// ────────────────────────────────────────────────────────────────────────────
console.log('\n── APPLY ─────────────────────────────────────────────────────────')

// A) ciudad/provincia a NULL
if (cambioCiudad || cambioProv) {
  const payload = {}
  if (cambioCiudad) payload.ciudad = null
  if (cambioProv)   payload.provincia = null
  const { error } = await supa
    .from('restaurantes')
    .update(payload)
    .eq('id', TARGET_ID)
  if (error) {
    console.error(`  (A) ERROR nullificando ciudad/provincia: ${error.message}`)
    console.error(`  Si la columna es NOT NULL, usa cadena vacía en su lugar y dímelo para decidir un valor neutro.`)
    process.exit(1)
  }
  console.log(`  ✓ (A) restaurantes.ciudad/provincia a NULL.`)
}

// Verificación de A
const { data: restVerif } = await supa
  .from('restaurantes').select('ciudad, provincia').eq('id', TARGET_ID).maybeSingle()
console.log(`  (A) estado tras apply: ciudad=${restVerif?.ciudad == null ? 'NULL' : JSON.stringify(restVerif.ciudad)} · provincia=${restVerif?.provincia == null ? 'NULL' : JSON.stringify(restVerif.provincia)}`)

// B) borrar movimientos TEST SEGURIDAD + restaurar stock al stock_anterior
for (const m of (movsTest || [])) {
  const { error: errUpd } = await supa
    .from('vinos')
    .update({ stock: m.stock_anterior })
    .eq('id', m.vino_id)
    .eq('restaurante_id', TARGET_ID)
  if (errUpd) { console.error(`  (B) ERROR restaurando stock de ${m.vinos?.nombre}: ${errUpd.message}`); continue }

  const { error: errDel, data: borradas } = await supa
    .from('movimientos_stock')
    .delete()
    .eq('id', m.id)
    .eq('restaurante_id', TARGET_ID)
    .select('id')
  if (errDel) { console.error(`  (B) ERROR borrando movimiento ${m.id}: ${errDel.message}`); continue }

  // Verificación: re-lectura del vino y del movimiento.
  const { data: vinoVerif } = await supa
    .from('vinos').select('nombre, stock').eq('id', m.vino_id).maybeSingle()
  const { data: movVerif }  = await supa
    .from('movimientos_stock').select('id').eq('id', m.id).maybeSingle()
  console.log(`  ✓ (B) ${vinoVerif?.nombre}: stock=${vinoVerif?.stock} (esperado ${m.stock_anterior}); movimiento borrado=${!movVerif}`)
}

console.log('\n[limpieza Casa Marisma] completado.')
