import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN
const SQUARE_API_BASE     = 'https://connect.squareup.com'

const WINE_KEYWORDS = /vino|wine|bodega|winery/i

async function fetchAllCatalogItems() {
  if (!SQUARE_ACCESS_TOKEN) throw new Error('SQUARE_ACCESS_TOKEN no configurado en Vercel')

  const items       = []
  const imageMap    = {}
  const categoryMap = {}
  let cursor        = null

  do {
    const body = { object_types: ['ITEM'], include_related_objects: true }
    if (cursor) body.cursor = cursor

    const res = await fetch(`${SQUARE_API_BASE}/v2/catalog/search`, {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2024-01-18',
        'Content-Type':   'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Square API ${res.status}: ${txt}`)
    }
    const data = await res.json()
    items.push(...(data.objects || []))
    for (const rel of (data.related_objects || [])) {
      if (rel.type === 'IMAGE' && rel.image_data?.url) imageMap[rel.id] = rel.image_data.url
      if (rel.type === 'CATEGORY' && rel.category_data?.name) categoryMap[rel.id] = rel.category_data.name
    }
    cursor = data.cursor || null
  } while (cursor)

  return { items, imageMap, categoryMap }
}

// Llama a la API de inventario de Square para obtener el stock real de cada variación
async function fetchInventoryCounts(variationIds) {
  if (!variationIds.length || !SQUARE_ACCESS_TOKEN) return {}
  const inventoryMap = {}  // variationId → qty
  const CHUNK = 100        // Square acepta máx 100 IDs por llamada

  for (let i = 0; i < variationIds.length; i += CHUNK) {
    const chunk = variationIds.slice(i, i + CHUNK)
    let cursor = null
    do {
      const body = { catalog_object_ids: chunk, states: ['IN_STOCK'] }
      if (cursor) body.cursor = cursor
      const res = await fetch(`${SQUARE_API_BASE}/v2/inventory/counts`, {
        method: 'POST',
        headers: {
          Authorization:    `Bearer ${SQUARE_ACCESS_TOKEN}`,
          'Square-Version': '2024-01-18',
          'Content-Type':   'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        console.error('[square-sync] inventory counts error:', await res.text())
        break
      }
      const data = await res.json()
      for (const c of (data.counts || [])) {
        if (c.state === 'IN_STOCK' && c.catalog_object_id) {
          inventoryMap[c.catalog_object_id] = Math.max(0, parseInt(c.quantity, 10) || 0)
        }
      }
      cursor = data.cursor || null
    } while (cursor)
  }
  return inventoryMap
}

function detectarCategoria(itemData, categoryMap) {
  const catIds = [
    itemData.category_id,
    ...(itemData.categories || []).map(c => c.id),
  ].filter(Boolean)
  for (const id of catIds) {
    if (categoryMap[id] && WINE_KEYWORDS.test(categoryMap[id])) return 'vino'
  }
  return 'otro'
}

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 403 })

  try {
    const { items, imageMap, categoryMap } = await fetchAllCatalogItems()

    const tiendaId = access.tienda.id

    // Recopilar IDs de variación para consultar inventario
    const variationIds    = []
    const variationToItem = {}  // variationId → item.id (catalog)
    for (const item of items) {
      if (item.type !== 'ITEM') continue
      const variation = (item.item_data?.variations || []).find(v => !v.is_deleted)
      if (variation?.id) {
        variationIds.push(variation.id)
        variationToItem[variation.id] = item.id
      }
    }

    // Stock real desde Square Inventory API
    const inventoryMap = await fetchInventoryCounts(variationIds)

    // Mapear item.id → stock (el inventario viene por variationId)
    const itemStockMap = {}
    for (const [varId, qty] of Object.entries(inventoryMap)) {
      const itemId = variationToItem[varId]
      if (itemId !== undefined) itemStockMap[itemId] = qty
    }

    // Todos los productos de esta tienda que ya tienen square_catalog_id
    const { data: existentes } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, square_catalog_id')
      .eq('tienda_id', tiendaId)
      .not('square_catalog_id', 'is', null)

    const existingMap = {}
    for (const v of (existentes || [])) existingMap[v.square_catalog_id] = v.id

    const toInsert = []
    const toUpdate = []

    for (const item of items) {
      if (item.type !== 'ITEM') continue
      const d      = item.item_data || {}
      const nombre = d.name?.trim()
      if (!nombre) continue

      const varData     = (d.variations || []).find(v => !v.is_deleted)?.item_variation_data
      const precioCents = varData?.price_money?.amount
      const precio_pvp  = precioCents ? +(precioCents / 100).toFixed(2) : null
      const descripcion = d.description_plaintext || d.description || null
      const foto_url    = (d.image_ids || []).map(id => imageMap[id]).find(Boolean) || null
      const stock       = itemStockMap[item.id] ?? 0

      const base = {
        nombre,
        precio_pvp,
        descripcion,
        stock,
        ...(foto_url && { foto_url }),
        activo:     !item.is_deleted,
        updated_at: new Date().toISOString(),
      }

      if (existingMap[item.id]) {
        toUpdate.push({ id: existingMap[item.id], tienda_id: tiendaId, square_catalog_id: item.id, ...base })
      } else {
        toInsert.push({ tienda_id: tiendaId, square_catalog_id: item.id, stock, categoria: detectarCategoria(d, categoryMap), ...base })
      }
    }

    let insertados = 0, actualizados = 0, errores = 0

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from('vinos_tienda').insert(toInsert)
      if (error) { console.error('[square-sync] insert error:', error.message); errores += toInsert.length }
      else insertados = toInsert.length
    }

    if (toUpdate.length > 0) {
      const { error } = await supabaseAdmin
        .from('vinos_tienda')
        .upsert(toUpdate, { onConflict: 'id' })
      if (error) { console.error('[square-sync] upsert error:', error.message); errores += toUpdate.length }
      else actualizados = toUpdate.length
    }

    const stockSincronizados = Object.keys(itemStockMap).length
    console.log(`[square-sync] ${slug}: ${insertados} nuevos, ${actualizados} actualizados, ${errores} errores, ${stockSincronizados} con stock real`)
    return NextResponse.json({ ok: true, insertados, actualizados, errores, total: items.length, stockSincronizados })
  } catch (e) {
    console.error('[square-sync]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
