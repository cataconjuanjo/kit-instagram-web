const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const args = process.argv.slice(2)
const onlyIndex = args.indexOf('--only')
const flagValueIndexes = new Set(onlyIndex >= 0 ? [onlyIndex + 1] : [])
const outputDir = args.find((arg, index) => !arg.startsWith('--') && !flagValueIndexes.has(index)) || path.join('output', 'catalogos')
const replace = args.includes('--replace')
const dryRun = args.includes('--dry-run')
const only = onlyIndex >= 0 ? texto(args[onlyIndex + 1]).toLowerCase() : ''

const CATALOGS = [
  {
    providerName: 'Sommeliervinos',
    file: 'listado_vinos_import_app.xlsx',
    catalogName: 'LISTADO VINOS',
    notes: 'Catalogo importado desde LISTADO VINOS.pdf',
  },
  {
    providerName: 'Vins Alemanys',
    file: 'vins_alemanys_import_app.xlsx',
    catalogName: 'Vins Alemanys 2026-06',
    notes: 'Catalogo importado desde 2026_06_TARIFA_VA.pdf',
  },
  {
    providerName: "Must of Wines / L'Excellence",
    file: 'lexcellence_import_app.xlsx',
    catalogName: "L'Excellence Mayo 2026 Peninsula",
    notes: "Catalogo importado desde CATALOGO L'EXCELLENCE MAYO 2026 - PENINSULA.pdf",
  },
  {
    providerName: 'Bodegas Mar Malaga',
    file: 'bodegas_mar_malaga_import_app.xlsx',
    catalogName: 'Bodegas Mar Malaga 2026-06-23',
    notes: 'Catalogo importado desde Catalogo_Bodegas_Mar_Malaga_2026-06-23.pdf',
  },
]

const APP_COLUMNS = [
  'nombre',
  'bodega',
  'tipo',
  'region',
  'uva',
  'anada',
  'referencia',
  'formato',
  'coste_estimado',
  'pvp_recomendado',
  'disponibilidad',
  'notas',
]

function loadEnv() {
  const env = {}
  for (const envPath of ['.env.local', '.env.vercel']) {
    if (!fs.existsSync(envPath)) continue
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return { ...env, ...process.env }
}

function dinero(valor) {
  if (valor === '' || valor === null || valor === undefined) return 0
  if (typeof valor === 'number') return Number.isFinite(valor) ? Number(valor.toFixed(2)) : 0
  const limpio = String(valor)
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '')
  if (!limpio) return 0
  const decimal = limpio.includes(',') && limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio.replace(/,/g, '')
  const numero = Number(decimal)
  return Number.isFinite(numero) ? Number(numero.toFixed(2)) : 0
}

function texto(valor) {
  return String(valor || '').replace(/\s+/g, ' ').trim()
}

function readRows(filePath) {
  const workbook = XLSX.readFile(filePath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
}

function payloadRows(rows, providerId, catalogName) {
  const now = new Date().toISOString()
  return rows
    .map(row => {
      const normalized = Object.fromEntries(APP_COLUMNS.map(column => [column, row[column] ?? '']))
      const notas = [
        texto(normalized.notas),
        `catalogo cargado: ${catalogName}`,
      ].filter(Boolean).join(' | ')

      return {
        proveedor_id: providerId,
        nombre: texto(normalized.nombre),
        bodega: texto(normalized.bodega) || null,
        tipo: texto(normalized.tipo) || null,
        region: texto(normalized.region) || null,
        uva: texto(normalized.uva) || null,
        anada: texto(normalized.anada) || null,
        referencia: texto(normalized.referencia) || null,
        formato: texto(normalized.formato) || null,
        coste_estimado: dinero(normalized.coste_estimado),
        pvp_recomendado: dinero(normalized.pvp_recomendado),
        disponibilidad: texto(normalized.disponibilidad) || null,
        notas: notas || null,
        activo: true,
        updated_at: now,
      }
    })
    .filter(row => row.nombre)
}

async function ensureProvider(supabase, catalog) {
  const { data: existing, error: selectError } = await supabase
    .from('proveedores_vino')
    .select('*')
    .eq('nombre', catalog.providerName)
    .order('created_at', { ascending: true })

  if (selectError) throw selectError
  if (existing?.length) {
    return {
      provider: existing[0],
      created: false,
      duplicateProviders: existing.length - 1,
    }
  }

  if (dryRun) {
    return {
      provider: { id: `dry-run:${catalog.providerName}`, nombre: catalog.providerName },
      created: true,
      duplicateProviders: 0,
    }
  }

  const { data: provider, error: insertError } = await supabase
    .from('proveedores_vino')
    .insert([{
      nombre: catalog.providerName,
      notas: catalog.notes,
      visible_restaurantes: false,
      updated_at: new Date().toISOString(),
    }])
    .select('*')
    .single()

  if (insertError) throw insertError
  return { provider, created: true, duplicateProviders: 0 }
}

async function existingCount(supabase, providerId) {
  if (String(providerId).startsWith('dry-run:')) return 0
  const { count, error } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('id', { count: 'exact', head: true })
    .eq('proveedor_id', providerId)
  if (error) throw error
  return count || 0
}

async function insertChunks(supabase, payload) {
  let inserted = 0
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500)
    const { error } = await supabase.from('proveedor_catalogo_vinos').insert(chunk)
    if (error) throw error
    inserted += chunk.length
  }
  return inserted
}

async function main() {
  const env = loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results = []
  const selectedCatalogs = only
    ? CATALOGS.filter(catalog => [catalog.providerName, catalog.catalogName, catalog.file]
      .some(value => texto(value).toLowerCase().includes(only)))
    : CATALOGS

  if (only && !selectedCatalogs.length) {
    throw new Error(`No hay catalogos que coincidan con --only "${only}".`)
  }

  for (const catalog of selectedCatalogs) {
    const filePath = path.resolve(outputDir, catalog.file)
    if (!fs.existsSync(filePath)) throw new Error(`No existe ${filePath}`)

    const sourceRows = readRows(filePath)
    const { provider, created, duplicateProviders } = await ensureProvider(supabase, catalog)
    const before = await existingCount(supabase, provider.id)
    const payload = payloadRows(sourceRows, provider.id, catalog.catalogName)
    const withoutPrice = payload.filter(row => !row.coste_estimado).length

    let deleted = 0
    let inserted = 0

    if (!dryRun) {
      if (replace) {
        const { count, error } = await supabase
          .from('proveedor_catalogo_vinos')
          .delete({ count: 'exact' })
          .eq('proveedor_id', provider.id)
        if (error) throw error
        deleted = count || 0
      }

      inserted = await insertChunks(supabase, payload)
    }

    const after = dryRun ? before : await existingCount(supabase, provider.id)

    results.push({
      proveedor: catalog.providerName,
      proveedor_creado: created,
      proveedores_duplicados_mismo_nombre: duplicateProviders,
      archivo: catalog.file,
      filas_excel: sourceRows.length,
      filas_validas: payload.length,
      filas_sin_precio: withoutPrice,
      catalogo_anterior: before,
      reemplazadas: deleted,
      insertadas: inserted,
      catalogo_final: after,
    })
  }

  console.log(JSON.stringify({
    dryRun,
    replace,
    only: only || null,
    total_insertadas: results.reduce((sum, row) => sum + row.insertadas, 0),
    total_validas: results.reduce((sum, row) => sum + row.filas_validas, 0),
    results,
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
