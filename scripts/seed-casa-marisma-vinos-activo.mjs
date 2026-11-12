/**
 * Normaliza vinos.activo = true donde esté NULL para los vinos de Casa
 * Marisma. Opcional: el fix de app/dashboard/precios-somm/page.js ya
 * acepta activo IS NULL en el filtro de carga, así que este seed solo
 * hace falta si prefieres alinear la columna con el resto de restaurantes
 * (que la tienen explícita a true).
 *
 * NO toca coste_compra, precio_botella, precio_copa, stock ni ningún
 * otro campo. Solo activo: NULL → true.
 *
 * Idempotente, dry-run por defecto, blindado al UUID + nombre.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-casa-marisma-vinos-activo.mjs           # dry-run
 *   node --env-file=.env.local scripts/seed-casa-marisma-vinos-activo.mjs --apply   # escribe
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
  console.error('Lanza con: node --env-file=.env.local scripts/seed-casa-marisma-vinos-activo.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

console.log(`\n[seed vinos.activo Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)

const { data: nulos, error } = await supa
  .from('vinos')
  .select('id, nombre')
  .eq('restaurante_id', TARGET_ID)
  .is('activo', null)
  .order('nombre', { ascending: true })
if (error) { console.error('ERROR leyendo:', error.message); process.exit(1) }

console.log(`\n  vinos con activo = NULL: ${nulos?.length || 0}`)
if (!nulos || nulos.length === 0) {
  console.log('  nada que hacer.')
  process.exit(0)
}
for (const v of nulos.slice(0, 10)) console.log(`    · ${v.nombre}`)
if (nulos.length > 10) console.log(`    ... y ${nulos.length - 10} más`)

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// Apply con guard: scope por restaurante_id y solo donde activo IS NULL.
const { error: errUpd, data: updated } = await supa
  .from('vinos')
  .update({ activo: true })
  .eq('restaurante_id', TARGET_ID)
  .is('activo', null)
  .select('id')
if (errUpd) { console.error('ERROR update:', errUpd.message); process.exit(1) }
console.log(`\n  ✓ actualizados: ${updated?.length || 0}`)

// Verificación.
const { count: restantes } = await supa
  .from('vinos')
  .select('*', { count: 'exact', head: true })
  .eq('restaurante_id', TARGET_ID)
  .is('activo', null)
console.log(`  verificación: quedan ${restantes || 0} con activo NULL.`)
