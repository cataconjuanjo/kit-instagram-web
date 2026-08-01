import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN
const SQUARE_API_BASE     = 'https://connect.squareup.com'

async function fetchAllCatalogItems() {
  if (!SQUARE_ACCESS_TOKEN) throw new Error('SQUARE_ACCESS_TOKEN no configurado en Vercel')

  const items    = []
  const imageMap = {}
  let cursor     = null

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
      if (rel.type === 'IMAGE' && rel.image_data?.url) {
        imageMap[rel.id] = rel.image_data.url
      }
    }
    cursor = data.cursor || null
  } while (cursor)

  return { items, imageMap }
}

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 403 })

  try {
    const { items, imageMap } = await fetchAllCatalogItems()

    // 1 sola consulta: todos los vinos de esta tienda que ya tienen square_catalog_id
    const { data: existentes } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, square_catalog_id')
      .eq('tienda_slug', slug)
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

      const base = {
        nombre,
        precio_pvp,
        descripcion,
        ...(foto_url && { foto_url }),
        activo:     !item.is_deleted,
        updated_at: new Date().toISOString(),
      }

      if (existingMap[item.id]) {
        toUpdate.push({ id: existingMap[item.id], ...base })
      } else {
        toInsert.push({ tienda_slug: slug, square_catalog_id: item.id, stock: 0, ...base })
      }
    }

    let insertados = 0, actualizados = 0, errores = 0

    // 1 sola INSERT batch para todos los nuevos
    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from('vinos_tienda').insert(toInsert)
      if (error) { console.error('[square-sync] insert error:', error.message); errores += toInsert.length }
      else insertados = toInsert.length
    }

    // 1 sola UPSERT batch para los existentes (Supabase upsert por id)
    if (toUpdate.length > 0) {
      const { error } = await supabaseAdmin
        .from('vinos_tienda')
        .upsert(toUpdate, { onConflict: 'id' })
      if (error) { console.error('[square-sync] upsert error:', error.message); errores += toUpdate.length }
      else actualizados = toUpdate.length
    }

    console.log(`[square-sync] ${slug}: ${insertados} nuevos, ${actualizados} actualizados, ${errores} errores`)
    return NextResponse.json({ ok: true, insertados, actualizados, errores, total: items.length })
  } catch (e) {
    console.error('[square-sync]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
