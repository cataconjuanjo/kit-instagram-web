import { supabaseAdmin } from '../../lib/supabaseAdmin'

const SQUARE_API_BASE = 'https://connect.squareup.com'

const WINE_KEYWORDS     = /vino|wine|bodega|winery/i
const PREFIJOS_INTERNOS = /^\s*(V[A-Z]{2,3}|BOT|RBN|RTN|AOC|AOP)\s+/i

function parsearNombreSquare(raw) {
  const partes    = (raw || '').split(' I ').map(s => s.trim())
  const es5seg    = partes.length >= 5
  const nombreRaw = es5seg ? partes[1] : partes[0]
  const nombre    = nombreRaw.replace(PREFIJOS_INTERNOS, '').trim() || raw.trim()
  const uva       = partes.length >= 4 ? partes[es5seg ? 2 : 1] : null
  const bodega    = partes.length >= 4
    ? partes[es5seg ? 3 : 2].replace(/^(Bodega|Bodegas)\s+/i, '').trim()
    : null
  const region    = partes.length >= 4
    ? partes[es5seg ? 0 : 3].replace(/^(DO|DOC|DOP|IGP)\s+/i, '').trim()
    : null
  const pais      = es5seg && partes.length >= 5 ? partes[4] : null
  return { nombre, uva: uva || null, bodega: bodega || null, region: region || null, pais: pais || null }
}

async function fetchAllCatalogItems(token) {
  if (!token) throw new Error('Token de Square no configurado para esta tienda')

  const items = [], imageMap = {}, categoryMap = {}
  let cursor = null

  do {
    const body = { object_types: ['ITEM'], include_related_objects: true }
    if (cursor) body.cursor = cursor

    const res = await fetch(`${SQUARE_API_BASE}/v2/catalog/search`, {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${token}`,
        'Square-Version': '2024-01-18',
        'Content-Type':   'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Square API ${res.status}: ${await res.text()}`)
    const data = await res.json()
    items.push(...(data.objects || []))
    for (const rel of (data.related_objects || [])) {
      if (rel.type === 'IMAGE'    && rel.image_data?.url)     imageMap[rel.id]    = rel.image_data.url
      if (rel.type === 'CATEGORY' && rel.category_data?.name) categoryMap[rel.id] = rel.category_data.name
    }
    cursor = data.cursor || null
  } while (cursor)

  return { items, imageMap, categoryMap }
}

async function fetchInventoryCounts(variationIds, token) {
  if (!variationIds.length || !token) return {}
  const inventoryMap = {}

  for (let i = 0; i < variationIds.length; i += 100) {
    const chunk = variationIds.slice(i, i + 100)
    let cursor = null
    do {
      const body = { catalog_object_ids: chunk }
      if (cursor) body.cursor = cursor
      const res = await fetch(`${SQUARE_API_BASE}/v2/inventory/batch-retrieve-counts`, {
        method: 'POST',
        headers: {
          Authorization:    `Bearer ${token}`,
          'Square-Version': '2024-01-18',
          'Content-Type':   'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) { console.error('[square-sync] inventory:', await res.text()); break }
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
  const catIds = [itemData.category_id, ...(itemData.categories || []).map(c => c.id)].filter(Boolean)
  for (const id of catIds) {
    if (categoryMap[id] && WINE_KEYWORDS.test(categoryMap[id])) return 'vino'
  }
  return 'otro'
}

export async function squareSyncForTienda(tiendaId, tiendaSlug, squareToken) {
  const token = squareToken || process.env.SQUARE_ACCESS_TOKEN
  if (!token) throw new Error('No hay token de Square configurado para esta tienda')

  const { items: rawItems, imageMap, categoryMap } = await fetchAllCatalogItems(token)

  // Dedup por id (paginación puede devolver duplicados)
  const seenItemIds = new Set()
  const items = rawItems.filter(item => {
    if (seenItemIds.has(item.id)) return false
    seenItemIds.add(item.id)
    return true
  })
  if (rawItems.length !== items.length) {
    console.warn(`[square-sync] dedup: ${rawItems.length - items.length} duplicados eliminados`)
  }

  const variationIds = [], variationToItem = {}, itemToVariation = {}
  for (const item of items) {
    if (item.type !== 'ITEM') continue
    const variation = (item.item_data?.variations || []).find(v => !v.is_deleted)
    if (variation?.id) {
      variationIds.push(variation.id)
      variationToItem[variation.id] = item.id
      itemToVariation[item.id]      = variation.id
    }
  }

  const inventoryMap = await fetchInventoryCounts(variationIds, token)
  const itemStockMap = {}
  for (const [varId, qty] of Object.entries(inventoryMap)) {
    const itemId = variationToItem[varId]
    if (itemId !== undefined) itemStockMap[itemId] = qty
  }

  // Leer TODAS las filas de esta tienda para construir los mapas de existentes
  const { data: existentes, error: existError } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, square_catalog_id, square_variation_id, categoria')
    .eq('tienda_id', tiendaId)
    .limit(10000)
  if (existError) throw new Error(`Leyendo existentes: ${existError.message}`)

  const existingByCatalog   = {}
  const existingByVariation = {}
  for (const v of (existentes || [])) {
    if (v.square_catalog_id)   existingByCatalog[v.square_catalog_id]   = { id: v.id, categoria: v.categoria }
    if (v.square_variation_id) existingByVariation[v.square_variation_id] = { id: v.id, categoria: v.categoria }
  }

  const toUpsertById = []   // filas ya existentes: upsert por id (sin riesgo de conflicto de índices)
  const toInsertNew  = []   // filas genuinamente nuevas

  for (const item of items) {
    if (item.type !== 'ITEM') continue
    const d         = item.item_data || {}
    const rawNombre = d.name?.trim()
    if (!rawNombre) continue

    const { nombre, uva, bodega, region, pais } = parsearNombreSquare(rawNombre)
    const variationId  = itemToVariation[item.id] || null
    const varData      = (d.variations || []).find(v => !v.is_deleted)?.item_variation_data
    const precioCents  = varData?.price_money?.amount
    const precio_pvp   = precioCents ? +(precioCents / 100).toFixed(2) : null
    const descripcion  = d.description_plaintext || d.description || null
    const foto_url     = (d.image_ids || []).map(id => imageMap[id]).find(Boolean) || null
    const stock        = itemStockMap[item.id] ?? 0
    const catDetectada = detectarCategoria(d, categoryMap)

    const existing    = existingByCatalog[item.id] || (variationId ? existingByVariation[variationId] : null)
    const catEfectiva = existing?.categoria || catDetectada
    const activo      = !item.is_deleted && (catEfectiva !== 'vino' || stock > 0)

    if (existing) {
      // Solo actualiza precio — no toca activo, stock ni nombre de vinos ya creados
      if (precio_pvp != null) {
        toUpsertById.push({
          id:                  existing.id,
          precio_pvp,
          square_variation_id: variationId,
          updated_at:          new Date().toISOString(),
        })
      }
    } else {
      toInsertNew.push({
        tienda_id:           tiendaId,
        square_catalog_id:   item.id,
        square_variation_id: variationId,
        nombre, precio_pvp, descripcion, stock, activo,
        categoria:  catEfectiva,
        uva:        uva    || null,
        bodega:     bodega || null,
        region:     region || null,
        pais:       pais   || null,
        ...(foto_url && { foto_url }),
        updated_at: new Date().toISOString(),
      })
    }
  }

  // Nuevos: separar los que tienen variation_id (upsert seguro) de los que no (insert clásico)
  const newConVariacion    = toInsertNew.filter(r => r.square_variation_id)
  const newSinVariacion    = toInsertNew.filter(r => !r.square_variation_id)

  const countNuevos = toInsertNew.length
  const countAct    = toUpsertById.length

  let errores = 0
  const BATCH = 500

  // Existentes encontrados por id interno → solo precio
  for (let i = 0; i < toUpsertById.length; i += BATCH) {
    const chunk = toUpsertById.slice(i, i + BATCH)
    const { error } = await supabaseAdmin.from('vinos_tienda').upsert(chunk, { onConflict: 'id' })
    if (error) { console.error('[square-sync] upsert(id) error:', error.message); errores += chunk.length }
  }

  // Nuevos CON variation_id → upsert sobre la constraint real; si ya existía, actualiza campos completos
  for (let i = 0; i < newConVariacion.length; i += BATCH) {
    const chunk = newConVariacion.slice(i, i + BATCH)
    const { error } = await supabaseAdmin
      .from('vinos_tienda')
      .upsert(chunk, { onConflict: 'tienda_id,square_variation_id' })
    if (error) {
      console.error('[square-sync] upsert(variation) error:', error.message, '|code:', error.code)
      errores += chunk.length
    }
  }

  // Nuevos SIN variation_id → insert normal con log por fila si falla
  for (let i = 0; i < newSinVariacion.length; i += BATCH) {
    const chunk = newSinVariacion.slice(i, i + BATCH)
    const { error } = await supabaseAdmin.from('vinos_tienda').insert(chunk)
    if (error) {
      console.error('[square-sync] insert(sin-variation) error:', error.message, '|code:', error.code, '|detail:', error.details)
      errores += chunk.length
    }
  }

  const stockSincronizados = Object.keys(itemStockMap).length
  const slug = tiendaSlug || tiendaId
  console.log(`[square-sync] ${slug}: ${countNuevos} nuevos, ${countAct} act., ${errores} errores, ${stockSincronizados} stock`)

  return { ok: errores === 0, insertados: countNuevos, actualizados: countAct, errores, total: items.length, stockSincronizados }
}
