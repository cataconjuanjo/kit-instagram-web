import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const SQUARE_ACCESS_TOKEN    = process.env.SQUARE_ACCESS_TOKEN
const SQUARE_SIGNATURE_KEY   = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
const SQUARE_API_BASE        = 'https://connect.squareup.com'

// ── Signature verification ────────────────────────────────────────────────────
function verifySignature(rawBody, signatureHeader, webhookUrl) {
  if (!SQUARE_SIGNATURE_KEY) {
    console.warn('[square-webhook] SQUARE_WEBHOOK_SIGNATURE_KEY no configurada — verificación desactivada')
    return true
  }
  const expected = crypto
    .createHmac('sha256', SQUARE_SIGNATURE_KEY)
    .update(webhookUrl + rawBody)
    .digest('base64')
  return expected === signatureHeader
}

// ── Fetch order from Square API ───────────────────────────────────────────────
async function fetchOrder(orderId) {
  const res = await fetch(`${SQUARE_API_BASE}/v2/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      'Square-Version': '2024-01-18',
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Square Orders API ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return json.order
}

const WINE_KEYWORDS = /vino|wine|bodega|winery/i

function detectarCategoria(itemData, categoryMap) {
  const catIds = [itemData.category_id, ...(itemData.categories || []).map(c => c.id)].filter(Boolean)
  for (const id of catIds) {
    if (categoryMap[id] && WINE_KEYWORDS.test(categoryMap[id])) return 'vino'
  }
  return 'otro'
}

async function searchRecentCatalogItems() {
  const items       = []
  const imageMap    = {}
  const categoryMap = {}
  let cursor = null
  do {
    const body = { object_types: ['ITEM'], include_related_objects: true }
    if (cursor) body.cursor = cursor
    const res = await fetch(`${SQUARE_API_BASE}/v2/catalog/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Square Catalog API ${res.status}: ${await res.text()}`)
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

// ── Catalog upsert handler ────────────────────────────────────────────────────
async function handleCatalogUpdate(tiendaSlug) {
  // Resolve slug → tienda_id
  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id')
    .eq('slug', tiendaSlug)
    .single()

  if (!tienda) {
    console.error(`[square-webhook] Tienda no encontrada: ${tiendaSlug}`)
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }
  const tiendaId = tienda.id

  // Square no incluye qué cambió en el evento — buscamos todos los ITEM
  const { items, imageMap, categoryMap } = await searchRecentCatalogItems()

  // Fetch existing wines with square_catalog_id for this store (batch)
  const { data: existentes } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, square_catalog_id')
    .eq('tienda_id', tiendaId)
    .not('square_catalog_id', 'is', null)

  const existingMap = {}
  for (const v of (existentes || [])) existingMap[v.square_catalog_id] = v.id

  const toInsert = [], toUpdate = []

  for (const item of items) {
    if (item.type !== 'ITEM') continue
    const d = item.item_data || {}
    const nombre = d.name?.trim()
    if (!nombre) continue

    const varData = (d.variations || []).find(v => !v.is_deleted)?.item_variation_data
    const precioCents = varData?.price_money?.amount
    const precio_pvp = precioCents ? +(precioCents / 100).toFixed(2) : null
    const descripcion = d.description_plaintext || d.description || null
    const foto_url = (d.image_ids || []).map(id => imageMap[id]).find(Boolean) || null

    const base = {
      nombre, precio_pvp, descripcion,
      ...(foto_url && { foto_url }),
      activo: !item.is_deleted,
      updated_at: new Date().toISOString(),
    }

    if (existingMap[item.id]) {
      toUpdate.push({ id: existingMap[item.id], ...base })
    } else {
      toInsert.push({ tienda_id: tiendaId, square_catalog_id: item.id, stock: 0, categoria: detectarCategoria(d, categoryMap), ...base })
    }
  }

  let insertados = 0, actualizados = 0, errores = 0

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from('vinos_tienda').insert(toInsert)
    error ? (errores += toInsert.length, console.error('[square-webhook] insert error:', error.message)) : (insertados = toInsert.length)
  }
  if (toUpdate.length > 0) {
    const { error } = await supabaseAdmin.from('vinos_tienda').upsert(toUpdate, { onConflict: 'id' })
    error ? (errores += toUpdate.length, console.error('[square-webhook] upsert error:', error.message)) : (actualizados = toUpdate.length)
  }

  console.log(`[square-webhook] catalog.version.updated → ${insertados} nuevos, ${actualizados} actualizados, ${errores} errores`)
  return NextResponse.json({ ok: true, insertados, actualizados, errores })
}

// ── Inventory restock handler ─────────────────────────────────────────────────
async function handleInventoryUpdate(event) {
  const counts = event.data?.object?.inventory_counts || []
  let actualizados = 0

  for (const count of counts) {
    if (count.state !== 'IN_STOCK') continue
    const catalogId  = count.catalog_object_id
    const nuevoStock = Math.max(0, parseInt(count.quantity, 10) || 0)

    const { data: vino } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, stock')
      .eq('square_catalog_id', catalogId)
      .single()

    if (!vino) continue

    // Solo actualizamos si el stock sube (reposición) — las ventas las gestiona payment.updated
    if (nuevoStock <= (vino.stock || 0)) continue

    await supabaseAdmin
      .from('vinos_tienda')
      .update({ stock: nuevoStock, activo: true, updated_at: new Date().toISOString() })
      .eq('id', vino.id)

    actualizados++
  }

  console.log(`[square-webhook] inventory.count.updated: ${actualizados} vinos actualizados`)
  return NextResponse.json({ ok: true, actualizados })
}

// ── POST handler ──────────────────────────────────────────────────────────────
export async function POST(request) {
  const rawBody = await request.text()
  const sig     = request.headers.get('x-square-hmacsha256-signature') || ''
  const url     = `${request.nextUrl.protocol}//${request.nextUrl.host}/api/webhooks/square`

  if (!verifySignature(rawBody, sig, url)) {
    console.error('[square-webhook] Firma inválida')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event
  try { event = JSON.parse(rawBody) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventId = event.event_id
  const type    = event.type

  // Catálogo: nuevo producto / modificación
  if (type === 'catalog.version.updated') {
    return handleCatalogUpdate('sibaris-gourmet')
  }

  // Reposición de stock
  if (type === 'inventory.count.updated') {
    return handleInventoryUpdate(event)
  }

  // Solo procesamos payment.updated con status COMPLETED
  if (type !== 'payment.updated') {
    return NextResponse.json({ ok: true, skipped: type })
  }

  const paymentStatus = event.data?.object?.payment?.status
  if (paymentStatus !== 'COMPLETED') {
    return NextResponse.json({ ok: true, skipped: `status:${paymentStatus}` })
  }

  // Idempotencia: check if already processed
  const { data: yaExiste } = await supabaseAdmin
    .from('square_sync_log')
    .select('id')
    .eq('event_id', eventId)
    .single()

  if (yaExiste) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const payment = event.data?.object?.payment
  if (!payment?.order_id) {
    return NextResponse.json({ ok: true, skipped: 'no order_id' })
  }

  const paymentId = payment.id
  const orderId   = payment.order_id

  let order, lineas = [], errMsg = null
  try {
    order = await fetchOrder(orderId)

    // Filter to sold item line items only
    const lineItems = (order.line_items || []).filter(li =>
      li.item_type === 'ITEM' && li.catalog_object_id
    )

    // Decrementar stock por cada línea de venta
    for (const li of lineItems) {
      const catalogId = li.catalog_object_id
      const qty       = parseInt(li.quantity, 10) || 1

      const { data: vino } = await supabaseAdmin
        .from('vinos_tienda')
        .select('id, nombre, stock')
        .eq('square_catalog_id', catalogId)
        .single()

      if (!vino) {
        lineas.push({ catalog_object_id: catalogId, quantity: qty, status: 'not_found' })
        continue
      }

      const nuevoStock = Math.max(0, (vino.stock || 0) - qty)
      const { error: updateErr } = await supabaseAdmin
        .from('vinos_tienda')
        .update({ stock: nuevoStock, activo: nuevoStock > 0, updated_at: new Date().toISOString() })
        .eq('id', vino.id)

      lineas.push({
        catalog_object_id: catalogId,
        quantity: qty,
        vino_id: vino.id,
        vino_nombre: vino.nombre,
        stock_antes: vino.stock,
        stock_despues: nuevoStock,
        status: updateErr ? 'error' : 'ok',
      })
    }
  } catch (e) {
    errMsg = e.message
    console.error('[square-webhook] Error procesando pago:', e.message)
  }

  // Determine tienda slug from the merchant info or location
  const tiendaSlug = 'sibaris-gourmet'

  // Log the processed event (for idempotency + audit)
  await supabaseAdmin.from('square_sync_log').insert({
    event_id:    eventId,
    payment_id:  paymentId,
    order_id:    orderId,
    tienda_slug: tiendaSlug,
    lineas,
    ok:          !errMsg,
    error_msg:   errMsg,
  })

  if (errMsg) {
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }

  const actualizados = lineas.filter(l => l.status === 'ok').length
  console.log(`[square-webhook] Pago ${paymentId}: ${actualizados}/${lineas.length} vinos actualizados`)

  return NextResponse.json({ ok: true, lineas })
}
