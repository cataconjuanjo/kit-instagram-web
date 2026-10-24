/**
 * Sincroniza el stock de la app con los recuentos reales de Square.
 * POR DEFECTO es DRY-RUN. Pasar --apply para escribir en la base.
 *
 * Uso:
 *   node --env-file=.env.local scripts/sync-stock-from-square.mjs [slug] [--apply]
 *
 * Reglas:
 *   Square == app      → no tocar
 *   Square > app       → stock = Square, activo = true  (solo con --apply)
 *   Square < app       → NO tocar, exportar a scripts/out/square_menor_app_<ts>.csv
 *   Square <= 0        → no tocar
 *   Sin conteo Square  → no tocar
 *
 * Con --apply:
 *   1. Guarda snapshot CSV completo antes de cualquier escritura
 *      (scripts/out/snapshot_<slug>_<ts>.csv)
 *   2. Actualiza hasta WRITE_LIMIT vinos (stock = Square, activo = true)
 *   3. Registra cada cambio en stock_movements (tipo = 'sync_square_inicial')
 *   4. Exporta Square < app a scripts/out/square_menor_app_<slug>_<ts>.csv
 *
 * Rollback: restaurar desde el snapshot con el script rollback-snapshot.mjs
 * (ver TAREA 3 del informe de despliegue).
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const nonFlagArgs  = process.argv.slice(2).filter(a => !a.startsWith('--'))
const SLUG         = nonFlagArgs[0] || process.env.AUDIT_SLUG || 'sibaris-gourmet'
const APPLY        = process.argv.includes('--apply')
const SB_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY
const SQUARE_API   = 'https://connect.squareup.com/v2'
const BATCH_SIZE   = 100
const WRITE_LIMIT  = 500
const OUT_DIR      = join(__dirname, 'out')

if (!SB_URL || !SB_KEY) {
  console.error('[ERROR] Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient(SB_URL, SB_KEY)

// ── Helpers ──────────────────────────────────────────────────────────────────

function csvRow(...cells) {
  return cells.map(c => {
    const s = String(c ?? '')
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')
}

function tbl(headers, rows) {
  if (!rows.length) { console.log('(sin datos)\n'); return }
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)))
  const fmt = row => row.map((v, i) => String(v ?? '').padEnd(w[i])).join(' | ')
  console.log('| ' + fmt(headers) + ' |')
  console.log('+-' + w.map(n => '-'.repeat(n)).join('-+-') + '-+')
  rows.forEach(r => console.log('| ' + fmt(r) + ' |'))
  console.log()
}

async function squareBatchInventory(variationIds, token, locationId) {
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
    for (const count of data.counts || []) {
      const id = count.catalog_object_id
      countMap[id] = (countMap[id] || 0) + (parseFloat(count.quantity) || 0)
    }
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const modo = APPLY ? '🔴 APPLY' : '🟡 DRY-RUN'
  console.log(`\n# SYNC APP ← SQUARE  slug="${SLUG}"  ${modo}  ${new Date().toISOString().slice(0, 16)}Z\n`)

  // ── 0. Tienda ───────────────────────────────────────────────────────────────
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
    console.error('[ERROR] No hay token de Square. Configura square_access_token en tiendas o SQUARE_ACCESS_TOKEN en .env.local')
    process.exit(1)
  }

  console.log(`tienda_id              : ${tienda.id}`)
  console.log(`square_tracks_inventory: ${tienda.square_tracks_inventory}`)
  console.log(`square_location_id     : ${locationId || '(todas las locations)'}`)
  console.log()

  // ── 1. Vinos ────────────────────────────────────────────────────────────────
  const PAGE = 1000
  let vinos = [], from = 0
  while (true) {
    const { data, error } = await db
      .from('vinos_tienda')
      .select('id, nombre, stock, activo, categoria, square_variation_id')
      .eq('tienda_id', tienda.id)
      .range(from, from + PAGE - 1)
    if (error) { console.error('[ERROR] vinos_tienda:', error.message); process.exit(1) }
    vinos = vinos.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  const vinosConVar = vinos.filter(v => v.square_variation_id)
  console.log(`Total vinos en BD: ${vinos.length}  |  con square_variation_id: ${vinosConVar.length}`)
  if (!vinosConVar.length) {
    console.log('⚠️  Sin square_variation_id. Nada que comparar.')
    process.exit(0)
  }

  // ── 2. Square ───────────────────────────────────────────────────────────────
  console.log(`Consultando Square para ${vinosConVar.length} variaciones (solo lectura)…`)
  let squareCounts
  try {
    squareCounts = await squareBatchInventory(vinosConVar.map(v => v.square_variation_id), squareToken, locationId)
  } catch (e) {
    console.error('[ERROR] Square API:', e.message)
    process.exit(1)
  }
  console.log()

  // ── 3. Clasificar ───────────────────────────────────────────────────────────
  const subir     = []  // Square > app → actualizar
  const menor     = []  // Square < app → CSV, no tocar
  const iguales   = []  // Square == app
  const sinConteo = []  // sin conteo en Square

  for (const v of vinosConVar) {
    const sqRaw    = squareCounts[v.square_variation_id]
    const appStock = Number(v.stock ?? 0)

    if (sqRaw === undefined) { sinConteo.push(v); continue }
    const sqStock = Math.round(sqRaw)
    if (sqStock <= 0 && appStock <= 0) { iguales.push({ ...v, sqStock }); continue }
    if (sqStock < 0) continue  // Square negativo: ignorar

    const delta = sqStock - appStock
    if (delta === 0) {
      iguales.push({ ...v, sqStock })
    } else if (delta > 0) {
      subir.push({ ...v, appStock, sqStock, delta, seActivaria: !v.activo && sqStock > 0 })
    } else {
      menor.push({ ...v, appStock, sqStock, delta })
    }
  }

  // ── 4. Resumen ──────────────────────────────────────────────────────────────
  console.log('## Resumen\n')
  tbl(
    ['grupo', 'vinos'],
    [
      ['Square == app  (no tocar)',    iguales.length],
      ['Square > app   (subir stock)', subir.length],
      ['Square < app   (solo CSV)',    menor.length],
      ['Sin conteo Square',            sinConteo.length],
    ]
  )

  const seActivarian = subir.filter(v => v.seActivaria)
  console.log(`Vinos que pasarían de ocultos a visibles con --apply: ${seActivarian.length}`)
  if (seActivarian.length) {
    tbl(
      ['nombre', 'sq_stock'],
      seActivarian.slice(0, 20).map(v => [v.nombre?.slice(0, 40) || '?', v.sqStock])
    )
  }

  console.log('## Top 30 cambios Square > app (por delta)\n')
  const top30 = [...subir].sort((a, b) => b.delta - a.delta).slice(0, 30)
  if (top30.length) {
    tbl(
      ['nombre', 'app_stock', 'sq_stock', 'delta', 'activo_hoy'],
      top30.map(v => [
        (v.nombre || '?').slice(0, 32),
        v.appStock,
        v.sqStock,
        `+${v.delta}`,
        v.activo ? '✅' : '❌ oculto',
      ])
    )
  }

  if (!APPLY) {
    console.log('──────────────────────────────────────────────────────')
    console.log(`✅ DRY-RUN completado. Límite de seguridad: ${WRITE_LIMIT} vinos por ejecución.`)
    console.log()
    console.log(`Para aplicar los cambios:`)
    console.log(`  node --env-file=.env.local scripts/sync-stock-from-square.mjs ${SLUG} --apply`)
    console.log()
    return
  }

  // ── 5. APPLY ─────────────────────────────────────────────────────────────────
  if (!subir.length) {
    console.log('Nada que actualizar (Square == app en todos). Saliendo.')
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })

  // Snapshot completo antes de cualquier escritura
  const snapshotPath = join(OUT_DIR, `snapshot_${SLUG}_${ts}.csv`)
  const snapshotLines = [
    csvRow('id', 'nombre', 'stock', 'activo', 'square_variation_id'),
    ...vinos.map(v => csvRow(v.id, v.nombre ?? '', v.stock ?? 0, v.activo ? '1' : '0', v.square_variation_id || '')),
  ]
  writeFileSync(snapshotPath, snapshotLines.join('\n'), 'utf8')
  console.log(`📸 Snapshot guardado: ${snapshotPath}  (${vinos.length} filas)`)

  // CSV de Square < app (informativo, sin tocar)
  if (menor.length) {
    const menorPath = join(OUT_DIR, `square_menor_app_${SLUG}_${ts}.csv`)
    writeFileSync(
      menorPath,
      [
        csvRow('id', 'nombre', 'stock_app', 'stock_square', 'delta'),
        ...menor.map(v => csvRow(v.id, v.nombre ?? '', v.appStock, v.sqStock, v.delta)),
      ].join('\n'),
      'utf8'
    )
    console.log(`📄 Square < app exportado (${menor.length} vinos, sin tocar): ${menorPath}`)
  }

  // Escrituras: Square > app
  const aActualizar = subir.slice(0, WRITE_LIMIT)
  if (subir.length > WRITE_LIMIT) {
    console.warn(`\n⚠️  ${subir.length} vinos para actualizar; aplicando solo los primeros ${WRITE_LIMIT} (límite de seguridad).`)
    console.warn(`   Vuelve a ejecutar con --apply para los restantes (serán clasificados de nuevo).`)
  }

  console.log(`\nActualizando ${aActualizar.length} vinos…\n`)
  let actualizados = 0, errores = 0
  const now = new Date().toISOString()

  for (const v of aActualizar) {
    const stockNuevo = v.sqStock
    const { error: upErr } = await db
      .from('vinos_tienda')
      .update({ stock: stockNuevo, activo: stockNuevo > 0, updated_at: now })
      .eq('id', v.id)

    if (upErr) {
      console.error(`  ✗ ${v.nombre}: ${upErr.message}`)
      errores++
      continue
    }

    // Registrar en stock_movements (intenta con tipo; degrada si la columna no existe)
    const movBase = {
      tienda_id:      tienda.id,
      vino_id:        v.id,
      vino_nombre:    v.nombre || null,
      stock_anterior: v.appStock,
      stock_nuevo:    stockNuevo,
    }
    const { error: movErr } = await db
      .from('stock_movements')
      .insert({ ...movBase, tipo: 'sync_square_inicial' })
    if (movErr) {
      // Degradar si la columna tipo no existe todavía (migración pendiente)
      if (/column|schema|pgrst/i.test(movErr.message)) {
        await db.from('stock_movements').insert(movBase).catch(() => {})
      } else {
        console.warn(`  ⚠ stock_movements (${v.nombre}): ${movErr.message}`)
      }
    }

    actualizados++
  }

  console.log('\n## Resultado final\n')
  tbl(
    ['métrica', 'valor'],
    [
      ['Actualizados correctamente', actualizados],
      ['Errores de escritura',       errores],
      ['Square < app (solo CSV)',    menor.length],
      ['Restantes (> límite)',       Math.max(0, subir.length - WRITE_LIMIT)],
    ]
  )
  console.log(`📸 Snapshot para rollback : ${snapshotPath}`)
  console.log()
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1) })
