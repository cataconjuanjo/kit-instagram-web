/**
 * Diagnóstico: vinos en borrador (estado='nuevo') con precio_botella relleno.
 *
 * Para cada uno reconstruye el precio sugerido original usando la misma fórmula
 * que usaba el código antiguo (calcularPreciosSugeridos con defaults):
 *   costeNeto  = coste_estimado  (costeIncluyeIva=false → sin descuento IVA)
 *   pvpNeto    = coste ≤ 6  → coste × 3.5
 *               coste ≤ 11 → coste × 2 + 9
 *               coste > 11 → coste + 20
 *   botella    = Math.round(pvpNeto × 1.10)   (pvpIncluyeIva=true, IVA 10%)
 *
 * Clasifica:
 *   COINCIDE:  precio_botella == botella_sugerida  → candidato a resetear a null
 *   DISTINTO:  precio_botella != botella_sugerida  → NO tocar (editado a mano)
 *   SIN_COSTE: coste_estimado = 0 o null           → NO tocar (sin referencia)
 *
 * No escribe nada.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ── Fórmula inline (misma lógica que calcularPreciosSugeridos con defaults) ──
function botellaOriginal(coste_estimado) {
  const c = Number(coste_estimado) || 0
  if (!c) return null
  const pvpNeto = c <= 6 ? c * 3.5 : c <= 11 ? c * 2 + 9 : c + 20
  return Math.round(pvpNeto * 1.10)   // pvpIncluyeIva=true, IVA 10%
}

// ── Carga los vinos "Nuevo" con precio_botella relleno ────────────────────
const { data: lineas, error } = await supabase
  .from('carta_simulacion')
  .select('id, nombre, precio_botella, catalogo_vino_id')
  .eq('estado', 'nuevo')
  .not('precio_botella', 'is', null)

if (error) { console.error('Error carta_simulacion:', error.message); process.exit(1) }

// ── Carga coste_estimado del catálogo para cada vino ─────────────────────
const catalogoIds = [...new Set(lineas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id))]
const { data: catalogoRows, error: catError } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('id, coste_estimado')
  .in('id', catalogoIds)

if (catError) { console.error('Error proveedor_catalogo_vinos:', catError.message); process.exit(1) }

const costes = Object.fromEntries((catalogoRows || []).map(r => [r.id, r.coste_estimado]))

// ── Clasificar ───────────────────────────────────────────────────────────
const coinciden = []
const distintos = []
const sinCoste  = []

for (const l of lineas) {
  const coste = costes[l.catalogo_vino_id]
  const sug   = botellaOriginal(coste)
  if (sug === null) {
    sinCoste.push({ ...l, coste })
  } else if (Number(l.precio_botella) === sug) {
    coinciden.push({ ...l, coste, sug })
  } else {
    distintos.push({ ...l, coste, sug })
  }
}

console.log(`\nTotal "Nuevo" con precio_botella relleno: ${lineas.length}`)
console.log(`  COINCIDE con sugerido original  : ${coinciden.length}  ← se resetearían a null`)
console.log(`  DISTINTO  (editado a mano)      : ${distintos.length}  ← NO se tocarían`)
console.log(`  Sin coste en catálogo           : ${sinCoste.length}   ← NO se tocarían`)

if (distintos.length > 0) {
  console.log('\n--- Vinos con precio editado a mano (NO se tocan) ---')
  for (const r of distintos) {
    console.log(`  ${String(r.nombre).padEnd(45)} actual=${r.precio_botella}  sug=${r.sug}  coste=${r.coste}`)
  }
}

if (sinCoste.length > 0) {
  console.log('\n--- Vinos sin coste en catálogo (NO se tocan) ---')
  for (const r of sinCoste) {
    console.log(`  ${String(r.nombre).padEnd(45)} actual=${r.precio_botella}  coste=${r.coste ?? 'null'}`)
  }
}

if (coinciden.length > 0) {
  console.log(`\n--- ${coinciden.length} vinos que se resetearían a null (precio == sugerido original) ---`)
  for (const r of coinciden) {
    console.log(`  ${String(r.nombre).padEnd(45)} precio=${r.precio_botella}  sug=${r.sug}  coste=${r.coste}`)
  }
}

console.log(`\n→ Si confirmas, ejecuta: node scripts/reset-botella-pendiente.mjs\n`)
