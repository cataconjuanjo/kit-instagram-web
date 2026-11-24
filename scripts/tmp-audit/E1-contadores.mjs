#!/usr/bin/env node
// E1: contadores básicos de proveedor_catalogo_vinos.
// Imprime JSON con total, conCoste, sinCoste, activos, sinCosteActivos.
// Requiere SUPABASE_SERVICE_ROLE_KEY para leer sin RLS.
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL'); process.exitCode = 1; return }
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svc) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY'); process.exitCode = 1; return }

  const supabase = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } })

  // En supabase-js, los filtros (.gt/.eq/.or) viven en el FilterBuilder,
  // que sólo se obtiene DESPUÉS de .select(). Por eso select() va primero.
  const headCount = async (applyFilters) => {
    let query = supabase.from('proveedor_catalogo_vinos').select('id', { count: 'exact', head: true })
    if (applyFilters) query = applyFilters(query)
    const { count, error } = await query
    if (error) throw error
    return count || 0
  }

  const total = await headCount()
  const conCoste = await headCount((q) => q.gt('coste_estimado', 0))
  const sinCoste = await headCount((q) => q.or('coste_estimado.is.null,coste_estimado.eq.0'))
  const activos = await headCount((q) => q.eq('activo', true))
  const sinCosteActivos = await headCount((q) =>
    q.eq('activo', true).or('coste_estimado.is.null,coste_estimado.eq.0')
  )

  console.log(JSON.stringify({ total, conCoste, sinCoste, activos, sinCosteActivos }, null, 2))
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
