/**
 * Recálculo de pvp_copa_catalogo para filas de carta_simulacion con catalogo_vino_id,
 * usando el divisor correcto por restaurante (copasVendibles(config)) en lugar del
 * divisor escalonado antiguo (copasVendiblesEscalonado 5,4→4,4) que ya no existe.
 *
 * Garantías:
 *   - Selecciona TODAS las filas con catalogo_vino_id (tanto las que ya tienen snapshot
 *     como las que no), porque el bug afectaba a todas las calculadas con el escalonado.
 *   - UPDATE escribe SOLO pvp_copa_catalogo. Nunca toca pvp_recomendado_catalogo,
 *     precio_botella, precio_copa, ofrecido_por_copa ni estado.
 *   - UPDATE acotado por id de fila (no en bloque), con filtro adicional
 *     catalogo_vino_id IS NOT NULL como doble guardia.
 *   - Sin flag --apply: modo preview (muestra qué cambiaría). Con --apply: ejecuta el UPDATE.
 *
 * Uso:
 *   node scripts/backfill-snapshots-botella.mjs           ← preview
 *   node scripts/backfill-snapshots-botella.mjs --apply   ← ejecutar
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { calcularPreciosSugeridos } from '../app/lib/pricingUtils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')

// ── 1. Carga filas candidatas (todas las que tienen catalogo_vino_id) ────
// Incluye las que ya tienen snapshot: el bug afectaba a todas las calculadas
// con el divisor escalonado antiguo, independientemente de si el campo es null.
const { data: lineas, error } = await supabase
  .from('carta_simulacion')
  .select('id, nombre, bodega, restaurante_id, catalogo_vino_id, pvp_copa_catalogo')
  .not('catalogo_vino_id', 'is', null)

if (error) { console.error('Error leyendo carta_simulacion:', error.message); process.exit(1) }

if (lineas.length === 0) {
  console.log('No hay filas con catalogo_vino_id sin snapshot. Nada que hacer.')
  process.exit(0)
}

// ── 2. Carga coste_estimado del catálogo para cada vino ──────────────────
const catalogoIds = [...new Set(lineas.map(l => l.catalogo_vino_id))]
const { data: catalogoRows, error: catError } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('id, coste_estimado')
  .in('id', catalogoIds)

if (catError) { console.error('Error leyendo catálogo:', catError.message); process.exit(1) }
const costes = Object.fromEntries((catalogoRows || []).map(r => [r.id, r.coste_estimado]))

// ── 2b. Carga restaurant_economic_settings por restaurante ───────────────
const restauranteIds = [...new Set(lineas.map(l => l.restaurante_id))]
const { data: econRows } = await supabase
  .from('restaurant_economic_settings')
  .select('restaurante_id, copas_por_botella, merma_copa_pct, iva_venta_pct, pvp_incluye_iva, coste_incluye_iva')
  .in('restaurante_id', restauranteIds)
const econByRest = Object.fromEntries((econRows || []).map(r => [r.restaurante_id, r]))

// ── 3. Calcular snapshots usando calcularPreciosSugeridos con config por restaurante ──
const actualizaciones = []
const sinCoste = []

for (const l of lineas) {
  const coste = Number(costes[l.catalogo_vino_id]) || 0
  if (!coste) { sinCoste.push(l); continue }
  const econConfig = econByRest[l.restaurante_id] || {}
  const calc = calcularPreciosSugeridos(coste, econConfig)
  actualizaciones.push({
    id: l.id,
    nombre: l.nombre,
    restaurante_id: l.restaurante_id,
    pvp_copa_catalogo_anterior: l.pvp_copa_catalogo,
    pvp_copa_catalogo: calc.copa || null,
    coste,
  })
}

// ── 4. Desglose por restaurante ──────────────────────────────────────────
const porRest = {}
for (const a of actualizaciones) {
  porRest[a.restaurante_id] = (porRest[a.restaurante_id] || 0) + 1
}

console.log(`\nFilas candidatas (catalogo_vino_id set): ${lineas.length}`)
console.log(`  Con coste → se backfillean: ${actualizaciones.length}`)
console.log(`  Sin coste en catálogo (no se tocan): ${sinCoste.length}`)
console.log(`\nPor restaurante:`)
for (const [id, count] of Object.entries(porRest)) {
  console.log(`  ${id}  →  ${count} filas`)
}

// ── 5. Preview: muestra primeras 10 ─────────────────────────────────────
console.log(`\n── Preview (primeras 10) ────────────────────────────────────────────────`)
console.log(`${'Nombre'.padEnd(45)} ${'Coste'.padStart(7)} ${'Copa ant.'.padStart(10)} ${'Copa nueva'.padStart(11)}`)
for (const a of actualizaciones.slice(0, 10)) {
  const ant = a.pvp_copa_catalogo_anterior != null ? String(a.pvp_copa_catalogo_anterior) : '—'
  console.log(`${String(a.nombre).padEnd(45)} ${String(a.coste).padStart(7)} ${ant.padStart(10)} ${String(a.pvp_copa_catalogo).padStart(11)}`)
}
if (actualizaciones.length > 10) console.log(`... y ${actualizaciones.length - 10} más`)

if (!APPLY) {
  console.log(`\n→ Modo preview. Para ejecutar: npx tsx scripts/backfill-snapshots-botella.mjs --apply\n`)
  process.exit(0)
}

// ── 6. UPDATE: SOLO pvp_copa_catalogo ────────────────────────────────────
// pvp_recomendado_catalogo NO se toca: el precio de botella no cambió.
// precio_copa, ofrecido_por_copa y estado tampoco se modifican nunca.
console.log(`\nEjecutando backfill...`)
let ok = 0
let ko = 0

for (const a of actualizaciones) {
  const { error: updErr } = await supabase
    .from('carta_simulacion')
    .update({
      pvp_copa_catalogo: a.pvp_copa_catalogo,
    })
    .eq('id', a.id)
    .not('catalogo_vino_id', 'is', null)  // doble guardia: solo filas con vínculo de catálogo

  if (updErr) { console.error(`  ✗ ${a.nombre}: ${updErr.message}`); ko++ }
  else ok++
}

console.log(`\n✓ ${ok} filas actualizadas con snapshots de precio sugerido.`)
if (ko > 0) console.log(`✗ ${ko} errores — revisa los mensajes anteriores.`)
if (sinCoste.length > 0) console.log(`⚠ ${sinCoste.length} vinos sin coste en catálogo — no tocados.`)
