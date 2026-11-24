#!/usr/bin/env node
// E1: contadores básicos de proveedor_catalogo_vinos.
// Imprime JSON con total, conCoste, sinCoste, activos, sinCosteActivos.
// Requiere SUPABASE_SERVICE_ROLE_KEY para leer sin RLS.
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL'); process.exit(1) }
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!svc) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

  const supabase = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } })

  const headCount = async (filtro) => {
    const { count, error } = await filtro.select('id', { count: 'exact', head: true })
    if (error) throw error
    return count || 0
  }

  const total = await headCount(supabase.from('proveedor_catalogo_vinos'))
  const conCoste = await headCount(supabase.from('proveedor_catalogo_vinos').gt('coste_estimado', 0))
  const sinCoste = await headCount(
    supabase.from('proveedor_catalogo_vinos').or('coste_estimado.is.null,coste_estimado.eq.0')
  )
  const activos = await headCount(supabase.from('proveedor_catalogo_vinos').eq('activo', true))
  const sinCosteActivos = await headCount(
    supabase.from('proveedor_catalogo_vinos').eq('activo', true).or('coste_estimado.is.null,coste_estimado.eq.0')
  )

  console.log(JSON.stringify({ total, conCoste, sinCoste, activos, sinCosteActivos }, null, 2))
}

main().catch((err) => { console.error(err); process.exit(1) })
