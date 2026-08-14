import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import {
  fetchSquareJson,
  isSquareSyncGloballyPaused,
  isSquareSyncTemporarilyPaused,
  listSquareSyncTiendas,
  resolveSquareTiendaByLocation,
  selectVinosBySquareIds,
  squareActivoFromStock,
  squareCatalogUpdateForTiendaObjects,
  squareSyncPausedPayload,
} from '../../_lib/squareSync'

export const runtime = 'nodejs'
export const maxDuration = 20

const SQUARE_SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
const SQUARE_API_BASE = 'https://connect.squareup.com'
const LOG_SELECT = 'id, event_id, payment_id, order_id, tienda_slug, lineas, ok, error_msg'
const PROCESSING_PREFIX = 'processing:'
const PROCESSING_STALE_MS = 2 * 60 * 1000
const HANDLED_TYPES = new Set([
  'catalog.version.updated',
  'inventory.count.updated',
  'payment.updated',
])

function verifySignature(rawBody, signatureHeader, webhookUrl) {
  if (!SQUARE_SIGNATURE_KEY) {
    console.error('[square-webhook] SQUARE_WEBHOOK_SIGNATURE_KEY no configurada')
    return false
  }

  const expected = crypto
    .createHmac('sha256', SQUARE_SIGNATURE_KEY)
    .update(webhookUrl + rawBody)
    .digest('base64')

  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signatureHeader || '')
  return expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

function json(payload, status = 200) {
  return NextResponse.json(payload, { status })
}

function asRequired(value, fallback) {
  const text = String(value || '').trim()
  return text || fallback
}

function processingMark() {
  return `${PROCESSING_PREFIX}${Date.now()}`
}

function isDuplicateKeyError(error) {
  return error?.code === '23505' || /duplicate key|unique constraint/i.test(error?.message || '')
}

function isProcessingStale(errorMsg) {
  if (!String(errorMsg || '').startsWith(PROCESSING_PREFIX)) return false
  const startedAt = parseInt(String(errorMsg).slice(PROCESSING_PREFIX.length), 10)
  return Number.isFinite(startedAt) && Date.now() - startedAt > PROCESSING_STALE_MS
}

async function readSquareEventLog(eventId) {
  const { data, error } = await supabaseAdmin
    .from('square_sync_log')
    .select(LOG_SELECT)
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) throw new Error(`Leyendo square_sync_log: ${error.message}`)
  return data
}

async function claimSquareEvent({ eventId, type, paymentId, orderId, tiendaSlug }) {
  if (!eventId) return { claimed: true, log: null }

  const row = {
    event_id: eventId,
    payment_id: asRequired(paymentId, `event:${eventId}`),
    order_id: asRequired(orderId, type || 'unknown'),
    tienda_slug: asRequired(tiendaSlug, 'unknown'),
    lineas: [],
    ok: false,
    error_msg: processingMark(),
  }

  const { data, error } = await supabaseAdmin
    .from('square_sync_log')
    .insert(row)
    .select(LOG_SELECT)
    .maybeSingle()

  if (!error) return { claimed: true, log: data }

  if (!isDuplicateKeyError(error)) {
    console.error('[square-webhook] No se pudo reclamar event_id:', error.message)
    return {
      claimed: false,
      response: json({ ok: false, skipped: 'event_log_unavailable', event_id: eventId }),
    }
  }

  let existing
  try {
    existing = await readSquareEventLog(eventId)
  } catch (readErr) {
    console.error('[square-webhook] No se pudo leer event_id duplicado:', readErr.message)
    return {
      claimed: false,
      response: json({ ok: true, duplicate: 'event_log_read_failed', event_id: eventId }),
    }
  }
  if (!existing) return { claimed: true, log: null }

  if (existing.ok) {
    return {
      claimed: false,
      response: json({ ok: true, duplicate: 'event', event_id: eventId }),
    }
  }

  if (String(existing.error_msg || '').startsWith(PROCESSING_PREFIX) && !isProcessingStale(existing.error_msg)) {
    return {
      claimed: false,
      response: json({ ok: true, duplicate: 'event_in_progress', event_id: eventId }),
    }
  }

  const { error: updateErr } = await supabaseAdmin
    .from('square_sync_log')
    .update({
      payment_id: asRequired(paymentId, existing.payment_id || `event:${eventId}`),
      order_id: asRequired(orderId, existing.order_id || type || 'unknown'),
      tienda_slug: asRequired(tiendaSlug, existing.tienda_slug || 'unknown'),
      lineas: existing.lineas || [],
      ok: false,
      error_msg: processingMark(),
    })
    .eq('event_id', eventId)

  if (updateErr) {
    console.error('[square-webhook] No se pudo reintentar event_id:', updateErr.message)
    return {
      claimed: false,
      response: json({ ok: false, skipped: 'event_log_unavailable', event_id: eventId }),
    }
  }

  return { claimed: true, log: existing }
}

async function finishSquareEvent(eventId, patch = {}) {
  if (!eventId) return

  const update = {}
  for (const key of ['payment_id', 'order_id', 'tienda_slug', 'lineas', 'ok', 'error_msg']) {
    if (patch[key] !== undefined) update[key] = patch[key]
  }

  if (!Object.keys(update).length) return

  const { error } = await supabaseAdmin
    .from('square_sync_log')
    .update(update)
    .eq('event_id', eventId)

  if (error) console.error('[square-webhook] No se pudo cerrar square_sync_log:', error.message)
}

async function finishAndReturn(eventId, responsePayload, logPatch = {}, status = 200) {
  await finishSquareEvent(eventId, logPatch)
  return json(responsePayload, status)
}

async function fetchOrder(orderId, squareToken) {
  if (!squareToken) throw new Error('Token de Square no configurado para obtener la orden')
  const data = await fetchSquareJson(`${SQUARE_API_BASE}/v2/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${squareToken}`,
      'Square-Version': '2024-01-18',
      'Content-Type': 'application/json',
    },
  }, 'Square Orders API')
  return data.order
}

function extractCatalogObjectIds(event) {
  const ids = []
  const add = value => {
    const id = String(value || '').trim()
    if (id) ids.push(id)
  }

  const data = event.data || {}
  const object = data.object || {}
  const catalogObject = object.catalog_object || data.catalog_object || null

  if (data.type === 'catalog_object') add(data.id)
  if (catalogObject?.id) add(catalogObject.id)
  if (object.catalog_object_id) add(object.catalog_object_id)
  if (object.object?.id) add(object.object.id)
  if (object.type === 'ITEM' || object.type === 'ITEM_VARIATION') add(object.id)

  for (const item of object.catalog_objects || object.objects || []) add(item?.id)
  return [...new Set(ids)]
}

function parseQuantity(value) {
  const qty = parseInt(value, 10)
  return Number.isFinite(qty) && qty > 0 ? qty : 1
}

function groupInventoryCounts(event) {
  const groups = new Map()
  const counts = event.data?.object?.inventory_counts || []

  for (const count of counts) {
    if (count.state !== 'IN_STOCK' || !count.catalog_object_id) continue
    const locationId = count.location_id || event.location_id || null
    const groupKey = locationId || '__no_location__'
    if (!groups.has(groupKey)) groups.set(groupKey, { locationId, counts: new Map() })
    groups.get(groupKey).counts.set(count.catalog_object_id, Math.max(0, parseInt(count.quantity, 10) || 0))
  }

  return [...groups.values()]
}

async function handleCatalogUpdate(event, eventId) {
  const objectIds = extractCatalogObjectIds(event)
  if (!objectIds.length) {
    return finishAndReturn(
      eventId,
      { ok: true, skipped: 'catalog_update_without_object_ids', fullSync: false },
      {
        ok: true,
        lineas: [{ status: 'skipped', reason: 'catalog_update_without_object_ids' }],
        error_msg: 'catalog_update_without_object_ids',
      }
    )
  }

  try {
    const tiendas = await listSquareSyncTiendas()
    if (!tiendas.length) {
      return finishAndReturn(
        eventId,
        { ok: true, skipped: 'no_square_tiendas', fullSync: false, objectIds },
        { ok: true, lineas: [], error_msg: 'no_square_tiendas' }
      )
    }

    const results = []
    for (const tienda of tiendas) {
      const result = await squareCatalogUpdateForTiendaObjects(tienda.id, tienda.slug, tienda.squareToken, objectIds)
      results.push({ slug: tienda.slug, ...result })
    }

    const errores = results.reduce((sum, result) => sum + (result.errores || 0), 0)
    return finishAndReturn(
      eventId,
      { ok: errores === 0, fullSync: false, objectIds, results },
      {
        ok: errores === 0,
        lineas: results,
        error_msg: errores ? 'catalog_object_update_errors' : null,
      }
    )
  } catch (error) {
    console.error('[square-webhook] Error en catalog update:', error.message)
    return finishAndReturn(
      eventId,
      { ok: false, error: error.message, fullSync: false },
      { ok: false, lineas: [], error_msg: error.message }
    )
  }
}

async function handleInventoryUpdate(event, eventId) {
  const groups = groupInventoryCounts(event)
  if (!groups.length) {
    return finishAndReturn(
      eventId,
      { ok: true, skipped: 'no_inventory_counts' },
      { ok: true, lineas: [], error_msg: 'no_inventory_counts' }
    )
  }

  const lineas = []
  let actualizados = 0
  let errores = 0

  try {
    for (const group of groups) {
      const tienda = await resolveSquareTiendaByLocation(group.locationId)
      if (!tienda) {
        for (const [catalogId, quantity] of group.counts) {
          lineas.push({ catalog_object_id: catalogId, quantity, status: 'skipped', reason: 'no_tienda_for_location' })
        }
        continue
      }

      if (isSquareSyncTemporarilyPaused(tienda)) {
        for (const [catalogId, quantity] of group.counts) {
          lineas.push({ catalog_object_id: catalogId, quantity, tienda_slug: tienda.slug, status: 'skipped', reason: 'square_sync_paused' })
        }
        continue
      }

      const catalogIds = [...group.counts.keys()]
      const vinosBySquareId = await selectVinosBySquareIds(tienda.id, catalogIds, catalogIds)
      const now = new Date().toISOString()

      for (const [catalogId, nuevoStock] of group.counts) {
        const vino = vinosBySquareId.get(catalogId)
        if (!vino) {
          lineas.push({ catalog_object_id: catalogId, quantity: nuevoStock, tienda_slug: tienda.slug, status: 'not_found' })
          continue
        }

        const activo = squareActivoFromStock(vino, nuevoStock)
        if ((vino.stock || 0) === nuevoStock && Boolean(vino.activo) === activo) {
          lineas.push({
            catalog_object_id: catalogId,
            quantity: nuevoStock,
            tienda_slug: tienda.slug,
            vino_id: vino.id,
            status: 'unchanged',
          })
          continue
        }

        const { error } = await supabaseAdmin
          .from('vinos_tienda')
          .update({ stock: nuevoStock, activo, updated_at: now })
          .eq('id', vino.id)

        if (error) errores++
        else actualizados++

        lineas.push({
          catalog_object_id: catalogId,
          quantity: nuevoStock,
          tienda_slug: tienda.slug,
          vino_id: vino.id,
          vino_nombre: vino.nombre,
          categoria: vino.categoria || 'otro',
          stock_antes: vino.stock,
          stock_despues: nuevoStock,
          status: error ? 'error' : 'ok',
        })
      }
    }

    return finishAndReturn(
      eventId,
      { ok: errores === 0, actualizados, lineas },
      { ok: errores === 0, lineas, error_msg: errores ? 'inventory_update_errors' : null }
    )
  } catch (error) {
    console.error('[square-webhook] Error en inventory update:', error.message)
    return finishAndReturn(
      eventId,
      { ok: false, error: error.message, actualizados, lineas },
      { ok: false, lineas, error_msg: error.message }
    )
  }
}

async function handlePaymentUpdated(eventId, payment) {
  const paymentId = payment.id
  const orderId = payment.order_id
  const locationId = payment.location_id || null

  let tienda
  try {
    tienda = await resolveSquareTiendaByLocation(locationId)
  } catch (error) {
    console.error('[square-webhook] Error resolviendo tienda:', error.message)
    return finishAndReturn(
      eventId,
      { ok: false, error: error.message },
      { payment_id: paymentId, order_id: orderId, ok: false, error_msg: error.message }
    )
  }

  if (!tienda) {
    return finishAndReturn(
      eventId,
      { ok: true, skipped: 'no_tienda_for_location', payment_id: paymentId },
      {
        payment_id: paymentId,
        order_id: orderId,
        tienda_slug: 'unknown',
        lineas: [],
        ok: true,
        error_msg: 'no_tienda_for_location',
      }
    )
  }

  if (isSquareSyncTemporarilyPaused(tienda)) {
    console.warn(`[square-webhook] payment.updated [${tienda.slug}]: pausa temporal activa; payment_id="${paymentId}"`)
    return finishAndReturn(
      eventId,
      squareSyncPausedPayload(tienda, 'payment.updated'),
      {
        payment_id: paymentId,
        order_id: orderId,
        tienda_slug: tienda.slug,
        lineas: [],
        ok: true,
        error_msg: 'square_sync_temporarily_paused',
      }
    )
  }

  if (!tienda.squareToken) {
    return finishAndReturn(
      eventId,
      { ok: false, skipped: 'no_square_token', payment_id: paymentId },
      {
        payment_id: paymentId,
        order_id: orderId,
        tienda_slug: tienda.slug,
        lineas: [],
        ok: false,
        error_msg: 'no_square_token',
      }
    )
  }

  try {
    const { data: pagosAnteriores, error: pagoErr } = await supabaseAdmin
      .from('square_sync_log')
      .select('id, lineas')
      .eq('payment_id', paymentId)
      .eq('tienda_slug', tienda.slug)
      .eq('ok', true)

    if (pagoErr) throw new Error(`Leyendo pagos previos: ${pagoErr.message}`)

    const yaDescontado = (pagosAnteriores || []).some(log =>
      Array.isArray(log.lineas) && log.lineas.some(linea => linea.status === 'ok')
    )

    if (yaDescontado) {
      console.log(`[square-webhook] Pago ${paymentId} ya procesado, evento ${eventId} ignorado`)
      return finishAndReturn(
        eventId,
        { ok: true, duplicate: 'payment', payment_id: paymentId },
        {
          payment_id: paymentId,
          order_id: orderId,
          tienda_slug: tienda.slug,
          lineas: [],
          ok: true,
          error_msg: 'already_processed',
        }
      )
    }

    const order = await fetchOrder(orderId, tienda.squareToken)
    const quantities = new Map()
    for (const lineItem of order.line_items || []) {
      if (lineItem.item_type !== 'ITEM' || !lineItem.catalog_object_id) continue
      quantities.set(
        lineItem.catalog_object_id,
        (quantities.get(lineItem.catalog_object_id) || 0) + parseQuantity(lineItem.quantity)
      )
    }

    const lineas = []
    const catalogIds = [...quantities.keys()]
    const vinosBySquareId = await selectVinosBySquareIds(tienda.id, catalogIds, catalogIds)
    const now = new Date().toISOString()

    for (const [catalogId, qty] of quantities) {
      const vino = vinosBySquareId.get(catalogId)
      if (!vino) {
        lineas.push({ catalog_object_id: catalogId, quantity: qty, tienda_slug: tienda.slug, status: 'not_found' })
        continue
      }

      const nuevoStock = Math.max(0, (vino.stock || 0) - qty)
      const activo = squareActivoFromStock(vino, nuevoStock)
      if ((vino.stock || 0) === nuevoStock && Boolean(vino.activo) === activo) {
        lineas.push({
          catalog_object_id: catalogId,
          quantity: qty,
          tienda_slug: tienda.slug,
          vino_id: vino.id,
          vino_nombre: vino.nombre,
          categoria: vino.categoria || 'otro',
          stock_antes: vino.stock,
          stock_despues: nuevoStock,
          status: 'unchanged',
        })
        continue
      }

      const { error: updateErr } = await supabaseAdmin
        .from('vinos_tienda')
        .update({ stock: nuevoStock, activo, updated_at: now })
        .eq('id', vino.id)

      lineas.push({
        catalog_object_id: catalogId,
        quantity: qty,
        tienda_slug: tienda.slug,
        vino_id: vino.id,
        vino_nombre: vino.nombre,
        categoria: vino.categoria || 'otro',
        stock_antes: vino.stock,
        stock_despues: nuevoStock,
        status: updateErr ? 'error' : 'ok',
      })
    }

    const hasError = lineas.some(linea => linea.status === 'error')
    const actualizados = lineas.filter(linea => linea.status === 'ok').length
    const nVinos = lineas.filter(linea => linea.status === 'ok' && linea.categoria === 'vino').length
    const nOtros = lineas.filter(linea => linea.status === 'ok' && linea.categoria !== 'vino').length
    console.log(`[square-webhook] Pago ${paymentId}: ${actualizados}/${lineas.length} productos actualizados (${nVinos} vino, ${nOtros} otro)`)

    return finishAndReturn(
      eventId,
      { ok: !hasError, lineas },
      {
        payment_id: paymentId,
        order_id: orderId,
        tienda_slug: tienda.slug,
        lineas,
        ok: !hasError,
        error_msg: hasError ? 'payment_update_errors' : null,
      }
    )
  } catch (error) {
    console.error('[square-webhook] Error procesando pago:', error.message)
    return finishAndReturn(
      eventId,
      { ok: false, error: error.message, payment_id: paymentId },
      {
        payment_id: paymentId,
        order_id: orderId,
        tienda_slug: tienda.slug,
        lineas: [],
        ok: false,
        error_msg: error.message,
      }
    )
  }
}

export async function POST(request) {
  if (!SQUARE_SIGNATURE_KEY) {
    return json({ error: 'SQUARE_WEBHOOK_SIGNATURE_KEY no configurada' }, 503)
  }

  const rawBody = await request.text()
  const sig = request.headers.get('x-square-hmacsha256-signature') || ''
  const url = `${request.nextUrl.protocol}//${request.nextUrl.host}/api/webhooks/square`

  if (!verifySignature(rawBody, sig, url)) {
    console.error('[square-webhook] Firma invalida')
    return json({ error: 'Invalid signature' }, 401)
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const eventId = event.event_id || event.id || null
  const type = event.type

  if (isSquareSyncGloballyPaused()) {
    return json({ ...squareSyncPausedPayload({}, type), event_id: eventId })
  }

  if (!HANDLED_TYPES.has(type)) {
    return json({ ok: true, skipped: type })
  }

  if (type === 'payment.updated') {
    const payment = event.data?.object?.payment
    const paymentStatus = payment?.status
    if (paymentStatus !== 'COMPLETED') {
      return json({ ok: true, skipped: `status:${paymentStatus}` })
    }

    if (!payment?.id || !payment?.order_id) {
      return json({ ok: true, skipped: 'missing payment id or order_id' })
    }

    const claim = await claimSquareEvent({
      eventId,
      type,
      paymentId: payment.id,
      orderId: payment.order_id,
      tiendaSlug: 'unknown',
    })
    if (!claim.claimed) return claim.response
    return handlePaymentUpdated(eventId, payment)
  }

  const claim = await claimSquareEvent({ eventId, type, tiendaSlug: 'webhook' })
  if (!claim.claimed) return claim.response

  if (type === 'catalog.version.updated') {
    return handleCatalogUpdate(event, eventId)
  }

  return handleInventoryUpdate(event, eventId)
}
