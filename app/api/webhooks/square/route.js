import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import {
  applyPaymentLinesRpc,
  fetchSquareJson,
  isSquareSyncGloballyPaused,
  isSquareSyncTemporarilyPaused,
  listSquareSyncTiendas,
  markCatalogIdsSkipped,
  resolveSquareTiendaByLocation,
  selectVinosBySquareIds,
  squareActivoFromStock,
  squareCatalogUpdateForTiendaObjects,
  squareSyncPausedPayload,
  syncCatalogObjectsForTienda,
} from '../../_lib/squareSync'

export const runtime = 'nodejs'
export const maxDuration = 20

const SQUARE_SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
const LOG_SELECT = 'id, event_id, payment_id, order_id, tienda_slug, lineas, ok, error_msg, estado'
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

function isTransientError(error) {
  const msg = String(error?.message || error || '').toLowerCase()
  return /gateway timeout|timeout|connection|econnreset|enotfound|fetch failed|\b503\b/.test(msg)
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

// Infiere el estado de la máquina de estados a partir de las columnas actuales.
// Fallback para filas anteriores a la migración que añade la columna `estado`.
function inferEstado(row) {
  if (row.estado) return row.estado
  if (row.ok) return 'done'
  if (String(row.error_msg || '').startsWith(PROCESSING_PREFIX)) return 'processing'
  return 'failed'
}

async function claimSquareEvent({ eventId, type, paymentId, orderId, tiendaSlug }) {
  if (!eventId) return { claimed: true, log: null }

  const mark = processingMark()
  const row = {
    event_id: eventId,
    payment_id: asRequired(paymentId, `event:${eventId}`),
    order_id: asRequired(orderId, type || 'unknown'),
    tienda_slug: asRequired(tiendaSlug, 'unknown'),
    lineas: [],
    ok: false,
    estado: 'processing',
    error_msg: mark,
  }

  const { data, error } = await supabaseAdmin
    .from('square_sync_log')
    .insert(row)
    .select(LOG_SELECT)
    .maybeSingle()

  if (!error) return { claimed: true, log: data }

  if (!isDuplicateKeyError(error)) {
    // Error de BD (timeout, red) — Square debe reintentar con backoff.
    console.error(`[square-webhook] event_id=${eventId}: fallo al reclamar evento:`, error.message)
    return {
      claimed: false,
      response: json({ ok: false, error: 'db_unavailable', event_id: eventId }, 503),
    }
  }

  // El event_id ya existe: leer el estado actual.
  let existing
  try {
    existing = await readSquareEventLog(eventId)
  } catch (readErr) {
    console.error(`[square-webhook] event_id=${eventId}: fallo al leer registro duplicado:`, readErr.message)
    return {
      claimed: false,
      response: json({ ok: true, duplicate: 'event_log_read_failed', event_id: eventId }),
    }
  }
  if (!existing) return { claimed: true, log: null }

  const estadoActual = inferEstado(existing)

  // done → ya procesado correctamente, ignorar
  if (estadoActual === 'done') {
    return {
      claimed: false,
      response: json({ ok: true, duplicate: 'event', event_id: eventId }),
    }
  }

  // processing fresco → otro handler en curso, ignorar (Square reintentará si no recibe 2xx antes del timeout)
  if (estadoActual === 'processing' && !isProcessingStale(existing.error_msg)) {
    return {
      claimed: false,
      response: json({ ok: true, duplicate: 'event_in_progress', event_id: eventId }),
    }
  }

  // failed o processing expirado → reintentar
  const { error: updateErr } = await supabaseAdmin
    .from('square_sync_log')
    .update({
      payment_id: asRequired(paymentId, existing.payment_id || `event:${eventId}`),
      order_id: asRequired(orderId, existing.order_id || type || 'unknown'),
      tienda_slug: asRequired(tiendaSlug, existing.tienda_slug || 'unknown'),
      lineas: existing.lineas || [],
      ok: false,
      estado: 'processing',
      error_msg: processingMark(),
    })
    .eq('event_id', eventId)

  if (updateErr) {
    console.error(`[square-webhook] event_id=${eventId}: fallo al reintentar evento:`, updateErr.message)
    return {
      claimed: false,
      response: json({ ok: false, error: 'db_unavailable', event_id: eventId }, 503),
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
  if (patch.ok === true) update.estado = 'done'
  else if (patch.ok === false) update.estado = 'failed'

  if (!Object.keys(update).length) return

  const { error } = await supabaseAdmin
    .from('square_sync_log')
    .update(update)
    .eq('event_id', eventId)

  if (error) console.error(`[square-webhook] event_id=${eventId}: fallo al cerrar square_sync_log:`, error.message)
}

async function finishAndReturn(eventId, responsePayload, logPatch = {}, status = 200) {
  await finishSquareEvent(eventId, logPatch)
  return json(responsePayload, status)
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

function groupInventoryCounts(event) {
  const groups = new Map()
  const counts = event.data?.object?.inventory_counts || []

  for (const count of counts) {
    if (count.state !== 'IN_STOCK' || !count.catalog_object_id) continue
    const locationId = count.location_id || event.location_id || null
    const groupKey = locationId || '__no_location__'
    if (!groups.has(groupKey)) groups.set(groupKey, { locationId, counts: new Map() })
    groups.get(groupKey).counts.set(count.catalog_object_id, {
      quantity: Math.max(0, parseInt(count.quantity, 10) || 0),
      calculatedAt: count.calculated_at || null,
    })
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
    console.error(`[square-webhook] event_id=${eventId}: error en catalog update:`, error.message)
    return finishAndReturn(
      eventId,
      { ok: false, error: error.message, fullSync: false },
      { ok: false, lineas: [], error_msg: error.message },
      isTransientError(error) ? 503 : 200
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

      for (const [catalogId, { quantity: nuevoStock, calculatedAt }] of group.counts) {
        const vino = vinosBySquareId.get(catalogId)
        if (!vino) {
          lineas.push({ catalog_object_id: catalogId, quantity: nuevoStock, tienda_slug: tienda.slug, status: 'not_found' })
          continue
        }

        const activo = squareActivoFromStock(vino, nuevoStock)

        // Si el evento no tiene calculated_at, actualizamos sin filtro de orden.
        // Si lo tiene, solo aplicamos si es más reciente que el último aplicado
        // (previene que eventos entregados fuera de orden sobreescriban datos correctos).
        let updateQuery = supabaseAdmin
          .from('vinos_tienda')
          .update({
            stock: nuevoStock,
            activo,
            updated_at: now,
            ...(calculatedAt ? { square_stock_calculated_at: calculatedAt } : {}),
          })
          .eq('id', vino.id)

        if (calculatedAt) {
          updateQuery = updateQuery.or(
            `square_stock_calculated_at.is.null,square_stock_calculated_at.lt.${calculatedAt}`
          )
        }

        const { error, count: rowsAffected } = await updateQuery.select('id', { count: 'exact', head: true })

        if (error) {
          errores++
          lineas.push({
            catalog_object_id: catalogId, quantity: nuevoStock, tienda_slug: tienda.slug,
            vino_id: vino.id, status: 'error',
          })
        } else if (rowsAffected === 0) {
          // Evento obsoleto descartado por el filtro de calculated_at
          lineas.push({
            catalog_object_id: catalogId, quantity: nuevoStock, tienda_slug: tienda.slug,
            vino_id: vino.id, status: 'stale',
          })
        } else {
          actualizados++
          lineas.push({
            catalog_object_id: catalogId,
            quantity: nuevoStock,
            tienda_slug: tienda.slug,
            vino_id: vino.id,
            vino_nombre: vino.nombre,
            categoria: vino.categoria || 'otro',
            stock_antes: vino.stock,
            stock_despues: nuevoStock,
            status: 'ok',
          })
        }
      }
    }

    return finishAndReturn(
      eventId,
      { ok: errores === 0, actualizados, lineas },
      { ok: errores === 0, lineas, error_msg: errores ? 'inventory_update_errors' : null }
    )
  } catch (error) {
    console.error(`[square-webhook] event_id=${eventId}: error en inventory update:`, error.message)
    return finishAndReturn(
      eventId,
      { ok: false, error: error.message, actualizados, lineas },
      { ok: false, lineas, error_msg: error.message },
      isTransientError(error) ? 503 : 200
    )
  }
}

async function handlePaymentUpdated(eventId, payment, eventCreatedAt) {
  const paymentId = payment.id
  const orderId = payment.order_id
  const locationId = payment.location_id || null

  let tienda
  try {
    tienda = await resolveSquareTiendaByLocation(locationId)
  } catch (error) {
    const transient = isTransientError(error)
    console.error(`[square-webhook] event_id=${eventId} payment_id=${paymentId}: error resolviendo tienda (${transient ? 'transitorio' : 'permanente'}):`, error.message)
    return finishAndReturn(
      eventId,
      { ok: false, error: error.message },
      { payment_id: paymentId, order_id: orderId, ok: false, error_msg: error.message },
      transient ? 503 : 200
    )
  }

  if (!tienda) {
    return finishAndReturn(
      eventId,
      { ok: true, skipped: 'no_tienda_for_location', payment_id: paymentId },
      { payment_id: paymentId, order_id: orderId, tienda_slug: 'unknown', lineas: [], ok: true, error_msg: 'no_tienda_for_location' }
    )
  }

  if (isSquareSyncTemporarilyPaused(tienda)) {
    console.warn(`[square-webhook] event_id=${eventId} payment_id=${paymentId} tienda=${tienda.slug}: pausa temporal activa`)
    return finishAndReturn(
      eventId,
      squareSyncPausedPayload(tienda, 'payment.updated'),
      { payment_id: paymentId, order_id: orderId, tienda_slug: tienda.slug, lineas: [], ok: true, error_msg: 'square_sync_temporarily_paused' }
    )
  }

  if (!tienda.squareToken) {
    return finishAndReturn(
      eventId,
      { ok: false, skipped: 'no_square_token', payment_id: paymentId },
      { payment_id: paymentId, order_id: orderId, tienda_slug: tienda.slug, lineas: [], ok: false, error_msg: 'no_square_token' }
    )
  }

  // Si Square gestiona el inventario directamente, inventory.count.updated
  // es la fuente de verdad. payment.updated no debe decrementar.
  if (tienda.squareTracksInventory) {
    console.log(`[square-webhook] event_id=${eventId} payment_id=${paymentId} tienda=${tienda.slug}: square_tracks_inventory → skip decrement`)
    return finishAndReturn(
      eventId,
      { ok: true, skipped: 'square_tracks_inventory', payment_id: paymentId },
      { payment_id: paymentId, order_id: orderId, tienda_slug: tienda.slug, lineas: [], ok: true, error_msg: 'square_tracks_inventory' }
    )
  }

  try {
    // Diagnóstico temporal: confirma si event.created_at llega en eventos POS
    console.log(`[square-webhook] event.created_at=${eventCreatedAt ?? 'null'} payment_id=${paymentId}`)

    let { lineas, hasError, actualizados } = await applyPaymentLinesRpc(payment, tienda)

    for (const l of lineas) {
      if (l.status === 'ok') {
        console.log(
          `[square-webhook] Match en pago ${paymentId}: "${l.item_name || ''}" ` +
          `id=${l.vino_id} stock ${l.stock_antes}→${l.stock_despues}`
        )
      }
    }

    const notFound = lineas.filter(l => l.status === 'not_found')
    if (notFound.length > 0) {
      const notFoundIds = notFound.map(l => l.catalog_object_id).filter(Boolean)
      console.warn(
        `[square-webhook] event_id=${eventId} payment_id=${paymentId} tienda=${tienda.slug}: ` +
        `${notFound.length} líneas not_found catalog_ids=${notFoundIds.join(',')}`
      )

      if (notFoundIds.length) {
        try {
          const syncResult = await syncCatalogObjectsForTienda(
            tienda.id, tienda.slug, tienda.squareToken, notFoundIds
          )
          console.log(
            `[square-webhook] micro-sync event_id=${eventId} payment_id=${paymentId} tienda=${tienda.slug}: ` +
            `inserted=${syncResult.inserted} updated=${syncResult.updated} skipped=${syncResult.skipped}`
          )

          const retry = await applyPaymentLinesRpc(payment, tienda)
          const retryOk       = retry.lineas.filter(l => l.status === 'ok')
          const retryNotFound = retry.lineas.filter(l => l.status === 'not_found')

          for (const l of retryOk) {
            console.log(
              `[square-webhook] Match (retry) en pago ${paymentId}: "${l.item_name || ''}" ` +
              `id=${l.vino_id} stock ${l.stock_antes}→${l.stock_despues}`
            )
          }
          for (const l of retryNotFound) {
            console.log(
              `[square-webhook] Sin match en pago ${paymentId}: "${l.item_name || ''}" ` +
              `(variation: ${l.catalog_object_id || 'sin id'}, qty: ${l.quantity})`
            )
          }

          // IDs confirmados como no gestionados → caché negativa para próximos pagos
          const confirmedSkipIds = retryNotFound.map(l => l.catalog_object_id).filter(Boolean)
          if (confirmedSkipIds.length) markCatalogIdsSkipped(tienda.id, confirmedSkipIds)

          lineas       = [...lineas.filter(l => l.status !== 'not_found'), ...retryOk, ...retryNotFound]
          actualizados += retry.actualizados
          if (retry.hasError) hasError = true
        } catch (syncError) {
          if (isTransientError(syncError)) {
            console.error(
              `[square-webhook] micro-sync error (transitorio→503) event_id=${eventId} payment_id=${paymentId}: ${syncError.message}`
            )
            return finishAndReturn(
              eventId,
              { ok: false, error: 'micro_sync_failed', payment_id: paymentId },
              { payment_id: paymentId, order_id: orderId, tienda_slug: tienda.slug, lineas, ok: false, error_msg: 'micro_sync_failed' },
              503
            )
          }
          // Error permanente (schema, credenciales): log y continúa con los not_found actuales
          console.error(
            `[square-webhook] micro-sync error (permanente→200) event_id=${eventId} payment_id=${paymentId}: ${syncError.message}`
          )
          for (const l of notFound) {
            console.log(
              `[square-webhook] Sin match en pago ${paymentId}: "${l.item_name || ''}" ` +
              `(variation: ${l.catalog_object_id || 'sin id'}, qty: ${l.quantity})`
            )
          }
        }
      } else {
        // not_found sin catalog_object_id (artículos ad-hoc sin variación asignada)
        for (const l of notFound) {
          console.log(
            `[square-webhook] Sin match en pago ${paymentId}: "${l.item_name || ''}" ` +
            `(variation: sin id, qty: ${l.quantity})`
          )
        }
      }
    }

    // Idempotencia secundaria: guarda payment_id para detectar event_ids distintos
    // que correspondan al mismo pago (no debería ocurrir con Square).
    const { error: claimErr } = await supabaseAdmin
      .from('processed_payments')
      .insert({ payment_id: paymentId, tienda_slug: tienda.slug })

    if (claimErr && isDuplicateKeyError(claimErr)) {
      console.log(`[square-webhook] event_id=${eventId} payment_id=${paymentId}: processed_payments duplicado — otro reintento ya completó`)
    } else if (claimErr) {
      console.warn(`[square-webhook] event_id=${eventId} payment_id=${paymentId}: no se pudo registrar en processed_payments:`, claimErr.message)
    }

    const nVinos = lineas.filter(l => l.status === 'ok' && l.categoria === 'vino').length
    const nOtros = lineas.filter(l => l.status === 'ok' && l.categoria !== 'vino').length
    const nErr   = lineas.filter(l => l.status === 'error').length
    console.log(
      `[square-webhook] event_id=${eventId} payment_id=${paymentId} tienda=${tienda.slug}: ` +
      `${actualizados}/${lineas.length} actualizados (${nVinos} vino, ${nOtros} otro, ${nErr} error) ` +
      `estado=${hasError ? 'parcial' : 'ok'}` +
      (nErr ? ` pendientes=${lineas.filter(l => l.status === 'error').map(l => l.catalog_object_id).join(',')}` : '')
    )

    return finishAndReturn(
      eventId,
      { ok: !hasError, lineas },
      { payment_id: paymentId, order_id: orderId, tienda_slug: tienda.slug, lineas, ok: !hasError, error_msg: hasError ? 'payment_update_errors' : null }
    )
  } catch (error) {
    const transient = isTransientError(error)
    console.error(`[square-webhook] event_id=${eventId} payment_id=${paymentId} tienda=${tienda.slug}: error procesando pago (${transient ? 'transitorio→503' : 'permanente→200'}):`, error.message)
    return finishAndReturn(
      eventId,
      { ok: false, error: error.message, payment_id: paymentId },
      { payment_id: paymentId, order_id: orderId, tienda_slug: tienda.slug, lineas: [], ok: false, error_msg: error.message },
      transient ? 503 : 200
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
    let diag = {}
    try {
      const parsed = JSON.parse(rawBody)
      diag = {
        type: parsed?.type,
        event_id: parsed?.event_id,
        merchant_id: parsed?.merchant_id,
        environment: parsed?.environment,
        topLevelKeys: Object.keys(parsed || {}),
      }
    } catch {}
    console.error('[square-webhook] Firma invalida', diag)
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
    return handlePaymentUpdated(eventId, payment, event.created_at || null)
  }

  const claim = await claimSquareEvent({ eventId, type, tiendaSlug: 'webhook' })
  if (!claim.claimed) return claim.response

  if (type === 'catalog.version.updated') {
    return handleCatalogUpdate(event, eventId)
  }

  return handleInventoryUpdate(event, eventId)
}
