import { supabaseAdmin } from '../../lib/supabaseAdmin'

const SQUARE_API_BASE = 'https://connect.squareup.com'

const WINE_KEYWORDS     = /vino|wine|bodega|winery/i
const PREFIJOS_INTERNOS = /^\s*(V[A-Z]{2,3}|BOT|RBN|RTN|AOC|AOP)\s+/i
const GLOBAL_SQUARE_TIENDA_ID = process.env.SQUARE_TIENDA_ID || process.env.SQUARE_DEFAULT_TIENDA_ID || null
const GLOBAL_SQUARE_TIENDA_SLUG = process.env.SQUARE_TIENDA_SLUG || process.env.SQUARE_DEFAULT_TIENDA_SLUG || null
const TRUE_ENV_FLAG = /^(1|true|yes|on)$/i
const FALSE_ENV_FLAG = /^(0|false|no|off)$/i
const SQUARE_SYNC_ENABLED = !FALSE_ENV_FLAG.test(String(process.env.SQUARE_SYNC_ENABLED ?? 'true').trim())
const SQUARE_REQUEST_TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.SQUARE_REQUEST_TIMEOUT_MS || process.env.SQUARE_FETCH_TIMEOUT_MS || '8000', 10) || 8000
)
const TEMPORARILY_PAUSED_SQUARE_SYNC_SLUGS = parseEnvList('sibaris-gourmet')
const SQUARE_SYNC_FORCE_ENABLED_SLUGS = parseEnvList(process.env.SQUARE_SYNC_FORCE_ENABLED_SLUGS || process.env.SQUARE_SYNC_ENABLED_SLUGS)
const SQUARE_SYNC_DISABLED_ALL = !SQUARE_SYNC_ENABLED || TRUE_ENV_FLAG.test(String(process.env.SQUARE_SYNC_DISABLED || '').trim())
const SQUARE_SYNC_DISABLED_SLUGS = parseEnvList(process.env.SQUARE_SYNC_DISABLED_SLUGS || process.env.SQUARE_SYNC_PAUSED_SLUGS)
const SQUARE_SYNC_DISABLED_TIENDA_IDS = parseEnvList(process.env.SQUARE_SYNC_DISABLED_TIENDA_IDS || process.env.SQUARE_SYNC_PAUSED_TIENDA_IDS)

function parseEnvList(value) {
  return new Set(String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean))
}

export function isSquareSyncTemporarilyPaused(tienda = {}) {
  const slug = String(typeof tienda === 'string' ? tienda : tienda?.slug || '').trim().toLowerCase()
  const id = String(typeof tienda === 'string' ? '' : tienda?.id || '').trim().toLowerCase()
  if (SQUARE_SYNC_DISABLED_ALL) return true
  if (slug && SQUARE_SYNC_FORCE_ENABLED_SLUGS.has(slug)) return false
  return (slug && TEMPORARILY_PAUSED_SQUARE_SYNC_SLUGS.has(slug)) ||
    (slug && SQUARE_SYNC_DISABLED_SLUGS.has(slug)) ||
    (id && SQUARE_SYNC_DISABLED_TIENDA_IDS.has(id))
}

export function isSquareSyncGloballyPaused() {
  return SQUARE_SYNC_DISABLED_ALL
}

export function squareSyncPausedPayload(tienda = {}, trigger = 'square_sync') {
  return {
    ok: true,
    skipped: 'square_sync_temporarily_paused',
    syncPaused: true,
    trigger,
    slug: typeof tienda === 'string' ? tienda : tienda?.slug || null,
    tiendaId: typeof tienda === 'string' ? null : tienda?.id || null,
    squareSyncEnabled: SQUARE_SYNC_ENABLED,
  }
}

export async function fetchSquareJson(url, options = {}, context = 'Square API') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SQUARE_REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    const body = await res.text()
    if (!res.ok) {
      throw new Error(`${context} ${res.status}: ${body.slice(0, 500)}`)
    }
    return body ? JSON.parse(body) : {}
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${context} timeout after ${SQUARE_REQUEST_TIMEOUT_MS}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function getTokenForTienda(tienda) {
  const tiendaToken = (tienda?.square_access_token || '').trim()
  if (tiendaToken) return { token: tiendaToken, source: 'tienda' }

  const envToken = (process.env.SQUARE_ACCESS_TOKEN || '').trim()
  if (!envToken) return { token: null, source: null }

  const matchesId = GLOBAL_SQUARE_TIENDA_ID && tienda?.id === GLOBAL_SQUARE_TIENDA_ID
  const matchesSlug = GLOBAL_SQUARE_TIENDA_SLUG && tienda?.slug === GLOBAL_SQUARE_TIENDA_SLUG
  if (matchesId || matchesSlug) return { token: envToken, source: 'env_target' }

  return { token: null, source: null }
}

export async function listSquareSyncTiendas({ includePaused = false } = {}) {
  const { data: tiendas, error } = await supabaseAdmin
    .from('tiendas')
    .select('id, slug, square_access_token, square_location_id')
    .eq('activo', true)
    .order('slug')

  if (error) throw new Error(`Leyendo tiendas Square: ${error.message}`)

  return (tiendas || [])
    .map(tienda => {
      const { square_access_token, ...safeTienda } = tienda
      if (isSquareSyncTemporarilyPaused(safeTienda)) {
        return includePaused
          ? { ...safeTienda, squareToken: null, squareTokenSource: 'paused', squareSyncPaused: true }
          : null
      }

      const { token, source } = getTokenForTienda(tienda)
      return token ? { ...safeTienda, squareToken: token, squareTokenSource: source, squareSyncPaused: false } : null
    })
    .filter(Boolean)
}

export async function resolveSquareTiendaByLocation(locationId) {
  const tiendas = await listSquareSyncTiendas({ includePaused: true })
  if (locationId) {
    const tienda = tiendas.find(t => t.square_location_id === locationId)
    if (tienda) return { ...tienda, squareLocationResolvedBy: 'location_id' }
  }
  const activeTiendas = tiendas.filter(t => !t.squareSyncPaused)
  if (activeTiendas.length === 1) {
    return { ...activeTiendas[0], squareLocationResolvedBy: locationId ? 'single_configured_tienda' : 'single_no_location' }
  }
  return null
}

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

    const data = await fetchSquareJson(`${SQUARE_API_BASE}/v2/catalog/search`, {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${token}`,
        'Square-Version': '2024-01-18',
        'Content-Type':   'application/json',
      },
      body: JSON.stringify(body),
    }, 'Square catalog/search')
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
      let data
      try {
        data = await fetchSquareJson(`${SQUARE_API_BASE}/v2/inventory/batch-retrieve-counts`, {
          method: 'POST',
          headers: {
            Authorization:    `Bearer ${token}`,
            'Square-Version': '2024-01-18',
            'Content-Type':   'application/json',
          },
          body: JSON.stringify(body),
        }, 'Square inventory/batch-retrieve-counts')
      } catch (error) {
        console.error('[square-sync] inventory:', error.message)
        break
      }
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

function chunkArray(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function uniqueStrings(values) {
  return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))]
}

function priceFromVariation(variation) {
  const amount = variation?.item_variation_data?.price_money?.amount
  if (amount === undefined || amount === null) return null
  const cents = Number(amount)
  return Number.isFinite(cents) ? +(cents / 100).toFixed(2) : null
}

function pricesDiffer(current, next) {
  if (next === null || next === undefined) return false
  return Number(current) !== Number(next)
}

async function fetchCatalogObjects(objectIds, token) {
  const ids = uniqueStrings(objectIds)
  if (!ids.length || !token) return { objects: [], related_objects: [] }

  const objects = []
  const relatedObjects = []
  for (const chunk of chunkArray(ids, 100)) {
    const data = await fetchSquareJson(`${SQUARE_API_BASE}/v2/catalog/batch-retrieve`, {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${token}`,
        'Square-Version': '2024-01-18',
        'Content-Type':   'application/json',
      },
      body: JSON.stringify({
        object_ids: chunk,
        include_related_objects: true,
      }),
    }, 'Square catalog/batch-retrieve')
    objects.push(...(data.objects || []))
    relatedObjects.push(...(data.related_objects || []))
  }

  return { objects, related_objects: relatedObjects }
}

function collectCatalogVariations(objects, relatedObjects) {
  const byId = new Map()
  for (const object of [...(objects || []), ...(relatedObjects || [])]) {
    if (object?.id) byId.set(object.id, object)
  }

  const variations = new Map()
  const addVariation = (variation, itemId = null) => {
    if (!variation?.id || variation.is_deleted) return
    const variationData = variation.item_variation_data || {}
    const parentItemId = itemId || variationData.item_id || null
    variations.set(variation.id, {
      itemId: parentItemId,
      variationId: variation.id,
      precio_pvp: priceFromVariation(variation),
    })
  }

  for (const object of objects || []) {
    if (object?.type === 'ITEM') {
      for (const variation of object.item_data?.variations || []) {
        addVariation(variation, object.id)
      }
    } else if (object?.type === 'ITEM_VARIATION') {
      addVariation(object)
      const parent = object.item_variation_data?.item_id ? byId.get(object.item_variation_data.item_id) : null
      if (parent?.type === 'ITEM') {
        for (const variation of parent.item_data?.variations || []) {
          if (variation.id === object.id) addVariation(variation, parent.id)
        }
      }
    }
  }

  return [...variations.values()]
}

export async function selectVinosBySquareIds(tiendaId, variationIds, catalogIds = []) {
  const bySquareId = new Map()
  const idsByVariation = uniqueStrings(variationIds)
  const idsByCatalog = uniqueStrings(catalogIds)

  if (idsByVariation.length) {
    const { data, error } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, precio_pvp, stock, activo, categoria, nombre, square_catalog_id, square_variation_id')
      .eq('tienda_id', tiendaId)
      .in('square_variation_id', idsByVariation)
    if (error) throw new Error(`Leyendo vinos por square_variation_id: ${error.message}`)
    for (const vino of data || []) {
      if (vino.square_variation_id) bySquareId.set(vino.square_variation_id, vino)
    }
  }

  const unresolvedCatalogIds = idsByCatalog.filter(id => !bySquareId.has(id))
  if (unresolvedCatalogIds.length) {
    const { data, error } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, precio_pvp, stock, activo, categoria, nombre, square_catalog_id, square_variation_id')
      .eq('tienda_id', tiendaId)
      .in('square_catalog_id', unresolvedCatalogIds)
    if (error) throw new Error(`Leyendo vinos por square_catalog_id: ${error.message}`)
    for (const vino of data || []) {
      if (vino.square_catalog_id) bySquareId.set(vino.square_catalog_id, vino)
      if (vino.square_variation_id) bySquareId.set(vino.square_variation_id, vino)
    }
  }

  return bySquareId
}

export async function squareCatalogUpdateForTiendaObjects(tiendaId, tiendaSlug, squareToken, objectIds) {
  if (isSquareSyncTemporarilyPaused({ id: tiendaId, slug: tiendaSlug })) {
    return {
      ...squareSyncPausedPayload({ id: tiendaId, slug: tiendaSlug }, 'catalog.objects.updated'),
      actualizados: 0,
      errores: 0,
      total: 0,
    }
  }

  const ids = uniqueStrings(objectIds)
  if (!ids.length) {
    return { ok: true, skipped: 'no_catalog_object_ids', actualizados: 0, errores: 0, total: 0 }
  }

  const token = (squareToken || '').trim()
  if (!token) throw new Error('No hay token de Square configurado para esta tienda')

  const { objects, related_objects: relatedObjects } = await fetchCatalogObjects(ids, token)
  const variations = collectCatalogVariations(objects, relatedObjects)
  if (!variations.length) {
    return { ok: true, skipped: 'no_item_variations', actualizados: 0, errores: 0, total: objects.length }
  }

  const variationIds = variations.map(v => v.variationId)
  const catalogIds = variations.flatMap(v => [v.itemId, v.variationId]).filter(Boolean)
  const vinosBySquareId = await selectVinosBySquareIds(tiendaId, variationIds, catalogIds)
  const now = new Date().toISOString()
  let actualizados = 0
  let errores = 0

  for (const variation of variations) {
    const vino = vinosBySquareId.get(variation.variationId) || vinosBySquareId.get(variation.itemId)
    if (!vino) continue

    const patch = {}
    if (pricesDiffer(vino.precio_pvp, variation.precio_pvp)) patch.precio_pvp = variation.precio_pvp
    if (variation.itemId && vino.square_catalog_id !== variation.itemId) patch.square_catalog_id = variation.itemId
    if (variation.variationId && vino.square_variation_id !== variation.variationId) patch.square_variation_id = variation.variationId

    if (!Object.keys(patch).length) continue

    patch.updated_at = now
    patch.square_last_seen_at = now
    const { error } = await supabaseAdmin
      .from('vinos_tienda')
      .update(patch)
      .eq('id', vino.id)

    if (error) {
      errores++
      console.error('[square-sync] catalog object update error:', vino.id, error.message)
    } else {
      actualizados++
    }
  }

  return {
    ok: errores === 0,
    actualizados,
    errores,
    total: variations.length,
    catalogObjectIds: ids,
  }
}

function detectarCategoria(itemData, categoryMap) {
  const catIds = [itemData.category_id, ...(itemData.categories || []).map(c => c.id)].filter(Boolean)
  for (const id of catIds) {
    if (categoryMap[id] && WINE_KEYWORDS.test(categoryMap[id])) return 'vino'
  }
  return 'otro'
}

function getSquareCategoryEntries(itemData, categoryMap) {
  const catIds = [itemData.category_id, ...(itemData.categories || []).map(c => c.id)].filter(Boolean)
  const uniqueIds = uniqueStrings(catIds)
  return uniqueIds.map(id => ({ id, name: categoryMap[id] || 'Sin nombre' }))
}

function summarizeByCategory(rows) {
  const summary = new Map()
  for (const row of rows) {
    const categories = row.square_categories?.length
      ? row.square_categories
      : [{ id: '__uncategorized__', name: 'Sin categoria' }]

    for (const category of categories) {
      const key = category.id || '__uncategorized__'
      const current = summary.get(key) || {
        id: category.id || null,
        name: category.name || 'Sin categoria',
        total: 0,
        nuevos: 0,
        actualizaciones: 0,
        sinCambios: 0,
        ejemplos: [],
      }
      current.total++
      if (row._planAction === 'insert') current.nuevos++
      if (row._planAction === 'update') current.actualizaciones++
      if (row._planAction === 'unchanged') current.sinCambios++
      if (current.ejemplos.length < 5) current.ejemplos.push(row.nombre)
      summary.set(key, current)
    }
  }

  return [...summary.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

function publicPlanRow(row) {
  return {
    id: row.id || null,
    nombre: row.nombre,
    categoria: row.categoria || null,
    precio_pvp: row.precio_pvp ?? null,
    stock: row.stock ?? null,
    activo: row.activo ?? null,
    square_catalog_id: row.square_catalog_id || row._catalogId || null,
    square_variation_id: row.square_variation_id || row._variationId || null,
    square_categories: row.square_categories || [],
    changes: row._changes || [],
  }
}

async function buildSquareSyncPlan(tiendaId, tiendaSlug, squareToken) {
  const token = (squareToken || '').trim()
  if (!token) throw new Error('No hay token de Square configurado para esta tienda')

  const { items: rawItems, imageMap, categoryMap } = await fetchAllCatalogItems(token)

  const seenItemIds = new Set()
  const items = rawItems.filter(item => {
    if (seenItemIds.has(item.id)) return false
    seenItemIds.add(item.id)
    return true
  })

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

  const PAGE = 1000
  let existentes = [], pageFrom = 0, existingReadQueries = 0
  while (true) {
    const { data: page, error: existError } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, square_catalog_id, square_variation_id, categoria, nombre, precio_pvp')
      .eq('tienda_id', tiendaId)
      .range(pageFrom, pageFrom + PAGE - 1)
    existingReadQueries++
    if (existError) throw new Error(`Leyendo existentes: ${existError.message}`)
    existentes = existentes.concat(page || [])
    if (!page || page.length < PAGE) break
    pageFrom += PAGE
  }

  const existingByCatalog   = {}
  const existingByVariation = {}
  const nullIdByNombre      = {}
  for (const v of (existentes || [])) {
    if (v.square_catalog_id)   existingByCatalog[v.square_catalog_id]   = { id: v.id, categoria: v.categoria, precio_pvp: v.precio_pvp, square_catalog_id: v.square_catalog_id, square_variation_id: v.square_variation_id }
    if (v.square_variation_id) existingByVariation[v.square_variation_id] = { id: v.id, categoria: v.categoria, precio_pvp: v.precio_pvp, square_catalog_id: v.square_catalog_id, square_variation_id: v.square_variation_id }
    if (!v.square_catalog_id && !v.square_variation_id && v.nombre) {
      if (!nullIdByNombre[v.nombre]) nullIdByNombre[v.nombre] = []
      nullIdByNombre[v.nombre].push({ id: v.id, categoria: v.categoria, precio_pvp: v.precio_pvp })
    }
  }

  const toUpsertById = []
  const toInsertNew = []
  const unchanged = []
  const skipped = []

  for (const item of items) {
    if (item.type !== 'ITEM') {
      skipped.push({ square_catalog_id: item.id, reason: `type:${item.type || 'unknown'}` })
      continue
    }
    const d = item.item_data || {}
    const rawNombre = d.name?.trim()
    if (!rawNombre) {
      skipped.push({ square_catalog_id: item.id, reason: 'missing_name' })
      continue
    }

    const { nombre, uva, bodega, region, pais } = parsearNombreSquare(rawNombre)
    const variationId = itemToVariation[item.id] || null
    const varData = (d.variations || []).find(v => !v.is_deleted)?.item_variation_data
    const precioCents = varData?.price_money?.amount
    const precio_pvp = precioCents ? +(precioCents / 100).toFixed(2) : null
    const descripcion = d.description_plaintext || d.description || null
    const foto_url = (d.image_ids || []).map(id => imageMap[id]).find(Boolean) || null
    const stock = itemStockMap[item.id] ?? 0
    const catDetectada = detectarCategoria(d, categoryMap)
    const squareCategories = getSquareCategoryEntries(d, categoryMap)

    const legacyVariationMatch = variationId ? existingByCatalog[variationId] : null
    const variationMatch = variationId ? existingByVariation[variationId] : null
    const existing = legacyVariationMatch || variationMatch || existingByCatalog[item.id]
    const catEfectiva = existing?.categoria || catDetectada
    const activo = !item.is_deleted && (catEfectiva !== 'vino' || stock > 0)
    const now = new Date().toISOString()

    if (existing) {
      const skipIdNormalization = Boolean(legacyVariationMatch && variationMatch && legacyVariationMatch.id !== variationMatch.id)
      const updatePrice = pricesDiffer(existing.precio_pvp, precio_pvp)
      const updateIds = !skipIdNormalization && (
        existing.square_catalog_id !== item.id ||
        (variationId && existing.square_variation_id !== variationId)
      )
      const changes = []
      if (updatePrice) changes.push('precio_pvp')
      if (updateIds) changes.push('square_ids')
      if (skipIdNormalization) changes.push('square_id_conflict_skipped')

      if (updatePrice || updateIds) {
        toUpsertById.push({
          id: existing.id,
          nombre,
          precio_pvp,
          square_last_seen_at: now,
          _catalogId: item.id,
          _variationId: variationId,
          _skipIdNormalization: skipIdNormalization,
          _updatePrice: updatePrice,
          _updateIds: updateIds,
          _planAction: 'update',
          _changes: changes,
          updated_at: now,
          square_categories: squareCategories,
        })
      } else {
        unchanged.push({
          id: existing.id,
          nombre,
          precio_pvp,
          categoria: catEfectiva,
          square_catalog_id: existing.square_catalog_id,
          square_variation_id: existing.square_variation_id,
          _planAction: 'unchanged',
          _changes: [],
          square_categories: squareCategories,
        })
      }
    } else {
      const nullMatches = nullIdByNombre[nombre]
      if (nullMatches?.length === 1) {
        const updatePrice = pricesDiffer(nullMatches[0].precio_pvp, precio_pvp)
        const changes = ['square_ids']
        if (updatePrice) changes.unshift('precio_pvp')
        toUpsertById.push({
          id:                   nullMatches[0].id,
          nombre,
          precio_pvp,
          square_last_seen_at:  now,
          _catalogId:           item.id,
          _variationId:         variationId,
          _skipIdNormalization: false,
          _updatePrice:         updatePrice,
          _updateIds:           true,
          _planAction:          'update',
          _changes:             changes,
          updated_at:           now,
          square_categories:    squareCategories,
        })
        nullIdByNombre[nombre] = []
      } else {
        toInsertNew.push({
          tienda_id:           tiendaId,
          square_catalog_id:   item.id,
          square_variation_id: variationId,
          nombre, precio_pvp, descripcion, stock, activo,
          categoria:           catEfectiva,
          square_last_seen_at: now,
          uva:        uva    || null,
          bodega:     bodega || null,
          region:     region || null,
          pais:       pais   || null,
          ...(foto_url && { foto_url }),
          updated_at: now,
          _planAction: 'insert',
          _changes: ['new_row'],
          square_categories: squareCategories,
        })
      }
    }
  }

  const priceUpdateRows = toUpsertById.filter(r => r._updatePrice)
  const idUpdateRows = toUpsertById.filter(r => r._updateIds && !r._skipIdNormalization)
  const newConVariacion = toInsertNew.filter(r => r.square_variation_id)
  const newSinVariacion = toInsertNew.filter(r => !r.square_variation_id)
  const planRows = [...toInsertNew, ...toUpsertById, ...unchanged]

  return {
    tiendaId,
    tiendaSlug,
    token,
    items,
    itemStockMap,
    toUpsertById,
    toInsertNew,
    newConVariacion,
    newSinVariacion,
    unchanged,
    skipped,
    stats: {
      rawCatalogItems: rawItems.length,
      dedupedCatalogItems: items.length,
      duplicateCatalogItems: rawItems.length - items.length,
      existingRowsRead: existentes.length,
      existingReadQueries,
      squareVariationIds: variationIds.length,
      stockSincronizados: Object.keys(itemStockMap).length,
      insertados: toInsertNew.length,
      actualizados: toUpsertById.length,
      sinCambios: unchanged.length,
      omitidos: skipped.length,
      priceUpdateRows: priceUpdateRows.length,
      idUpdateRows: idUpdateRows.length,
      newConVariacion: newConVariacion.length,
      newSinVariacion: newSinVariacion.length,
      estimatedWriteStatements: priceUpdateRows.length + idUpdateRows.length + newConVariacion.length + newSinVariacion.length,
    },
    categories: summarizeByCategory(planRows),
  }
}

export async function squareSyncDryRunForTienda(tiendaId, tiendaSlug, squareToken) {
  const plan = await buildSquareSyncPlan(tiendaId, tiendaSlug, squareToken)
  const syncPaused = isSquareSyncTemporarilyPaused({ id: tiendaId, slug: tiendaSlug })

  return {
    ok: true,
    dryRun: true,
    writes: false,
    syncPaused,
    slug: tiendaSlug || null,
    tiendaId,
    resumen: plan.stats,
    categorias: plan.categories,
    muestras: {
      nuevos: plan.toInsertNew.slice(0, 25).map(publicPlanRow),
      actualizaciones: plan.toUpsertById.slice(0, 25).map(publicPlanRow),
      sinCambios: plan.unchanged.slice(0, 10).map(publicPlanRow),
      omitidos: plan.skipped.slice(0, 25),
    },
  }
}

async function buildSquareStockReconcilePlan(tiendaId, tiendaSlug, squareToken) {
  const token = (squareToken || '').trim()
  if (!token) throw new Error('No hay token de Square configurado para esta tienda')

  const { items: rawItems } = await fetchAllCatalogItems(token)
  const seenItemIds = new Set()
  const items = rawItems.filter(item => {
    if (seenItemIds.has(item.id)) return false
    seenItemIds.add(item.id)
    return true
  })

  const variationIds = [], variationToItem = {}, itemToVariation = {}
  for (const item of items) {
    if (item.type !== 'ITEM') continue
    const variation = (item.item_data?.variations || []).find(v => !v.is_deleted)
    if (variation?.id) {
      variationIds.push(variation.id)
      variationToItem[variation.id] = item.id
      itemToVariation[item.id] = variation.id
    }
  }

  const inventoryMap = await fetchInventoryCounts(variationIds, token)
  const itemStockMap = {}
  for (const [varId, qty] of Object.entries(inventoryMap)) {
    const itemId = variationToItem[varId]
    if (itemId !== undefined) itemStockMap[itemId] = qty
  }

  const PAGE = 1000
  let existentes = [], pageFrom = 0, existingReadQueries = 0
  while (true) {
    const { data: page, error: existError } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, nombre, stock, activo, categoria, square_catalog_id, square_variation_id')
      .eq('tienda_id', tiendaId)
      .range(pageFrom, pageFrom + PAGE - 1)
    existingReadQueries++
    if (existError) throw new Error(`Leyendo existentes para stock: ${existError.message}`)
    existentes = existentes.concat(page || [])
    if (!page || page.length < PAGE) break
    pageFrom += PAGE
  }

  const existingByCatalog = {}
  const existingByVariation = {}
  for (const vino of existentes) {
    if (vino.square_catalog_id) existingByCatalog[vino.square_catalog_id] = vino
    if (vino.square_variation_id) existingByVariation[vino.square_variation_id] = vino
  }

  const changes = []
  const unchanged = []
  const missing = []
  for (const item of items) {
    if (item.type !== 'ITEM') continue
    const variationId = itemToVariation[item.id] || null
    if (!variationId) continue

    const vino = existingByVariation[variationId] || existingByCatalog[item.id] || existingByCatalog[variationId]
    const targetStock = itemStockMap[item.id] ?? 0
    const targetActivo = targetStock > 0

    if (!vino) {
      missing.push({
        square_catalog_id: item.id,
        square_variation_id: variationId,
        nombre: item.item_data?.name || null,
        squareStock: targetStock,
      })
      continue
    }

    const currentStock = vino.stock || 0
    const currentActivo = Boolean(vino.activo)
    const row = {
      id: vino.id,
      nombre: vino.nombre,
      categoria: vino.categoria || 'otro',
      square_catalog_id: vino.square_catalog_id || item.id,
      square_variation_id: vino.square_variation_id || variationId,
      currentStock,
      squareStock: targetStock,
      currentActivo,
      targetActivo,
      stockDelta: targetStock - currentStock,
    }

    if (currentStock !== targetStock || currentActivo !== targetActivo) {
      changes.push(row)
    } else {
      unchanged.push(row)
    }
  }

  const byCategory = new Map()
  for (const row of changes) {
    const key = row.categoria || 'otro'
    const current = byCategory.get(key) || {
      categoria: key,
      cambios: 0,
      suben: 0,
      bajan: 0,
      quedanIgualActivo: 0,
      ejemplos: [],
    }
    current.cambios++
    if (row.stockDelta > 0) current.suben++
    if (row.stockDelta < 0) current.bajan++
    if (row.currentActivo !== row.targetActivo) current.quedanIgualActivo++
    if (current.ejemplos.length < 10) {
      current.ejemplos.push({
        nombre: row.nombre,
        stockActual: row.currentStock,
        stockSquare: row.squareStock,
        activoActual: row.currentActivo,
        activoNuevo: row.targetActivo,
      })
    }
    byCategory.set(key, current)
  }

  return {
    tiendaId,
    tiendaSlug,
    changes,
    unchanged,
    missing,
    stats: {
      rawCatalogItems: rawItems.length,
      dedupedCatalogItems: items.length,
      squareVariationIds: variationIds.length,
      stockCountsRead: Object.keys(itemStockMap).length,
      existingRowsRead: existentes.length,
      existingReadQueries,
      cambiosStock: changes.length,
      sinCambios: unchanged.length,
      noVinculados: missing.length,
      estimatedWriteStatements: changes.length,
      subenStock: changes.filter(row => row.stockDelta > 0).length,
      bajanStock: changes.filter(row => row.stockDelta < 0).length,
      cambianActivo: changes.filter(row => row.currentActivo !== row.targetActivo).length,
    },
    categorias: [...byCategory.values()].sort((a, b) => b.cambios - a.cambios || a.categoria.localeCompare(b.categoria)),
  }
}

function publicStockRow(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    categoria: row.categoria,
    square_catalog_id: row.square_catalog_id,
    square_variation_id: row.square_variation_id,
    stockActual: row.currentStock,
    stockSquare: row.squareStock,
    delta: row.stockDelta,
    activoActual: row.currentActivo,
    activoNuevo: row.targetActivo,
  }
}

export async function squareStockReconcileDryRunForTienda(tiendaId, tiendaSlug, squareToken) {
  const plan = await buildSquareStockReconcilePlan(tiendaId, tiendaSlug, squareToken)
  return {
    ok: true,
    dryRun: true,
    reconcileStock: true,
    writes: false,
    syncPaused: isSquareSyncTemporarilyPaused({ id: tiendaId, slug: tiendaSlug }),
    slug: tiendaSlug || null,
    tiendaId,
    resumen: plan.stats,
    categorias: plan.categorias,
    muestras: {
      cambios: plan.changes.slice(0, 50).map(publicStockRow),
      suben: plan.changes.filter(row => row.stockDelta > 0).slice(0, 25).map(publicStockRow),
      bajan: plan.changes.filter(row => row.stockDelta < 0).slice(0, 25).map(publicStockRow),
      noVinculados: plan.missing.slice(0, 25),
    },
  }
}

export async function squareStockReconcileForTienda(tiendaId, tiendaSlug, squareToken) {
  if (isSquareSyncTemporarilyPaused({ id: tiendaId, slug: tiendaSlug })) {
    return {
      ...squareSyncPausedPayload({ id: tiendaId, slug: tiendaSlug }, 'stock_reconcile'),
      ok: false,
      reconcileStock: true,
      actualizados: 0,
      errores: 0,
    }
  }

  const plan = await buildSquareStockReconcilePlan(tiendaId, tiendaSlug, squareToken)
  const now = new Date().toISOString()
  let actualizados = 0
  let errores = 0
  const lineas = []

  const UPDATE_CONCURRENCY = 25
  for (let i = 0; i < plan.changes.length; i += UPDATE_CONCURRENCY) {
    const chunk = plan.changes.slice(i, i + UPDATE_CONCURRENCY)
    await Promise.all(chunk.map(async row => {
      const { error } = await supabaseAdmin
        .from('vinos_tienda')
        .update({ stock: row.squareStock, activo: row.targetActivo, updated_at: now })
        .eq('id', row.id)

      if (error) errores++
      else actualizados++
      lineas.push({ ...publicStockRow(row), status: error ? 'error' : 'ok' })
      if (error) console.error('[square-sync] stock reconcile error:', row.id, error.message)
    }))
  }

  return {
    ok: errores === 0,
    reconcileStock: true,
    actualizados,
    errores,
    total: plan.changes.length,
    resumenAntes: plan.stats,
    lineas: lineas.slice(0, 100),
  }
}

export async function squareSyncForTienda(tiendaId, tiendaSlug, squareToken) {
  if (isSquareSyncTemporarilyPaused({ id: tiendaId, slug: tiendaSlug })) {
    console.warn(`[square-sync] ${tiendaSlug || tiendaId}: pausa temporal activa`)
    return {
      ...squareSyncPausedPayload({ id: tiendaId, slug: tiendaSlug }, 'square_sync_for_tienda'),
      insertados: 0,
      actualizados: 0,
      errores: 0,
      total: 0,
      stockSincronizados: 0,
    }
  }

  const token = (squareToken || '').trim()
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

  // Leer TODAS las filas de esta tienda paginando de 1000 en 1000
  // (Supabase/PostgREST tiene max_rows=1000 por defecto; .limit() no lo sobreescribe)
  const PAGE = 1000
  let existentes = [], pageFrom = 0
  while (true) {
    const { data: page, error: existError } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, square_catalog_id, square_variation_id, categoria, nombre, precio_pvp')
      .eq('tienda_id', tiendaId)
      .range(pageFrom, pageFrom + PAGE - 1)
    if (existError) throw new Error(`Leyendo existentes: ${existError.message}`)
    existentes = existentes.concat(page || [])
    if (!page || page.length < PAGE) break
    pageFrom += PAGE
  }

  const existingByCatalog   = {}
  const existingByVariation = {}
  const nullIdByNombre      = {} // vinos sin IDs Square, para fusionar en lugar de duplicar
  for (const v of (existentes || [])) {
    if (v.square_catalog_id)   existingByCatalog[v.square_catalog_id]   = { id: v.id, categoria: v.categoria, precio_pvp: v.precio_pvp, square_catalog_id: v.square_catalog_id, square_variation_id: v.square_variation_id }
    if (v.square_variation_id) existingByVariation[v.square_variation_id] = { id: v.id, categoria: v.categoria, precio_pvp: v.precio_pvp, square_catalog_id: v.square_catalog_id, square_variation_id: v.square_variation_id }
    if (!v.square_catalog_id && !v.square_variation_id && v.nombre) {
      if (!nullIdByNombre[v.nombre]) nullIdByNombre[v.nombre] = []
      nullIdByNombre[v.nombre].push({ id: v.id, categoria: v.categoria, precio_pvp: v.precio_pvp })
    }
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

    const legacyVariationMatch = variationId ? existingByCatalog[variationId] : null
    const variationMatch = variationId ? existingByVariation[variationId] : null
    const existing = legacyVariationMatch || variationMatch || existingByCatalog[item.id]

    const catEfectiva = existing?.categoria || catDetectada
    const activo      = !item.is_deleted && (catEfectiva !== 'vino' || stock > 0)

    const now = new Date().toISOString()

    if (existing) {
      const skipIdNormalization = Boolean(legacyVariationMatch && variationMatch && legacyVariationMatch.id !== variationMatch.id)
      const updatePrice = pricesDiffer(existing.precio_pvp, precio_pvp)
      const updateIds = !skipIdNormalization && (
        existing.square_catalog_id !== item.id ||
        (variationId && existing.square_variation_id !== variationId)
      )

      if (updatePrice || updateIds) {
        toUpsertById.push({
          id: existing.id,
          precio_pvp,
          square_last_seen_at: now,
          _catalogId: item.id,
          _variationId: variationId,
          _skipIdNormalization: skipIdNormalization,
          _updatePrice: updatePrice,
          _updateIds: updateIds,
          updated_at: now,
        })
      }
    } else {
      // Fusionar con vino sin IDs Square si el nombre coincide de forma unívoca (1:1).
      // Si hay múltiples sin IDs con el mismo nombre, no fusionar (demasiado ambiguo).
      const nullMatches = nullIdByNombre[nombre]
      if (nullMatches?.length === 1) {
        const updatePrice = pricesDiffer(nullMatches[0].precio_pvp, precio_pvp)
        toUpsertById.push({
          id:                   nullMatches[0].id,
          precio_pvp,
          square_last_seen_at:  now,
          _catalogId:           item.id,
          _variationId:         variationId,
          _skipIdNormalization: false,
          _updatePrice:         updatePrice,
          _updateIds:           true,
          updated_at:           now,
        })
        nullIdByNombre[nombre] = [] // consumido: evitar que otro item Square reclame el mismo registro
      } else {
        toInsertNew.push({
          tienda_id:           tiendaId,
          square_catalog_id:   item.id,
          square_variation_id: variationId,
          nombre, precio_pvp, descripcion, stock, activo,
          categoria:           catEfectiva,
          square_last_seen_at: now,
          uva:        uva    || null,
          bodega:     bodega || null,
          region:     region || null,
          pais:       pais   || null,
          ...(foto_url && { foto_url }),
          updated_at: now,
        })
      }
    }
  }

  // Nuevos: separar los que tienen variation_id (upsert seguro) de los que no (insert clásico)
  const newConVariacion    = toInsertNew.filter(r => r.square_variation_id)
  const newSinVariacion    = toInsertNew.filter(r => !r.square_variation_id)

  const countNuevos = toInsertNew.length
  const countAct    = toUpsertById.length

  if (toInsertNew.length > 0) {
    const muestra = toInsertNew.slice(0, 30).map(r => `"${r.nombre}" [cat:${r.square_catalog_id?.slice(0,8)} var:${r.square_variation_id?.slice(0,8)}]`).join(', ')
    console.log(`[square-sync] ${tiendaSlug || tiendaId}: lookup miss (${toInsertNew.length}): ${muestra}`)
  }

  let errores = 0
  const BATCH = 500

  // Existentes → update puro por id (no requiere columnas NOT NULL que no tocamos)
  const UPDATE_CONCURRENCY = 50
  for (let i = 0; i < toUpsertById.length; i += UPDATE_CONCURRENCY) {
    const chunk = toUpsertById.slice(i, i + UPDATE_CONCURRENCY)
    const priceUpdates = chunk.filter(r => r._updatePrice)
    const idUpdates = chunk.filter(r => r._updateIds && !r._skipIdNormalization)

    // Paso 1: precio + last_seen (siempre, crítico)
    await Promise.all(priceUpdates.map(({ id, precio_pvp, updated_at, square_last_seen_at }) =>
      supabaseAdmin.from('vinos_tienda')
        .update({ precio_pvp, updated_at, square_last_seen_at })
        .eq('id', id)
        .then(({ error }) => {
          if (error) { console.error('[square-sync] update(precio) error:', id, error.message); errores++ }
        })
    ))

    // Paso 2: normalizar ids Square heredados de imports antiguos.
    await Promise.all(idUpdates.map(({ id, _catalogId, _variationId, updated_at, square_last_seen_at }) => {
      const idsUpdate = { square_catalog_id: _catalogId, updated_at, square_last_seen_at }
      if (_variationId) idsUpdate.square_variation_id = _variationId
      return supabaseAdmin.from('vinos_tienda')
        .update(idsUpdate)
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[square-sync] update(ids) error:', id, error.message)
        })
    }))
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
