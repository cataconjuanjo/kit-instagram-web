'use strict'
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const env = {}
  for (const f of ['.env.local', '.env.vercel']) {
    if (!fs.existsSync(f)) continue
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return { ...env, ...process.env }
}

async function fetchAll(sb, table, select, extra) {
  const all = []
  for (let o = 0; ; o += 1000) {
    let q = sb.from(table).select(select).range(o, o + 999)
    if (extra) q = extra(q)
    const { data, error } = await q
    if (error) throw new Error(table + ': ' + error.message)
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

function writeCsv(filepath, rows, columns) {
  const header = columns.join(',')
  const lines = rows.map(r => columns.map(c => {
    const v = r[c] == null ? '' : String(r[c])
    return v.includes(',') || v.includes('"') || v.includes('\n')
      ? '"' + v.replace(/"/g, '""') + '"'
      : v
  }).join(','))
  fs.mkdirSync(path.dirname(filepath), { recursive: true })
  fs.writeFileSync(filepath, [header, ...lines].join('\n'), 'utf8')
}

async function main() {
  const env = loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Faltan variables SUPABASE en .env.local')
  const sb = createClient(url, key)

  console.log('Cargando catálogo completo…')
  const rows = await fetchAll(sb, 'proveedor_catalogo_vinos',
    'id,nombre,bodega,formato,coste_estimado,disponibilidad,proveedor_id,created_at,updated_at')
  console.log(`Total filas: ${rows.length}\n`)

  // ── PARTE 1 & 2: bodegas sospechosas ────────────────────────────────────────

  // Top 30 bodegas por recuento
  const bodegaCount = new Map()
  for (const r of rows) {
    const b = r.bodega || '(null)'
    bodegaCount.set(b, (bodegaCount.get(b) || 0) + 1)
  }
  const topBodegas = [...bodegaCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)

  console.log('── Top 30 bodegas por apariciones ──────────────────────────────')
  topBodegas.forEach(([b, n], i) => {
    const flag = n > 100 ? ' ◄ SOSPECHOSA' : ''
    console.log(`  ${String(i + 1).padStart(2)}. ${String(n).padStart(5)}  ${b}${flag}`)
  })
  console.log()

  // Sospechosas: bodega con >100 apariciones que NO parecen productores reales
  // (heurística: son mayúsculas genéricas, nombres de sección, etc.)
  // Incluimos explícitamente las conocidas + cualquier otra con >100
  const SOSPECHOSAS_CONOCIDAS = new Set([
    'BORDEAUX SÉLECTION',
    'BORDEAUX',
    'VINOS Y DESTILADOS DE SELECCIÓN',
    'Sin Clasificar',
    'sin clasificar',
    '(null)',
  ])

  // Añadir cualquier bodega con >100 que esté toda en mayúsculas o sea genérica
  const sospechosas = topBodegas
    .filter(([b, n]) => n > 100 && (
      SOSPECHOSAS_CONOCIDAS.has(b) ||
      b === b.toUpperCase() ||  // toda en mayúsculas → probable etiqueta de sección
      b === '(null)'
    ))
    .map(([b, n]) => ({ bodega: b, apariciones: n }))

  console.log('── Bodegas sospechosas (>100 filas, mayúsculas o conocidas) ────')
  sospechosas.forEach(s => console.log(`  ${String(s.apariciones).padStart(5)}  ${s.bodega}`))
  console.log()

  // Para cada sospechosa, sacar DISTINCT nombre con recuento
  for (const { bodega } of sospechosas) {
    const filas = rows.filter(r => (r.bodega || '(null)') === bodega)
    const nombreCount = new Map()
    for (const r of filas) {
      const n = r.nombre || '(sin nombre)'
      nombreCount.set(n, (nombreCount.get(n) || 0) + 1)
    }
    const sorted = [...nombreCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, apariciones]) => ({ nombre, apariciones, bodega_real: '' }))

    const slug = bodega
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const csvPath = path.join('data', `bordeaux-sin-bodega-${slug}.csv`)
      .replace('bordeaux-sin-bodega-null-', 'bodega-null-')
      .replace('bordeaux-sin-bodega-sin-clasificar', 'sin-clasificar')

    writeCsv(csvPath, sorted, ['nombre', 'apariciones', 'bodega_real'])

    console.log(`── "${bodega}"`)
    console.log(`   Filas totales: ${filas.length}   Nombres únicos: ${sorted.length}`)
    console.log(`   CSV: ${csvPath}`)
    if (sorted.length <= 20) {
      sorted.forEach(r => console.log(`   ${String(r.apariciones).padStart(4)}  ${r.nombre}`))
    } else {
      sorted.slice(0, 10).forEach(r => console.log(`   ${String(r.apariciones).padStart(4)}  ${r.nombre}`))
      console.log(`   … (${sorted.length - 10} más en el CSV)`)
    }
    console.log()
  }

  // ── PARTE 3: Exclusivas Soto — semántica de "disponibilidad" ────────────────
  const SOTO_ID = '07f5e7d9-5483-468f-9a8f-a66b928dd4ef'
  const sotoRows = rows.filter(r => r.proveedor_id === SOTO_ID)

  console.log('── Exclusivas Soto — disponibilidad vs timestamps ──────────────')
  console.log(`   Total filas Soto: ${sotoRows.length}`)
  console.log()

  const dispMap = new Map()
  for (const r of sotoRows) {
    const d = r.disponibilidad || '(null)'
    if (!dispMap.has(d)) dispMap.set(d, [])
    dispMap.get(d).push(r)
  }

  for (const [disp, grupo] of [...dispMap.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const createdDates = [...new Set(grupo.map(r => r.created_at
      ? r.created_at.slice(0, 10) : null).filter(Boolean))]
    const updatedDates = [...new Set(grupo.map(r => r.updated_at
      ? r.updated_at.slice(0, 10) : null).filter(Boolean))]

    // Rango de created_at
    const createdSorted = createdDates.sort()
    const updatedSorted = updatedDates.sort()

    console.log(`   "${disp}"  (${grupo.length} filas)`)
    console.log(`     created_at  fechas distintas: ${createdDates.length}  rango: ${createdSorted[0] || 'n/a'} → ${createdSorted.at(-1) || 'n/a'}`)
    console.log(`     updated_at  fechas distintas: ${updatedDates.length}  rango: ${updatedSorted[0] || 'n/a'} → ${updatedSorted.at(-1) || 'n/a'}`)
    // Distribución por día de created_at (top 5)
    const byDay = {}
    for (const r of grupo) {
      const d = r.created_at ? r.created_at.slice(0, 10) : 'n/a'
      byDay[d] = (byDay[d] || 0) + 1
    }
    const topDays = Object.entries(byDay).sort((a, b) => b[1] - a[1]).slice(0, 5)
    topDays.forEach(([day, n]) => console.log(`       ${day}  ${n} filas`))
    console.log()
  }

  // Overlap: ¿hay filas de distintas secciones creadas el mismo día?
  const dispByDate = new Map()
  for (const r of sotoRows) {
    const d = r.created_at ? r.created_at.slice(0, 10) : 'n/a'
    if (!dispByDate.has(d)) dispByDate.set(d, new Set())
    dispByDate.get(d).add(r.disponibilidad || '(null)')
  }
  const diasConMezcla = [...dispByDate.entries()]
    .filter(([, disps]) => disps.size > 1)
    .sort()
  console.log(`   Días con filas de MÚLTIPLES secciones (disponibilidad distintas): ${diasConMezcla.length}`)
  diasConMezcla.forEach(([day, disps]) => {
    console.log(`     ${day}: ${[...disps].join(' | ')}`)
  })
  console.log()

  // Misma lógica para updated_at
  const dispByUpdated = new Map()
  for (const r of sotoRows) {
    const d = r.updated_at ? r.updated_at.slice(0, 10) : 'n/a'
    if (!dispByUpdated.has(d)) dispByUpdated.set(d, new Set())
    dispByUpdated.get(d).add(r.disponibilidad || '(null)')
  }
  const diasConMezclaUpd = [...dispByUpdated.entries()]
    .filter(([, disps]) => disps.size > 1)
    .sort()
  console.log(`   Días con filas de MÚLTIPLES secciones (por updated_at): ${diasConMezclaUpd.length}`)
  diasConMezclaUpd.forEach(([day, disps]) => {
    console.log(`     ${day}: ${[...disps].join(' | ')}`)
  })

  console.log('\nListo.')
}

main().catch(e => { console.error(e.message); process.exit(1) })
