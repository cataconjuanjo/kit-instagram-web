/**
 * Backfill de pvp_recomendado_catalogo y pvp_copa_catalogo para filas de carta_simulacion
 * que tienen catalogo_vino_id pero no tienen esos snapshots (columnas añadidas por migración
 * sin poblar las filas existentes).
 *
 * Garantías:
 *   - Importa calcularPreciosSugeridos y copasVendiblesEscalonado desde pricingUtils.js
 *     (misma fuente que anadir-catalogo/route.js) — sin fórmula duplicada.
 *   - UPDATE acotado a WHERE catalogo_vino_id IS NOT NULL AND pvp_recomendado_catalogo IS NULL,
 *     idempotente: reruns no pisan snapshots ya rellenos.
 *   - Solo escribe pvp_recomendado_catalogo y pvp_copa_catalogo. Nunca toca precio_botella,
 *     precio_copa, ofrecido_por_copa ni estado.
 *   - Sin flag --apply: modo preview (muestra qué cambiaría). Con --apply: ejecuta el UPDATE.
 *
 * Uso:
 *   npx tsx scripts/backfill-snapshots-botella.mjs           ← preview
 *   npx tsx scripts/backfill-snapshots-botella.mjs --apply   ← ejecutar
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { calcularPreciosSugeridos, copasVendiblesEscalonado } from '../app/lib/pricingUtils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')

// ── 1. Carga filas candidatas (todas, todos los restaurantes) ────────────
const { data: lineas, error } = await supabase
  .from('carta_simulacion')
  .select('id, nombre, bodega, restaurante_id, catalogo_vino_id, pvp_recomendado_catalogo')
  .not('catalogo_vino_id', 'is', null)
  .is('pvp_recomendado_catalogo', null)

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

// ── 3. Calcular snapshots usando la función compartida ───────────────────
function pvpCopaDesdeBottella(pvpBotella) {
  if (!pvpBotella || pvpBotella <= 0) return null
  const divisor = copasVendiblesEscalonado(pvpBotella)
  return Math.round((pvpBotella / divisor) * 2) / 2
}

const actualizaciones = []
const sinCoste = []

for (const l of lineas) {
  const coste = Number(costes[l.catalogo_vino_id]) || 0
  if (!coste) { sinCoste.push(l); continue }
  const calc = calcularPreciosSugeridos(coste, {})
  actualizaciones.push({
    id: l.id,
    nombre: l.nombre,
    restaurante_id: l.restaurante_id,
    pvp_recomendado_catalogo: calc.botella || null,
    pvp_copa_catalogo: pvpCopaDesdeBottella(calc.botella),
    coste,
  })
}

// ── 4. Desglose por restaurante ──────────────────────────────────────────
const porRest = {}
for (const a of actualizaciones) {
  porRest[a.restaurante_id] = (porRest[a.restaurante_id] || 0) + 1
}

console.log(`\nFilas candidatas (catalogo_vino_id set, pvp_recomendado_catalogo null): ${lineas.length}`)
console.log(`  Con coste → se backfillean: ${actualizaciones.length}`)
console.log(`  Sin coste en catálogo (no se tocan): ${sinCoste.length}`)
console.log(`\nPor restaurante:`)
for (const [id, count] of Object.entries(porRest)) {
  console.log(`  ${id}  →  ${count} filas`)
}

// ── 5. Preview: muestra primeras 10 ─────────────────────────────────────
console.log(`\n── Preview (primeras 10) ────────────────────────────────────────────────`)
console.log(`${'Nombre'.padEnd(45)} ${'Coste'.padStart(7)} ${'Bot.sug'.padStart(8)} ${'Copa.sug'.padStart(9)}`)
for (const a of actualizaciones.slice(0, 10)) {
  console.log(`${String(a.nombre).padEnd(45)} ${String(a.coste).padStart(7)} ${String(a.pvp_recomendado_catalogo).padStart(8)} ${String(a.pvp_copa_catalogo).padStart(9)}`)
}
if (actualizaciones.length > 10) console.log(`... y ${actualizaciones.length - 10} más`)

if (!APPLY) {
  console.log(`\n→ Modo preview. Para ejecutar: npx tsx scripts/backfill-snapshots-botella.mjs --apply\n`)
  process.exit(0)
}

// ── 6. UPDATE: solo pvp_recomendado_catalogo y pvp_copa_catalogo ─────────
console.log(`\nEjecutando backfill...`)
let ok = 0
let ko = 0

for (const a of actualizaciones) {
  const { error: updErr } = await supabase
    .from('carta_simulacion')
    .update({
      pvp_recomendado_catalogo: a.pvp_recomendado_catalogo,
      pvp_copa_catalogo: a.pvp_copa_catalogo,
    })
    .eq('id', a.id)
    .is('pvp_recomendado_catalogo', null)  // doble guardia idempotente

  if (updErr) { console.error(`  ✗ ${a.nombre}: ${updErr.message}`); ko++ }
  else ok++
}

console.log(`\n✓ ${ok} filas actualizadas con snapshots de precio sugerido.`)
if (ko > 0) console.log(`✗ ${ko} errores — revisa los mensajes anteriores.`)
if (sinCoste.length > 0) console.log(`⚠ ${sinCoste.length} vinos sin coste en catálogo — no tocados.`)
