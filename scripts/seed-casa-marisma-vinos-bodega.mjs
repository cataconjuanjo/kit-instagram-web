/**
 * Rellena vinos.bodega (productor) para los vinos activos de Casa Marisma
 * SOLO donde esté vacío. La UI de Inventario y Precios y márgenes muestra
 * "Sin bodega" en ese caso (ver InventarioPanel.js:391 y SommStockSection.js:224).
 *
 * Confirmación del campo: el productor en `vinos` es la columna `bodega`
 * (no hay un campo `productor`). El catálogo canónico vive en
 * `proveedor_catalogo_vinos.bodega` y se enlaza vía `vinos.catalogo_vino_id`.
 *
 * Resolución (en este orden):
 *   1) Si vinos.catalogo_vino_id → proveedor_catalogo_vinos.bodega.
 *   2) Si no, match normalizado por nombre contra proveedor_catalogo_vinos.
 *      - normalizar: lower + sin acentos + trim + collapse espacios.
 *      - requiere coincidencia exacta tras normalizar Y bodega no vacía
 *        en el catálogo. Si hay varios candidatos distintos → sin match.
 *   3) Resto: "sin coincidencia", se lista en el dry-run. No inventa.
 *
 * Idempotente: no toca vinos con bodega ya poblada. Scoped por
 * restaurante_id + id del vino en el UPDATE (R2). Dry-run por defecto.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-casa-marisma-vinos-bodega.mjs           # dry-run
 *   node --env-file=.env.local scripts/seed-casa-marisma-vinos-bodega.mjs --apply   # escribe
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
  console.error('Lanza con: node --env-file=.env.local scripts/seed-casa-marisma-vinos-bodega.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
const nonEmpty = s => typeof s === 'string' && s.trim() !== ''

// ── Carga vinos activos del destino ─────────────────────────────────────────
const { data: vinos, error: errV } = await supa
  .from('vinos')
  .select('id, nombre, bodega, catalogo_vino_id, activo')
  .eq('restaurante_id', TARGET_ID)
  .eq('activo', true)
  .order('nombre', { ascending: true })
if (errV) { console.error('ERROR leyendo vinos:', errV.message); process.exit(1) }

const total   = vinos?.length || 0
const sinBod  = (vinos || []).filter(v => !nonEmpty(v.bodega))
const yaCon   = total - sinBod.length

// ── Resolución por catalogo_vino_id (bulk) ──────────────────────────────────
const conFk  = sinBod.filter(v => v.catalogo_vino_id)
const fkIds  = [...new Set(conFk.map(v => v.catalogo_vino_id))]
const catFk  = {}
if (fkIds.length) {
  const { data: rows, error } = await supa
    .from('proveedor_catalogo_vinos')
    .select('id, bodega')
    .in('id', fkIds)
  if (error) { console.error('ERROR leyendo proveedor_catalogo_vinos:', error.message); process.exit(1) }
  for (const r of (rows || [])) catFk[r.id] = r.bodega || null
}

// ── Resolución por nombre normalizado (bulk) ────────────────────────────────
// Agrupamos entradas del catálogo por nombre normalizado y nos quedamos con
// la bodega si todas las coincidencias apuntan al mismo productor.
const sinFk = sinBod.filter(v => !v.catalogo_vino_id || !catFk[v.catalogo_vino_id])
const nombresBuscados = [...new Set(sinFk.map(v => norm(v.nombre)))].filter(Boolean)
const catByNorm = new Map() // normNombre → Set<bodega>
if (nombresBuscados.length) {
  // PostgREST no tiene normalización; traemos candidatos y filtramos en JS.
  // Para no traer todo el catálogo, acotamos por prefijos de palabras clave.
  // Sencillo y suficiente: filtramos en cliente.
  const { data: rows, error } = await supa
    .from('proveedor_catalogo_vinos')
    .select('nombre, bodega')
    .eq('activo', true)
    .not('bodega', 'is', null)
  if (error) { console.error('ERROR leyendo catálogo por nombre:', error.message); process.exit(1) }
  for (const r of (rows || [])) {
    const k = norm(r.nombre)
    if (!k) continue
    if (!catByNorm.has(k)) catByNorm.set(k, new Set())
    catByNorm.get(k).add(String(r.bodega).trim())
  }
}

// ── Decide la bodega final para cada vino sin bodega ───────────────────────
const updates = []
const sinMatch = []
for (const v of sinBod) {
  let bodega = null
  let fuente = null

  if (v.catalogo_vino_id && catFk[v.catalogo_vino_id]) {
    bodega = String(catFk[v.catalogo_vino_id]).trim()
    fuente = 'catalogo_vino_id'
  }

  if (!nonEmpty(bodega)) {
    const k = norm(v.nombre)
    const set = k && catByNorm.get(k)
    if (set && set.size === 1) {
      bodega = [...set][0]
      fuente = 'nombre_normalizado'
    } else if (set && set.size > 1) {
      sinMatch.push({ nombre: v.nombre, motivo: `nombre ambiguo: ${set.size} candidatos distintos en catálogo` })
      continue
    }
  }

  if (nonEmpty(bodega)) {
    updates.push({ id: v.id, nombre: v.nombre, bodega, fuente })
  } else {
    sinMatch.push({
      nombre: v.nombre,
      motivo: v.catalogo_vino_id
        ? 'FK a catálogo sin bodega'
        : 'no hay coincidencia por nombre normalizado en el catálogo',
    })
  }
}

// ── Resumen ─────────────────────────────────────────────────────────────────
console.log(`\n[seed Vinos.bodega Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`\nResumen:`)
console.log(`  vinos activos totales:            ${total}`)
console.log(`  ya con bodega (no se tocan):      ${yaCon}`)
console.log(`  pendientes (sin bodega):          ${sinBod.length}`)
console.log(`  -> se rellenarán:                 ${updates.length}`)
console.log(`  -> sin coincidencia:              ${sinMatch.length}`)

if (updates.length) {
  const fuentes = updates.reduce((acc, u) => { acc[u.fuente] = (acc[u.fuente] || 0) + 1; return acc }, {})
  console.log(`  distribución por fuente:          ${Object.entries(fuentes).map(([k, n]) => `${k}=${n}`).join(', ')}`)
  console.log(`\nPrimeros 10 que se rellenarán:`)
  for (const u of updates.slice(0, 10)) {
    console.log(`  - ${String(u.nombre || '').slice(0, 44).padEnd(44)} → ${u.bodega}   [${u.fuente}]`)
  }
}

if (sinMatch.length) {
  console.log(`\nSin coincidencia (no se tocan; listalo y, si quieres, actualízalos manualmente):`)
  for (const s of sinMatch) {
    console.log(`  - ${String(s.nombre || '').slice(0, 44).padEnd(44)}  (${s.motivo})`)
  }
}

if (!APPLY) {
  console.log(`\nDry-run: no se escribe nada. Añade --apply para ejecutar.`)
  process.exit(0)
}

// ── Aplica UPDATEs scoped (R2: WHERE id = ? AND restaurante_id = TARGET) ───
let ok = 0, ko = 0
for (const u of updates) {
  const { error } = await supa
    .from('vinos')
    .update({ bodega: u.bodega })
    .eq('id', u.id)
    .eq('restaurante_id', TARGET_ID)
    .is('bodega', null)   // guarda extra: no sobrescribir si de repente tiene valor
  if (error) { ko += 1; console.warn(`(aviso) ${u.nombre}: ${error.message}`); continue }
  ok += 1
}
// Segunda pasada por los que vinos.bodega sea '' (cadena vacía) en vez de null.
for (const u of updates) {
  const { error } = await supa
    .from('vinos')
    .update({ bodega: u.bodega })
    .eq('id', u.id)
    .eq('restaurante_id', TARGET_ID)
    .eq('bodega', '')
  if (error) { /* ya contado arriba o no aplica */ }
}

console.log(`\n✓ vinos actualizados: ${ok}/${updates.length}${ko ? ` (${ko} con aviso)` : ''}`)
