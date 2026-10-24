/**
 * Compara el stock de vinos_tienda con los recuentos de Square.
 * SOLO LECTURA — aborta ante cualquier mutación.
 *
 * Uso:
 *   node --env-file=.env.local scripts/compare-stock-square.mjs [slug]
 *
 * Si no se pasa slug, usa AUDIT_SLUG del env o 'sibaris-gourmet' por defecto.
 */

import { createClient } from '@supabase/supabase-js'

const SLUG   = process.argv[2] || process.env.AUDIT_SLUG || 'sibaris-gourmet'
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SB_URL || !SB_KEY) {
  console.error('[ERROR] Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(SB_URL, SB_KEY)

const SQUARE_API = 'https://connect.squareup.com/v2'
const BATCH_SIZE = 100   // Square BatchRetrieveInventoryCounts max

function tbl(headers, rows) {
  if (!rows.length) { console.log('(sin datos)\n'); return }
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)))
  const line = w.map(n => '-'.repeat(n)).join('-+-')
  const fmt  = row => row.map((v, i) => String(v ?? '').padEnd(w[i])).join(' | ')
  console.log('| ' + fmt(headers) + ' |')
  console.log('+-' + line + '-+')
  rows.forEach(r => console.log('| ' + fmt(r) + ' |'))
  console.log()
}

async function squareBatchInventory(variationIds, token, locationId) {
  // Square BatchRetrieveInventoryCounts — max 100 catalog_object_ids per call
  const countMap = {}
  for (let i = 0; i < variationIds.length; i += BATCH_SIZE) {
    const batch = variationIds.slice(i, i + BATCH_SIZE)
    const body  = {
      catalog_object_ids: batch,
      states: ['IN_STOCK'],
      ...(locationId ? { location_ids: [locationId] } : {}),
    }
    const res = await fetch(`${SQUARE_API}/inventory/counts/batch-retrieve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Square BatchRetrieveInventoryCounts HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    // Aggregate by catalog_object_id (sum across locations if multiple)
    for (const count of data.counts || []) {
      const id = count.catalog_object_id
      const qty = parseFloat(count.quantity) || 0
      countMap[id] = (countMap[id] || 0) + qty
    }
    // Pagination
    let cursor = data.cursor
    while (cursor) {
      const r2 = await fetch(`${SQUARE_API}/inventory/counts/batch-retrieve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Square-Version': '2024-01-18',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, cursor }),
      })
      if (!r2.ok) break
      const d2 = await r2.json()
      for (const count of d2.counts || []) {
        const id = count.catalog_object_id
        countMap[id] = (countMap[id] || 0) + (parseFloat(count.quantity) || 0)
      }
      cursor = d2.cursor
    }
  }
  return countMap
}

async function main() {
  const hace90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  console.log(`\n# COMPARACIÓN APP vs SQUARE — slug="${SLUG}" — ${new Date().toISOString().slice(0, 16)}Z\n`)

  // ── 0. Tienda ──────────────────────────────────────────────────────────────
  const { data: tienda, error: te } = await db
    .from('tiendas')
    .select('id, slug, square_access_token, square_location_id, square_tracks_inventory')
    .eq('slug', SLUG)
    .single()
  if (te || !tienda) {
    console.error('[ERROR] Tienda no encontrada:', SLUG, te?.message)
    process.exit(1)
  }

  const squareToken = tienda.square_access_token || process.env.SQUARE_ACCESS_TOKEN
  const locationId  = tienda.square_location_id  || process.env.SQUARE_LOCATION_ID || null

  if (!squareToken) {
    console.error('[ERROR] No hay token de Square para esta tienda. Configura square_access_token en tiendas o SQUARE_ACCESS_TOKEN en .env.local')
    process.exit(1)
  }

  console.log(`tienda_id              : ${tienda.id}`)
  console.log(`square_tracks_inventory: ${tienda.square_tracks_inventory}`)
  console.log(`square_location_id     : ${locationId || '(no configurado — consulta a todas las locations)'}`)
  console.log()

  // ── 1. Leer vinos_tienda con square_variation_id ───────────────────────────
  const PAGE = 1000
  let vinos = []; let from = 0
  while (true) {
    const { data, error } = await db
      .from('vinos_tienda')
      .select('id, nombre, stock, activo, categoria, square_variation_id, square_catalog_id')
      .eq('tienda_id', tienda.id)
      .range(from, from + PAGE - 1)
    if (error) { console.error('[ERROR] vinos_tienda:', error.message); process.exit(1) }
    vinos = vinos.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  const vinosConVar  = vinos.filter(v => v.square_variation_id)
  const vinosSinVar  = vinos.filter(v => !v.square_variation_id)
  const vinosVino    = vinos.filter(v => v.categoria !== 'otro' && v.categoria !== 'carta')

  console.log(`Total vinos en BD: ${vinos.length}  |  con square_variation_id: ${vinosConVar.length}  |  sin: ${vinosSinVar.length}`)
  console.log()

  if (!vinosConVar.length) {
    console.log('⚠️  Ningún vino tiene square_variation_id. No se puede comparar con Square.')
    process.exit(0)
  }

  // ── 2. Consultar Square BatchRetrieveInventoryCounts ───────────────────────
  console.log(`Consultando Square para ${vinosConVar.length} variaciones (READ ONLY)…`)
  const variationIds = vinosConVar.map(v => v.square_variation_id)
  let squareCounts
  try {
    squareCounts = await squareBatchInventory(variationIds, squareToken, locationId)
  } catch (e) {
    console.error('[ERROR] Square API:', e.message)
    process.exit(1)
  }
  const squareTracked = variationIds.filter(id => squareCounts[id] !== undefined).length
  const squareNoCount = variationIds.filter(id => squareCounts[id] === undefined).length
  console.log(`Square: ${squareTracked} variaciones con conteo  |  ${squareNoCount} sin conteo (posiblemente sin seguimiento)\n`)

  // ── 3. Comparar ────────────────────────────────────────────────────────────
  const comparisons = vinosConVar.map(v => {
    const sqStock = squareCounts[v.square_variation_id]
    const appStock = Number(v.stock ?? 0)
    const sqVal    = sqStock !== undefined ? Math.round(sqStock) : null
    return {
      id:        v.id,
      nombre:    v.nombre || '?',
      appStock,
      sqStock:   sqVal,
      delta:     sqVal !== null ? sqVal - appStock : null,
      activo:    v.activo,
      categoria: v.categoria,
    }
  })

  const sinConteo  = comparisons.filter(c => c.sqStock === null)
  const iguales    = comparisons.filter(c => c.sqStock !== null && c.delta === 0)
  const sqMayor    = comparisons.filter(c => c.delta !== null && c.delta > 0)
  const sqMenor    = comparisons.filter(c => c.delta !== null && c.delta < 0)

  console.log('## Resumen de diferencias\n')
  tbl(
    ['estado','cantidad'],
    [
      ['Square == App',    iguales.length],
      ['Square > App',     sqMayor.length],
      ['Square < App',     sqMenor.length],
      ['Sin conteo Square',sinConteo.length],
    ]
  )

  // ── 4. App=0, Square>0: reposiciones en Square no vistas por la app ────────
  const reposNoVistas = comparisons.filter(c => c.appStock === 0 && c.sqStock !== null && c.sqStock > 0)
  console.log(`## Vinos con stock App=0 y Square>0 (reposiciones que la app no vio)\n`)
  console.log(`Total: ${reposNoVistas.length}`)
  if (reposNoVistas.length > 0) {
    tbl(
      ['nombre','app_stock','sq_stock','activo'],
      reposNoVistas.sort((a, b) => b.sqStock - a.sqStock).slice(0, 30).map(c => [
        c.nombre.slice(0, 35), c.appStock, c.sqStock, c.activo ? '✅' : '❌ inactivo'
      ])
    )
  }

  // ── 5. Top 40 diferencias (delta más grande) ───────────────────────────────
  console.log('## Top 40 diferencias (|delta| más alto)\n')
  const diffs = comparisons
    .filter(c => c.delta !== null && c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 40)

  if (diffs.length) {
    // Obtener ventas 90d para los vinos con diferencias
    const PAGE2 = 1000; let pla = []; let from2 = 0
    const diffIds = new Set(diffs.map(d => d.id))
    while (true) {
      const { data: plaPage } = await db
        .from('payment_lines_applied')
        .select('catalog_id, qty, tienda_id')
        .eq('tienda_id', tienda.id)
        .gte('created_at', hace90)
        .range(from2, from2 + PAGE2 - 1)
      pla = pla.concat(plaPage || [])
      if (!plaPage || plaPage.length < PAGE2) break
      from2 += PAGE2
    }

    // Map catalog_id → vino_id
    const byVar = {}, byCat = {}
    for (const v of vinos) {
      if (v.square_variation_id) byVar[v.square_variation_id] = v.id
      if (v.square_catalog_id)   byCat[v.square_catalog_id]   = v.id
    }
    const uds90d = {}
    for (const row of pla) {
      const vid = byVar[row.catalog_id] || byCat[row.catalog_id]
      if (vid && diffIds.has(vid)) uds90d[vid] = (uds90d[vid] || 0) + Number(row.qty)
    }

    tbl(
      ['nombre','app_stock','sq_stock','delta','uds_90d','activo'],
      diffs.map(c => [
        c.nombre.slice(0, 30),
        c.appStock,
        c.sqStock,
        c.delta > 0 ? `+${c.delta}` : String(c.delta),
        uds90d[c.id] || 0,
        c.activo ? '✅' : '❌',
      ])
    )
  } else {
    console.log('(sin diferencias con conteo Square)\n')
  }

  // ── 6. Vinos sin conteo en Square ─────────────────────────────────────────
  if (sinConteo.length > 0 && sinConteo.length <= 30) {
    console.log(`## Vinos sin conteo en Square (primeros ${Math.min(sinConteo.length, 30)})\n`)
    tbl(
      ['nombre','app_stock','activo'],
      sinConteo.slice(0, 30).map(c => [c.nombre.slice(0, 35), c.appStock, c.activo ? '✅' : '❌'])
    )
  }

  console.log('\n--- FIN DEL INFORME ---\n')
  console.log('Pega la salida completa (desde # COMPARACIÓN hasta aquí) para el diagnóstico.')
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1) })
