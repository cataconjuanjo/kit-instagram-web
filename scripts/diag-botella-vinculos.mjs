/**
 * Diagnóstico: estado actual de los 44 vinos 'Nuevo' con precio_botella = null
 * ¿Tienen catalogo_vino_id? ¿Tienen pvp_recomendado_catalogo?
 * Si tienen catalogo_vino_id pero no snapshot, ¿existe la entrada en el catálogo?
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

const { data: lineas, error } = await supabase
  .from('carta_simulacion')
  .select('id, nombre, bodega, catalogo_vino_id, precio_botella, pvp_recomendado_catalogo, pvp_copa_catalogo, coste_compra')
  .eq('estado', 'nuevo')
  .is('precio_botella', null)

if (error) { console.error(error.message); process.exit(1) }

console.log(`\nVinos 'Nuevo' con precio_botella = null: ${lineas.length}`)

const conId    = lineas.filter(l => l.catalogo_vino_id)
const sinId    = lineas.filter(l => !l.catalogo_vino_id)
const conSnap  = conId.filter(l => l.pvp_recomendado_catalogo)
const sinSnap  = conId.filter(l => !l.pvp_recomendado_catalogo)

console.log(`  Con catalogo_vino_id      : ${conId.length}`)
console.log(`    → con pvp_recomendado_catalogo  : ${conSnap.length}`)
console.log(`    → sin pvp_recomendado_catalogo  : ${sinSnap.length}  ← snapshot vacío`)
console.log(`  Sin catalogo_vino_id      : ${sinId.length}`)

if (sinSnap.length > 0) {
  // Comprueba si las entradas del catálogo siguen existiendo
  const ids = sinSnap.map(l => l.catalogo_vino_id)
  const { data: cats } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('id, coste_estimado, pvp_recomendado, activo')
    .in('id', ids)
  const catMap = Object.fromEntries((cats || []).map(r => [r.id, r]))

  console.log(`\n--- Vinos con catalogo_vino_id pero sin snapshot (primeros 10) ---`)
  for (const l of sinSnap.slice(0, 10)) {
    const cat = catMap[l.catalogo_vino_id]
    const catInfo = cat
      ? `coste=${cat.coste_estimado} pvp=${cat.pvp_recomendado} activo=${cat.activo}`
      : 'NO EXISTE EN CATÁLOGO'
    console.log(`  ${String(l.nombre).padEnd(45)} catalogo_id=${l.catalogo_vino_id?.slice(0,8)}… ${catInfo}`)
  }
  if (sinSnap.length > 10) console.log(`  ... y ${sinSnap.length - 10} más`)
}

if (sinId.length > 0) {
  console.log(`\n--- Vinos SIN catalogo_vino_id ---`)
  for (const l of sinId) {
    console.log(`  ${String(l.nombre).padEnd(45)} coste_compra=${l.coste_compra ?? 'null'}`)
  }
}
