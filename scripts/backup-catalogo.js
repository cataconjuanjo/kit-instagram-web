#!/usr/bin/env node
/**
 * backup-catalogo.js
 *
 * Copia de seguridad del catálogo de Carta Viva.
 * SOLO SELECT — no contiene ninguna llamada a .insert/.update/.delete/.upsert/.rpc.
 * El service-role se usa únicamente para bypasear RLS en lectura.
 *
 * Uso:
 *   node --env-file=.env.local scripts/backup-catalogo.js
 *   node --env-file=.env.local scripts/backup-catalogo.js --output ./mi-ruta
 *
 * Salida:  backups/YYYY-MM-DD/  (idempotente: sobrescribe si ya existe)
 *   proveedores_vino.{json,csv}          — ~14 distribuidores
 *   proveedor_catalogo_vinos.{json,csv}  — ~9.098 referencias de catálogo
 *   favoritos.{json,csv}                 — subconjunto con favorito=true (~386)
 *   restaurantes.{json,csv}              — todos los restaurantes del sistema
 *   vinos_<slug>.{json,csv}             — carta/bodega por restaurante
 *   carta_simulacion_<slug>.{json,csv}  — borrador simulador por restaurante
 */

'use strict'

const fs   = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// ── Env ───────────────────────────────────────────────────────────────────────
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()
    if (!key || process.env[key]) continue
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

// ── Paginación ─────────────────────────────────────────────────────────────────
// queryFactory: () => PostgrestBuilder  (función que construye la query base)
// Llamar al factory en cada iteración garantiza un builder limpio por página.
async function fetchAll(queryFactory) {
  const PAGE = 1000
  let offset = 0
  const all  = []
  for (;;) {
    const { data, error } = await queryFactory().range(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

// ── CSV (sin dependencias externas) ───────────────────────────────────────────
function toCSV(rows) {
  if (!rows.length) return ''
  const keys   = Object.keys(rows[0])
  const escape = v => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  return [keys.join(','), ...rows.map(r => keys.map(k => escape(r[k])).join(','))].join('\n')
}

function save(outDir, name, rows) {
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(rows, null, 2), 'utf8')
  fs.writeFileSync(path.join(outDir, `${name}.csv`),  toCSV(rows), 'utf8')
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  loadEnvFile(path.join(process.cwd(), '.env.local'))
  loadEnvFile(path.join(process.cwd(), '.env'))

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no encontrados.')
    process.exit(1)
  }

  // Directorio de salida — idempotente: mismo día sobrescribe
  const today   = new Date().toISOString().slice(0, 10)
  const outArg  = process.argv.find((_, i) => process.argv[i - 1] === '--output')
  const outDir  = path.resolve(outArg ?? path.join(process.cwd(), 'backups', today))
  fs.mkdirSync(outDir, { recursive: true })
  console.log(`Carpeta de salida: ${outDir}\n`)

  // Cliente read-only en intención (service role para saltarse RLS en SELECT)
  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const counts = {}

  // 1. proveedores_vino — distribuidores (~14)
  process.stdout.write('→ proveedores_vino ... ')
  const proveedores = await fetchAll(() =>
    sb.from('proveedores_vino').select('*').order('nombre')
  )
  save(outDir, 'proveedores_vino', proveedores)
  counts['proveedores_vino'] = proveedores.length
  console.log(proveedores.length)

  // 2. proveedor_catalogo_vinos — todas las referencias (~9.098)
  process.stdout.write('→ proveedor_catalogo_vinos (completa) ... ')
  const catalogo = await fetchAll(() =>
    sb.from('proveedor_catalogo_vinos').select('*').order('proveedor_id').order('nombre')
  )
  save(outDir, 'proveedor_catalogo_vinos', catalogo)
  counts['proveedor_catalogo_vinos'] = catalogo.length
  console.log(catalogo.length)

  // 3. Favoritos — subconjunto con favorito=true (derivado, sin query extra)
  process.stdout.write('→ favoritos (favorito=true) ... ')
  const favoritos = catalogo.filter(r => r.favorito === true)
  save(outDir, 'favoritos', favoritos)
  counts['favoritos (favorito=true)'] = favoritos.length
  console.log(favoritos.length)

  // 4. Restaurantes — todos (para obtener IDs y slugs)
  process.stdout.write('→ restaurantes ... ')
  const { data: restaurantes, error: errRest } = await sb
    .from('restaurantes')
    .select('id, nombre, email, slug, plan, subscription_status')
    .order('nombre')
  if (errRest) throw new Error(`restaurantes: ${errRest.message}`)
  save(outDir, 'restaurantes', restaurantes)
  counts['restaurantes'] = restaurantes.length
  console.log(restaurantes.length)

  // 5. Vinos por restaurante (carta + bodega = misma tabla `vinos`)
  console.log('→ vinos por restaurante ...')
  let totalVinos = 0
  for (const rest of restaurantes) {
    const slug  = rest.slug || rest.nombre.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const filas = await fetchAll(() =>
      sb.from('vinos').select('*').eq('restaurante_id', rest.id).order('nombre')
    )
    save(outDir, `vinos_${slug}`, filas)
    console.log(`   ${rest.nombre}: ${filas.length} vinos`)
    counts[`vinos · ${rest.nombre}`] = filas.length
    totalVinos += filas.length
  }
  counts['vinos (TOTAL)'] = totalVinos

  // 6. Simulador (carta_simulacion) por restaurante
  console.log('→ carta_simulacion por restaurante ...')
  let totalSim = 0
  for (const rest of restaurantes) {
    const slug  = rest.slug || rest.nombre.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const filas = await fetchAll(() =>
      sb.from('carta_simulacion').select('*').eq('restaurante_id', rest.id).order('nombre')
    )
    save(outDir, `carta_simulacion_${slug}`, filas)
    if (filas.length) console.log(`   ${rest.nombre}: ${filas.length} líneas en simulador`)
    counts[`carta_simulacion · ${rest.nombre}`] = filas.length
    totalSim += filas.length
  }
  counts['carta_simulacion (TOTAL)'] = totalSim

  // ── Resumen ───────────────────────────────────────────────────────────────
  const W = 50
  console.log(`\n${'─'.repeat(W + 8)}`)
  console.log('RECUENTOS')
  console.log('─'.repeat(W + 8))
  for (const [label, n] of Object.entries(counts)) {
    console.log(`  ${label.padEnd(W)} ${String(n).padStart(6)}`)
  }
  console.log('─'.repeat(W + 8))

  // ── Verificaciones ────────────────────────────────────────────────────────
  const refs  = counts['proveedor_catalogo_vinos']
  const favs  = counts['favoritos (favorito=true)']
  const provs = counts['proveedores_vino']

  const warnings = []
  if (provs < 10 || provs > 30)
    warnings.push(`proveedores_vino: ${provs} fila(s) — esperadas ~14`)
  if (refs < 7000 || refs > 14000)
    warnings.push(`proveedor_catalogo_vinos: ${refs} fila(s) — esperadas ~9.098`)
  if (favs < 200 || favs > 600)
    warnings.push(`favoritos: ${favs} fila(s) — esperados ~386`)

  if (warnings.length) {
    console.log('\n⚠  RECUENTOS FUERA DE RANGO — revisa antes de continuar:')
    for (const w of warnings) console.log(`   • ${w}`)
    process.exit(2)
  }

  console.log('\n✓ Recuentos dentro del rango esperado.')
  console.log(`✓ Backup guardado en: ${outDir}`)
}

main().catch(err => {
  console.error('ERROR:', err.message || err)
  process.exit(1)
})
