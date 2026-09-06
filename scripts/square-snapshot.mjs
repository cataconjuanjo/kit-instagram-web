// Phase 02 — Captura el catálogo Square de producción en square_snapshot.
// Ejecutar UNA SOLA VEZ, después de Phase 01 (backup) y Phase 02 setup (CREATE TABLE).
// node scripts/square-snapshot.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')

const env = {}
const rawEnv = readFileSync(envPath, 'utf-8').replace(/^﻿/, '').replace(/\r/g, '')
for (const line of rawEnv.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)$/)
  if (m) env[m[1]] = m[2].trim()
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY
const TIENDA_ID    = '8e2007d5-b167-4cd6-84bf-80f820fb970a'
const LOCATION_ID  = 'LZEJNCEFTG3JY'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Obtener token Square de la tienda
const { data: tienda, error: tiendaErr } = await supabase
  .from('tiendas')
  .select('id, square_access_token, slug')
  .eq('id', TIENDA_ID)
  .single()

if (tiendaErr || !tienda) {
  console.error('Tienda no encontrada:', tiendaErr?.message)
  process.exit(1)
}

const token = tienda.square_access_token || env.SQUARE_ACCESS_TOKEN
if (!token) {
  console.error('No hay token de Square para esta tienda')
  process.exit(1)
}

console.log(`Tienda: ${tienda.slug} (${TIENDA_ID})`)
console.log('Descargando catálogo de Square...')

// Fetch catálogo completo (paginado)
const rawItems = []
const imageMap = {}
const categoryMap = {}
let cursor = null

do {
  const body = {
    object_types: ['ITEM'],
    include_related_objects: true,
    include_deleted_objects: false,
  }
  if (cursor) body.cursor = cursor

  const res = await fetch('https://connect.squareup.com/v2/catalog/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': '2024-01-18',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (data.errors) {
    console.error('Error Square catálogo:', JSON.stringify(data.errors))
    process.exit(1)
  }
  rawItems.push(...(data.objects || []))
  for (const rel of (data.related_objects || [])) {
    if (rel.type === 'IMAGE' && rel.image_data?.url) imageMap[rel.id] = rel.image_data.url
    if (rel.type === 'CATEGORY' && rel.category_data?.name) categoryMap[rel.id] = rel.category_data.name
  }
  cursor = data.cursor || null
} while (cursor)

console.log(`Catálogo: ${rawItems.length} objetos descargados`)

// Construir mapa variation_id → item
const variationIds = []
const variationToItem = {}
const itemToVariation = {}

for (const item of rawItems) {
  if (item.type !== 'ITEM' || item.is_deleted) continue
  const variation = (item.item_data?.variations || []).find(v => !v.is_deleted)
  if (variation?.id) {
    variationIds.push(variation.id)
    variationToItem[variation.id] = item
    itemToVariation[item.id] = variation.id
  }
}

console.log(`Variaciones únicas: ${variationIds.length}`)
console.log(`Descargando inventario para location ${LOCATION_ID}...`)

// Fetch inventario (paginado por lotes de 100)
const inventoryMap = {}
const BATCH_SIZE = 100
for (let i = 0; i < variationIds.length; i += BATCH_SIZE) {
  const batch = variationIds.slice(i, i + BATCH_SIZE)
  let invCursor = null
  do {
    const body = {
      catalog_object_ids: batch,
      location_ids: [LOCATION_ID],
    }
    if (invCursor) body.cursor = invCursor

    const res = await fetch('https://connect.squareup.com/v2/inventory/counts/batch-retrieve', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.errors) {
      console.error('Error Square inventario:', JSON.stringify(data.errors))
      process.exit(1)
    }
    for (const count of (data.counts || [])) {
      if (count.state === 'IN_STOCK') {
        inventoryMap[count.catalog_object_id] = parseInt(count.quantity, 10) || 0
      }
    }
    invCursor = data.cursor || null
  } while (invCursor)
}

console.log(`Stock capturado para ${Object.keys(inventoryMap).length} variaciones`)

// Construir filas para square_snapshot
const capturadoAt = new Date().toISOString()
const rows = []

for (const [variationId, item] of Object.entries(variationToItem)) {
  const d = item.item_data || {}
  const variation = (d.variations || []).find(v => v.id === variationId)
  const varData = variation?.item_variation_data
  const precioCents = varData?.price_money?.amount
  const precio = precioCents ? +(precioCents / 100).toFixed(2) : null
  const stock = inventoryMap[variationId] ?? 0

  rows.push({
    tienda_id:    TIENDA_ID,
    variation_id: variationId,
    catalog_id:   item.id,
    nombre:       d.name?.trim() || null,
    precio,
    stock,
    capturado_at: capturadoAt,
  })
}

console.log(`Insertando ${rows.length} filas en square_snapshot...`)

// Upsert en lotes de 500
const UPSERT_BATCH = 500
let insertadas = 0
for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
  const chunk = rows.slice(i, i + UPSERT_BATCH)
  const { error } = await supabase
    .from('square_snapshot')
    .upsert(chunk, { onConflict: 'tienda_id,variation_id' })
  if (error) {
    console.error(`Error insertando lote ${i}–${i + chunk.length}:`, error.message)
    process.exit(1)
  }
  insertadas += chunk.length
  process.stdout.write(`\r  ${insertadas}/${rows.length} variaciones`)
}

console.log(`\n\n✓ square_snapshot poblado: ${rows.length} variaciones`)
console.log('  Ahora continúa con Phase 03 en Supabase SQL Editor (square-relink.sql).')
