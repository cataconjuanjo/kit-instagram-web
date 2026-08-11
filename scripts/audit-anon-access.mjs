import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const TABLES = [
  'restaurantes',
  'vinos',
  'platos',
  'estadisticas',
  'movimientos_stock',
  'publication_snapshots',
  'publication_events',
  'consultor_propuestas',
  'seleccion_especial',
  'consultant_diagnostics',
  'opportunity_snapshots',
  'inventory_snapshots',
  'wine_list_snapshots',
  'btg_snapshots',
  'alerts',
  'recommendations',
  'weekly_executive_summaries',
  'weekly_summary_preferences',
  'rate_limits',
  'tiendas',
  'vinos_tienda',
  'kiosko_searches',
  'kiosko_mobile_intents',
  'stock_movements',
  'kiosko_assisted_orders',
  'kiosko_informes',
  'square_sync_log',
  'restaurante_links',
  'proveedores',
  'proveedor_catalogo_vinos',
  'pos_import_batches',
  'pos_sale_lines',
]

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    let value = match[2].trim()
    if (!key || process.env[key]) continue
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const leaks = []
const missing = []

for (const table of TABLES) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .limit(1)

  if (error) {
    const text = [error.code, error.message, error.details, error.hint]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (text.includes('does not exist') || text.includes('schema cache')) {
      missing.push(table)
      console.log(`SKIP ${table} not exposed or not present`)
    } else {
      console.log(`OK   ${table} blocked (${error.code || 'error'})`)
    }
    continue
  }

  if (Array.isArray(data) && data.length > 0) {
    leaks.push(table)
    console.log(`WARN ${table} returned public rows`)
  } else {
    console.log(`OK   ${table} returned no public rows`)
  }
}

if (missing.length) {
  console.log(`\nSkipped ${missing.length} table(s) not exposed/present in PostgREST.`)
}

if (leaks.length) {
  console.error(`\nAnon access audit failed. Public rows returned from: ${leaks.join(', ')}`)
  process.exit(1)
}

console.log('\nAnon access audit passed: no tested table returned public rows.')
