#!/usr/bin/env node
// E2: verifica que el rol anon no puede leer proveedor_catalogo_vinos.coste_estimado.
// Expectativa: 0 filas o permission denied. Si devuelve > 0 filas, hay un
// problema de RLS que hay que corregir antes de desplegar.
import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL'); process.exitCode = 1; return }

  // El código de la app usa NEXT_PUBLIC_SUPABASE_ANON_KEY (grep en app/).
  // Aceptamos también SUPABASE_ANON_KEY como fallback para scripts server-only.
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!anon) {
    console.error('Falta la clave anon de Supabase.')
    console.error('Añade a .env.local una de estas variables (la app usa la primera):')
    console.error('  NEXT_PUBLIC_SUPABASE_ANON_KEY=<valor>')
    console.error('  SUPABASE_ANON_KEY=<valor>   (alias aceptado por este script)')
    console.error('Dónde sacarla: Supabase → Project Settings → API → Project API keys → anon public.')
    process.exitCode = 1
    return
  }

  const supabase = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data, error } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('id, coste_estimado')
    .limit(1)

  const resultado = {
    filasVistas: Array.isArray(data) ? data.length : 0,
    muestra: Array.isArray(data) && data.length ? data[0] : null,
    error: error ? { code: error.code, message: error.message } : null,
  }
  console.log(JSON.stringify(resultado, null, 2))

  if (resultado.filasVistas > 0 && resultado.muestra && 'coste_estimado' in resultado.muestra && resultado.muestra.coste_estimado !== null) {
    console.error('\nALERTA: el rol anon pudo leer coste_estimado. Revisar RLS de proveedor_catalogo_vinos.')
    process.exitCode = 2
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
