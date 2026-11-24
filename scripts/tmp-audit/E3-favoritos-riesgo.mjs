#!/usr/bin/env node
// E3: cuenta favoritos agrupados por nombre de proveedor.
// Sirve para dimensionar el impacto de un reimport destructivo: cuántos
// favoritos quedarían huérfanos si no se re-mapean con cuidado.
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL'); process.exit(1) }
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svc) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

  const supabase = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } })

  // Leer todos los favoritos con su proveedor_id y luego cruzar con proveedores_vino.
  const { data: favs, error: favsErr } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('id, proveedor_id')
    .eq('favorito', true)
  if (favsErr) throw favsErr

  const porProveedorId = new Map()
  for (const f of (favs || [])) {
    const k = f.proveedor_id || 'sin_proveedor'
    porProveedorId.set(k, (porProveedorId.get(k) || 0) + 1)
  }

  const ids = [...porProveedorId.keys()].filter(k => k !== 'sin_proveedor')
  let nombrePorId = {}
  if (ids.length) {
    const { data: provs, error: provErr } = await supabase
      .from('proveedores_vino')
      .select('id, nombre')
      .in('id', ids)
    if (provErr) throw provErr
    nombrePorId = Object.fromEntries((provs || []).map(p => [p.id, p.nombre]))
  }

  const agregado = {}
  for (const [id, n] of porProveedorId) {
    const nombre = id === 'sin_proveedor' ? '(sin proveedor)' : (nombrePorId[id] || `id:${id}`)
    agregado[nombre] = (agregado[nombre] || 0) + n
  }

  const ordenado = Object.entries(agregado)
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, favoritos]) => ({ proveedor: nombre, favoritos }))

  console.log(JSON.stringify({
    totalFavoritos: (favs || []).length,
    porProveedor: ordenado,
  }, null, 2))
}

main().catch((err) => { console.error(err); process.exit(1) })
