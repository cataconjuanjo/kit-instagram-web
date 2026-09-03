/**
 * Resetea precio_botella → null en todos los vinos "Nuevo" cuyo
 * precio_botella coincide exactamente con el sugerido original.
 * Ejecutar solo DESPUÉS de confirmar los resultados de audit-botella-pendiente.mjs
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

function botellaOriginal(coste_estimado) {
  const c = Number(coste_estimado) || 0
  if (!c) return null
  const pvpNeto = c <= 6 ? c * 3.5 : c <= 11 ? c * 2 + 9 : c + 20
  return Math.round(pvpNeto * 1.10)
}

const { data: lineas, error } = await supabase
  .from('carta_simulacion')
  .select('id, nombre, precio_botella, catalogo_vino_id')
  .eq('estado', 'nuevo')
  .not('precio_botella', 'is', null)

if (error) { console.error('Error carta_simulacion:', error.message); process.exit(1) }

const catalogoIds = [...new Set(lineas.filter(l => l.catalogo_vino_id).map(l => l.catalogo_vino_id))]
const { data: catalogoRows, error: catError } = await supabase
  .from('proveedor_catalogo_vinos')
  .select('id, coste_estimado')
  .in('id', catalogoIds)

if (catError) { console.error('Error proveedor_catalogo_vinos:', catError.message); process.exit(1) }

const costes = Object.fromEntries((catalogoRows || []).map(r => [r.id, r.coste_estimado]))

const idsAReset = lineas
  .filter(l => {
    const sug = botellaOriginal(costes[l.catalogo_vino_id])
    return sug !== null && Number(l.precio_botella) === sug
  })
  .map(l => l.id)

if (idsAReset.length === 0) {
  console.log('No hay vinos que resetear.')
  process.exit(0)
}

console.log(`Reseteando ${idsAReset.length} vinos a precio_botella = null...`)

const { error: updateError } = await supabase
  .from('carta_simulacion')
  .update({ precio_botella: null })
  .in('id', idsAReset)

if (updateError) {
  console.error('Error al resetear:', updateError.message)
  process.exit(1)
}

console.log(`✓ ${idsAReset.length} vinos reseteados correctamente.`)
