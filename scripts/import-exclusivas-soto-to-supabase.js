const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { parseAll } = require('./reimport-exclusivas-soto')

function loadEnv() {
  const envPath = '.env.local'
  const env = {}
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return env
}

async function main() {
  const env = { ...loadEnv(), ...process.env }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan credenciales de Supabase.')

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const providerName = 'Exclusivas Soto'
  const { data: provider, error: providerError } = await supabase
    .from('proveedores_vino')
    .select('*')
    .eq('nombre', providerName)
    .single()
  if (providerError) throw providerError

  const { rows, byFile } = await parseAll()
  const rowsFiables = rows.filter(row => row.bodega && Number(row.coste_estimado) > 0)
  const descartadas = rows.length - rowsFiables.length
  const now = new Date().toISOString()
  const payload = rowsFiables.map(row => ({
    ...row,
    proveedor_id: provider.id,
    pvp_recomendado: 0,
    notas: row.disponibilidad,
    updated_at: now,
  }))

  const { count: deleted, error: deleteError } = await supabase
    .from('proveedor_catalogo_vinos')
    .delete({ count: 'exact' })
    .eq('proveedor_id', provider.id)
  if (deleteError) throw deleteError

  let inserted = 0
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500)
    const { error } = await supabase.from('proveedor_catalogo_vinos').insert(chunk)
    if (error) throw error
    inserted += chunk.length
  }

  console.log(JSON.stringify({
    proveedor: providerName,
    reemplazadas: deleted || 0,
    porArchivo: byFile,
    detectadas: rows.length,
    descartadasSinBodegaFiable: descartadas,
    insertadas: inserted,
    conPrecio: payload.filter(row => row.coste_estimado > 0).length,
    bodegas: new Set(payload.map(row => row.bodega).filter(Boolean)).size,
    sospechosas: payload.filter(row => /\d{4}\s*\d{2,4}|cl\d|u\/c\d/i.test(row.nombre)).slice(0, 10).map(row => row.nombre),
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
