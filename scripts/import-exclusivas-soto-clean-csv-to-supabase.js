const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const CSV_FILES = [
  'output/catalogos/exclusivas_soto_mayo_2026_import_app.csv',
  'output/catalogos/exclusivas_soto_primeras_marcas_abril_2026_import_app.csv',
  'output/catalogos/exclusivas_soto_wine_merchant_mayo_2026_import_app.csv',
]

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

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function readCsv(file) {
  const workbook = XLSX.read(fs.readFileSync(file, 'utf8'), { type: 'string' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet).map(row => ({
    nombre: clean(row.nombre),
    bodega: clean(row.bodega),
    tipo: clean(row.tipo),
    region: clean(row.region),
    uva: clean(row.uva),
    anada: clean(row.anada),
    referencia: clean(row.referencia),
    formato: clean(row.formato),
    coste_estimado: Number(row.coste_estimado) || 0,
    pvp_recomendado: Number(row.pvp_recomendado) || 0,
    disponibilidad: clean(row.disponibilidad),
    notas: clean(row.notas || row.disponibilidad),
    activo: true,
    _source: path.basename(file),
  }))
}

async function main() {
  const env = { ...loadEnv(), ...process.env }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan credenciales de Supabase.')

  const allRows = CSV_FILES.flatMap(file => readCsv(file))
  const deduped = new Map()
  for (const row of allRows) {
    if (!row.nombre || !row.bodega || !row.referencia || !row.formato || !row.coste_estimado) continue
    const key = [row.referencia, row.nombre, row.formato, row.coste_estimado]
      .map(value => String(value).toLowerCase())
      .join('|')
    deduped.set(key, row)
  }
  const rows = Array.from(deduped.values())
  const now = new Date().toISOString()

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const providerName = 'Exclusivas Soto'
  const { data: provider, error: providerError } = await supabase
    .from('proveedores_vino')
    .select('id,nombre')
    .eq('nombre', providerName)
    .single()
  if (providerError) throw providerError

  const payload = rows.map(({ _source, ...row }) => ({
    ...row,
    proveedor_id: provider.id,
    notas: row.notas || `${row.disponibilidad} · ${_source}`,
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
    detectadas: allRows.length,
    insertadas: inserted,
    sinBodega: payload.filter(row => !row.bodega).length,
    sinRegion: payload.filter(row => !row.region).length,
    sinTipo: payload.filter(row => !row.tipo).length,
    sinPrecio: payload.filter(row => !row.coste_estimado).length,
    sinFormato: payload.filter(row => !row.formato).length,
    bodegas: new Set(payload.map(row => row.bodega)).size,
    porArchivo: CSV_FILES.map(file => [path.basename(file), readCsv(file).length]),
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
