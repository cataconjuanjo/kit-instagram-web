const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const env = {}
  if (!fs.existsSync('.env.local')) return env
  for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return env
}

async function main() {
  const env = { ...loadEnv(), ...process.env }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: provider, error: providerError } = await supabase
    .from('proveedores_vino')
    .select('id,nombre')
    .eq('nombre', 'Exclusivas Soto')
    .single()
  if (providerError) throw providerError

  const { count } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('*', { count: 'exact', head: true })
    .eq('proveedor_id', provider.id)

  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('proveedor_catalogo_vinos')
      .select('nombre,bodega,region,tipo,referencia,formato,coste_estimado,disponibilidad')
      .eq('proveedor_id', provider.id)
      .order('coste_estimado', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }

  const suspiciousProducer = /^(montsant|priorat|rioja|ribera|bourgogne|port|txacoli|champagne|sancerre)$/i
  const suspiciousName = /\d{4}\s*75\s*cl|cl\s*Syrah|u\/c\d|cl\d/i
  const knownRefs = new Set(['703199', '11SCHT31904', '7004', '74009', '4003'])
  const topBodegas = [...rows.reduce((map, row) => {
    map.set(row.bodega || '(sin bodega)', (map.get(row.bodega || '(sin bodega)') || 0) + 1)
    return map
  }, new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)

  console.log(JSON.stringify({
    total: count,
    cargadas: rows.length,
    sinBodega: rows.filter(row => !row.bodega).length,
    sinPrecio: rows.filter(row => !Number(row.coste_estimado)).length,
    bodegaSospechosa: rows.filter(row => suspiciousProducer.test(row.bodega || '')).slice(0, 10),
    nombreSospechoso: rows.filter(row => suspiciousName.test(row.nombre || '')).slice(0, 10),
    muestrasConocidas: rows.filter(row => knownRefs.has(String(row.referencia))),
    masBaratos: rows.slice(0, 10),
    topBodegas,
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
