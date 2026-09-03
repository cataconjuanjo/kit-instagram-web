/**
 * Resetea precio_copa → null en vinos 'Nuevo' que aún no han pasado
 * por el flujo de decisión de copa (ofrecido_por_copa IS NULL).
 * No toca vinos con ofrecido_por_copa = true o false (ya decididos).
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')

const { data: lineas, error } = await supabase
  .from('carta_simulacion')
  .select('id, nombre, precio_copa, pvp_copa_catalogo, ofrecido_por_copa')
  .eq('estado', 'nuevo')
  .is('ofrecido_por_copa', null)
  .not('precio_copa', 'is', null)

if (error) { console.error(error.message); process.exit(1) }

console.log(`\nVinos 'Nuevo' con precio_copa relleno y ofrecido_por_copa = null: ${lineas.length}`)
for (const l of lineas) {
  console.log(`  ${String(l.nombre).padEnd(45)} precio_copa=${l.precio_copa}  copa_sug=${l.pvp_copa_catalogo ?? '—'}`)
}

if (!APPLY) {
  console.log(`\n→ Modo preview. Para ejecutar: node scripts/reset-copa-pendiente.mjs --apply\n`)
  process.exit(0)
}

const ids = lineas.map(l => l.id)
const { error: updErr } = await supabase
  .from('carta_simulacion')
  .update({ precio_copa: null })
  .in('id', ids)
  .is('ofrecido_por_copa', null)  // guardia idempotente

if (updErr) { console.error('Error al resetear:', updErr.message); process.exit(1) }
console.log(`\n✓ ${lineas.length} vinos reseteados a precio_copa = null.\n`)
