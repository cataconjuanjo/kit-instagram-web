import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { squareSyncForTienda } from '../../_lib/squareSync'

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

// ── Catalog upsert handler ────────────────────────────────────────────────────
async function handleCatalogUpdate() {
  // Fetch all active tiendas with Square integration
  const { data: tiendas, error: tiendasErr } = await supabaseAdmin
    .from('tiendas')
    .select('id, slug')
    .eq('activo', true)

  if (tiendasErr || !tiendas?.length) {
    console.error('[square-webhook] No se encontraron tiendas activas:', tiendasErr?.message)
    return NextResponse.json({ ok: true, skipped: 'no_tiendas' })
  }

  // Delegate to squareSyncForTienda which handles orphan detection,
  // categoria preservation, activo calculation, and idempotent upserts.
  const results = []
  for (const tienda of tiendas) {
    const result = await squareSyncForTienda(tienda.id, tienda.slug)
    console.log(`[square-webhook] catalog.version.updated [${tienda.slug}] → ${result.insertados} nuevos, ${result.actualizados} act., ${result.errores} errores`)
    results.push({ slug: tienda.slug, ...result })
  }

  const totalErrores = results.reduce((s, r) => s + r.errores, 0)
  return NextResponse.json({ ok: totalErrores === 0, results })
}

// ── Inventory restock handler ─────────────────────────────────────────────────
async function handleInventoryUpdate(event) {
  const counts = event.data?.object?.inventory_counts || []
  let actualizados = 0
  const categoriasActualizadas = []

  for (const count of counts) {
    if (count.state !== 'IN_STOCK') continue
    const catalogId  = count.catalog_object_id
    const nuevoStock = Math.max(0, parseInt(count.quantity, 10) || 0)

    // inventory_counts también usa variation IDs — buscar por square_variation_id primero
    let { data: vino } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, stock, categoria')
      .eq('square_variation_id', catalogId)
      .maybeSingle()
    if (!vino) {
      ;({ data: vino } = await supabaseAdmin
        .from('vinos_tienda')
        .select('id, stock, categoria')
        .eq('square_catalog_id', catalogId)
        .maybeSingle())
    }

    if (!vino) continue

    // Solo actualizamos si el stock sube (reposición) — las ventas las gestiona payment.updated
    if (nuevoStock <= (vino.stock || 0)) continue

    await supabaseAdmin
      .from('vinos_tienda')
      .update({ stock: nuevoStock, activo: true, updated_at: new Date().toISOString() })
      .eq('id', vino.id)

    actualizados++
    categoriasActualizadas.push(vino.categoria || 'otro')
  }

  const nVinos = categoriasActualizadas.filter(c => c === 'vino').length
  const nOtros = categoriasActualizadas.filter(c => c !== 'vino').length
  console.log(`[square-webhook] inventory.count.updated: ${actualizados} productos actualizados (${nVinos} vino, ${nOtros} otro)`)
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
    return handleCatalogUpdate()
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

  // Idempotencia nivel evento: mismo event_id ya procesado
  const { data: yaExiste } = await supabaseAdmin
    .from('square_sync_log')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle()

  if (yaExiste) {
    return NextResponse.json({ ok: true, duplicate: 'event' })
  }

  const payment = event.data?.object?.payment
  if (!payment?.order_id) {
    return NextResponse.json({ ok: true, skipped: 'no order_id' })
  }

  const paymentId  = payment.id
  const orderId    = payment.order_id
  const locationId = payment.location_id || null

  // Resolver tienda por square_location_id; fallback a la primera tienda activa con Square
  let tiendaSlug = 'sibaris-gourmet'
  if (locationId) {
    const { data: tiendaPorLocation } = await supabaseAdmin
      .from('tiendas')
      .select('slug')
      .eq('square_location_id', locationId)
      .eq('activo', true)
      .maybeSingle()
    if (tiendaPorLocation) tiendaSlug = tiendaPorLocation.slug
  }

  // Idempotencia nivel pago: mismo payment_id ya descontó stock en un evento anterior
  const { data: pagoAnterior } = await supabaseAdmin
    .from('square_sync_log')
    .select('id, lineas')
    .eq('payment_id', paymentId)
    .eq('ok', true)
    .maybeSingle()

  const yaDescontado = pagoAnterior?.lineas?.some(l => l.status === 'ok')
  if (yaDescontado) {
    await supabaseAdmin.from('square_sync_log').insert({
      event_id:    eventId,
      payment_id:  paymentId,
      order_id:    orderId,
      tienda_slug: tiendaSlug,
      lineas:      [],
      ok:          true,
      error_msg:   'already_processed',
    })
    console.log(`[square-webhook] Pago ${paymentId} ya procesado, evento ${eventId} ignorado`)
    return NextResponse.json({ ok: true, duplicate: 'payment', payment_id: paymentId })
  }

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

      // catalog_object_id en pedidos Square es el ID de variación (ITEM_VARIATION),
      // no el ITEM — buscamos primero por square_variation_id y usamos square_catalog_id como fallback
      let { data: vino } = await supabaseAdmin
        .from('vinos_tienda')
        .select('id, nombre, stock, categoria')
        .eq('square_variation_id', catalogId)
        .maybeSingle()
      if (!vino) {
        ;({ data: vino } = await supabaseAdmin
          .from('vinos_tienda')
          .select('id, nombre, stock, categoria')
          .eq('square_catalog_id', catalogId)
          .maybeSingle())
      }

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
        categoria: vino.categoria || 'otro',
        stock_antes: vino.stock,
        stock_despues: nuevoStock,
        status: updateErr ? 'error' : 'ok',
      })
    }
  } catch (e) {
    errMsg = e.message
    console.error('[square-webhook] Error procesando pago:', e.message)
  }

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

  const lineasOk    = lineas.filter(l => l.status === 'ok')
  const actualizados = lineasOk.length
  const nVinos  = lineasOk.filter(l => l.categoria === 'vino').length
  const nOtros  = lineasOk.filter(l => l.categoria !== 'vino').length
  console.log(`[square-webhook] Pago ${paymentId}: ${actualizados}/${lineas.length} productos actualizados (${nVinos} vino, ${nOtros} otro)`)

  return NextResponse.json({ ok: true, lineas })
}
