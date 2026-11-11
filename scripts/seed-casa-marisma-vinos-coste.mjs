/**
 * Seed PROPUESTO de coste_compra para los vinos activos de Casa Marisma demo.
 *
 * El panel Previsualización de Motor de Precios lee vino.coste_compra; sin él
 * no calcula PVP propuesto ni margen y muestra "los vinos no tienen coste
 * cargado". Este script rellena coste_compra SOLO donde falte, calculándolo
 * para un margen sobre venta medio del 64 %:
 *
 *   margen = 1 - coste / pvp_neto
 *   coste  = pvp_neto × (1 - 0.64) = pvp_neto × 0.36
 *   pvp_neto = precio_botella / 1.10   (IVA vino 10 %)
 *
 * No toca vinos con coste_compra ya > 0.
 * No toca vinos de otros restaurantes.
 *
 * Idempotente, dry-run por defecto, blindado al UUID de Casa Marisma.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-casa-marisma-vinos-coste.mjs           # dry-run
 *   node --env-file=.env.local scripts/seed-casa-marisma-vinos-coste.mjs --apply   # escribe
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
  console.error('Lanza con: node --env-file=.env.local scripts/seed-casa-marisma-vinos-coste.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: restaurante destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

const MARGEN_OBJ = 0.64
const IVA_VINO   = 1.10

const { data: vinos, error: errV } = await supa
  .from('vinos')
  .select('id, nombre, precio_botella, coste_compra, activo')
  .eq('restaurante_id', TARGET_ID)
  .eq('activo', true)
if (errV) { console.error('ERROR leyendo vinos:', errV.message); process.exit(1) }

const r2 = n => Math.round(Number(n) * 100) / 100

const total = vinos?.length || 0
const sinPvp = (vinos || []).filter(v => !Number(v.precio_botella))
const yaConCoste = (vinos || []).filter(v => Number(v.coste_compra) > 0)
const aActualizar = (vinos || []).filter(v =>
  Number(v.precio_botella) > 0 && !(Number(v.coste_compra) > 0)
)

const updates = aActualizar.map(v => {
  const pvpBruto = Number(v.precio_botella)
  const pvpNeto  = pvpBruto / IVA_VINO
  const coste    = r2(pvpNeto * (1 - MARGEN_OBJ))
  return { id: v.id, nombre: v.nombre, precio_botella: pvpBruto, coste_compra: coste }
})

console.log(`\n[seed Vinos Coste Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`\nResumen:`)
console.log(`  vinos activos totales:                ${total}`)
console.log(`  ya con coste_compra > 0 (no se tocan): ${yaConCoste.length}`)
console.log(`  sin precio_botella  (no se pueden derivar coste): ${sinPvp.length}`)
console.log(`  pendientes de actualizar:             ${updates.length}`)
console.log(`\nMargen objetivo: ${(MARGEN_OBJ * 100).toFixed(0)} % sobre venta neta (pvp/${IVA_VINO.toFixed(2)})`)

if (updates.length > 0) {
  console.log(`\nEjemplos de ajuste (primeros 10):`)
  console.log(`  ${'Nombre'.padEnd(42)} ${'PVP €'.padStart(8)} ${'PVP neto €'.padStart(11)} ${'coste €'.padStart(9)}`)
  for (const u of updates.slice(0, 10)) {
    const name = String(u.nombre || '').slice(0, 42).padEnd(42)
    console.log(`  ${name} ${u.precio_botella.toFixed(2).padStart(8)} ${(u.precio_botella / IVA_VINO).toFixed(2).padStart(11)} ${u.coste_compra.toFixed(2).padStart(9)}`)
  }
}

if (!APPLY) {
  console.log(`\nDry-run: no se escribe nada. Añade --apply para ejecutar.`)
  process.exit(0)
}

// ── Aplica: UPDATE scoped (R2: WHERE id = ? AND restaurante_id = TARGET) ────
let ok = 0
for (const u of updates) {
  const { error } = await supa
    .from('vinos')
    .update({ coste_compra: u.coste_compra })
    .eq('id', u.id)
    .eq('restaurante_id', TARGET_ID)   // doble filtro de seguridad
  if (error) { console.warn(`(aviso) ${u.nombre}: ${error.message}`); continue }
  ok += 1
}
console.log(`\n✓ vinos actualizados: ${ok}/${updates.length}`)
