import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

const SQUARE_ACCESS_TOKEN  = process.env.SQUARE_ACCESS_TOKEN
const SQUARE_API_BASE      = 'https://connect.squareup.com'

const WINE_KEYWORDS     = /vino|wine|bodega|winery/i
const PREFIJOS_INTERNOS = /^\s*(V[A-Z]{2,3}|BOT|RBN|RTN|AOC|AOP)\s+/i

// Extrae nombre limpio y campos adicionales del formato Square: "VBN Nombre I Uva I Bodega X I DO Y"
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

// Inventory API — variation IDs en lotes de 100 (límite Square)
async function fetchInventoryCounts(variationIds) {
  if (!variationIds.length || !SQUARE_ACCESS_TOKEN) return {}
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
          Authorization:    `Bearer ${SQUARE_ACCESS_TOKEN}`,
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

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 403 })

  try {
    const { items, imageMap, categoryMap } = await fetchAllCatalogItems()
    const tiendaId = access.tienda.id

    // Mapas de variación: variationId ↔ item.id
    const variationIds    = []
    const variationToItem = {}
    const itemToVariation = {}
    for (const item of items) {
      if (item.type !== 'ITEM') continue
      const variation = (item.item_data?.variations || []).find(v => !v.is_deleted)
      if (variation?.id) {
        variationIds.push(variation.id)
        variationToItem[variation.id] = item.id
        itemToVariation[item.id]      = variation.id
      }
    }

    // Stock real desde Square Inventory API (keyed por variation ID)
    const inventoryMap = await fetchInventoryCounts(variationIds)

    // Pasar stock a item.id
    const itemStockMap = {}
    for (const [varId, qty] of Object.entries(inventoryMap)) {
      const itemId = variationToItem[varId]
      if (itemId !== undefined) itemStockMap[itemId] = qty
    }

    // Existentes por tienda_id — evita el límite de URL de .in() con 1000+ IDs
    const { data: existentes, error: existError } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, square_catalog_id')
      .eq('tienda_id', tiendaId)
      .not('square_catalog_id', 'is', null)
    if (existError) throw new Error(`Leyendo existentes: ${existError.message}`)

    const existingMap = {}
    for (const v of (existentes || [])) existingMap[v.square_catalog_id] = v.id

    const toInsert = []
    const toUpdate = []

    for (const item of items) {
      if (item.type !== 'ITEM') continue
      const d         = item.item_data || {}
      const rawNombre = d.name?.trim()
      if (!rawNombre) continue

      const { nombre, uva, bodega, region, pais } = parsearNombreSquare(rawNombre)
      const variationId = itemToVariation[item.id] || null

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
        square_variation_id: variationId,
        ...(foto_url && { foto_url }),
        activo:     !item.is_deleted,
        updated_at: new Date().toISOString(),
      }

      if (existingMap[item.id]) {
        toUpdate.push({ id: existingMap[item.id], tienda_id: tiendaId, square_catalog_id: item.id, ...base })
      } else {
        toInsert.push({
          tienda_id:         tiendaId,
          square_catalog_id: item.id,
          stock,
          categoria:         detectarCategoria(d, categoryMap),
          ...(uva    && { uva }),
          ...(bodega && { bodega }),
          ...(region && { region }),
          ...(pais   && { pais }),
          ...base,
        })
      }
    }

    let insertados = 0, actualizados = 0, errores = 0

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from('vinos_tienda').insert(toInsert)
      if (error) {
        // Duplicate key = fila ya existe con tienda_id incorrecto; recuperar por square_catalog_id y reclasificar como update
        if (error.message.includes('duplicate key') || error.code === '23505') {
          console.warn('[square-sync] insert conflicto, rescatando por square_catalog_id...')
          const rescatados = []
          for (const row of toInsert) {
            const { data: existente } = await supabaseAdmin
              .from('vinos_tienda')
              .select('id')
              .eq('square_catalog_id', row.square_catalog_id)
              .maybeSingle()
            if (existente) rescatados.push({ ...row, id: existente.id })
            else errores++
          }
          if (rescatados.length > 0) {
            const { error: e2 } = await supabaseAdmin
              .from('vinos_tienda')
              .upsert(rescatados, { onConflict: 'id' })
            if (e2) { console.error('[square-sync] rescue upsert error:', e2.message); errores += rescatados.length }
            else { insertados = rescatados.length }
          }
        } else {
          console.error('[square-sync] insert error:', error.message)
          errores += toInsert.length
        }
      } else {
        insertados = toInsert.length
      }
    }

    if (toUpdate.length > 0) {
      const { error } = await supabaseAdmin
        .from('vinos_tienda')
        .upsert(toUpdate, { onConflict: 'id' })
      if (error) { console.error('[square-sync] upsert error:', error.message); errores += toUpdate.length }
      else actualizados = toUpdate.length
    }

    const stockSincronizados = Object.keys(itemStockMap).length
    console.log(`[square-sync] ${slug}: ${insertados} nuevos, ${actualizados} act., ${errores} errores, ${stockSincronizados} stock`)

    const status = errores > 0 && insertados === 0 && actualizados === 0 ? 500 : 200
    return NextResponse.json({ ok: errores === 0, insertados, actualizados, errores, total: items.length, stockSincronizados }, { status })
  } catch (e) {
    console.error('[square-sync]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
