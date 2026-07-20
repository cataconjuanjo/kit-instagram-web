import { requireRestaurantAccess } from '../../_lib/auth'
import { hashTokenPruebaCarta, leerTokenPruebaCarta } from '../../../lib/cartaPruebaToken'
import { guardarDeliveryEvent } from '../../../lib/publicationDeliveryAnalytics'
import { calcularHuellaPublicacion } from '../../../lib/publicationFingerprint'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function texto(valor, limite = 160) {
  return String(valor || '').trim().slice(0, limite)
}

function textoLargo(valor, limite = 800) {
  return String(valor || '').trim().slice(0, limite)
}

function errorTablaPendiente(error) {
  const textoError = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ').toLowerCase()
  return textoError.includes('publication_preview_approvals') ||
    textoError.includes('content_fingerprint') ||
    textoError.includes('content_summary') ||
    textoError.includes('schema cache') ||
    ['42P01', 'PGRST204', 'PGRST205'].includes(String(error?.code || ''))
}

function destinoPreview(valor) {
  return valor === 'hub' ? 'hub' : 'carta'
}

function serializarAprobacion(aprobacion) {
  if (!aprobacion) return null
  return {
    id: aprobacion.id,
    restaurante_id: aprobacion.restaurante_id,
    destino: aprobacion.destino,
    reviewer_name: aprobacion.reviewer_name,
    reviewer_email: aprobacion.reviewer_email,
    note: aprobacion.note,
    token_tipo: aprobacion.token_tipo,
    content_fingerprint: aprobacion.content_fingerprint,
    content_fingerprint_version: aprobacion.content_fingerprint_version,
    content_summary: aprobacion.content_summary || {},
    token_expires_at: aprobacion.token_expires_at,
    approved_at: aprobacion.approved_at,
  }
}

async function leerUltimasAprobaciones(restauranteId, limit = 5, destino = '') {
  let query = supabaseAdmin
    .from('publication_preview_approvals')
    .select('id, restaurante_id, destino, reviewer_name, reviewer_email, note, token_tipo, content_fingerprint, content_fingerprint_version, content_summary, token_expires_at, approved_at')
    .eq('restaurante_id', restauranteId)
    .order('approved_at', { ascending: false })
    .limit(limit)

  if (destino) query = query.eq('destino', destinoPreview(destino))

  const { data, error } = await query

  if (errorTablaPendiente(error)) return { aprobaciones: [], pendiente: true }
  if (error) return { error }
  return { aprobaciones: data || [], pendiente: false }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const destino = texto(searchParams.get('destino'), 20)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const resultado = await leerUltimasAprobaciones(restauranteId, 5, destino)
    if (resultado.error) throw resultado.error
    if (resultado.pendiente) {
      return Response.json({
        aprobaciones: [],
        ultima_aprobacion: null,
        ultima_aprobacion_vigente: null,
        aprobacion_vigente: false,
        aprobacion_obsoleta: false,
        aprobaciones_pendientes: true,
        sql: 'supabase/add_preview_approvals.sql',
      })
    }

    let huellaActual = null
    const destinoFiltro = destino ? destinoPreview(destino) : ''
    if (destinoFiltro) {
      const huellaRes = await calcularHuellaPublicacion(supabaseAdmin, restauranteId, destinoFiltro)
      if (huellaRes.error) throw huellaRes.error
      huellaActual = huellaRes
    }

    const aprobaciones = resultado.aprobaciones.map(aprobacion => {
      const serializada = serializarAprobacion(aprobacion)
      return {
        ...serializada,
        vigente: Boolean(huellaActual?.fingerprint && aprobacion.content_fingerprint === huellaActual.fingerprint),
      }
    })
    const ultimaAprobacion = aprobaciones[0] || null
    const ultimaVigente = aprobaciones.find(aprobacion => aprobacion.vigente) || null

    return Response.json({
      aprobaciones,
      ultima_aprobacion: ultimaAprobacion,
      ultima_aprobacion_vigente: ultimaVigente,
      aprobacion_vigente: Boolean(ultimaVigente),
      aprobacion_obsoleta: Boolean(huellaActual && ultimaAprobacion && !ultimaVigente),
      contenido_actual_resumen: huellaActual?.resumen || null,
      aprobaciones_pendientes: false,
      sql: null,
    })
  } catch (error) {
    console.error('[preview-approval:get]', error)
    return Response.json({ error: 'No se pudo cargar la aprobacion de preview.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const previewToken = texto(body.preview_token, 3000)
    const tokenData = leerTokenPruebaCarta(previewToken)

    if (!restauranteId || !previewToken) {
      return Response.json({ error: 'Faltan datos para aprobar la preview.' }, { status: 400 })
    }
    if (!tokenData || String(tokenData.restaurante_id) !== String(restauranteId)) {
      return Response.json({ error: 'El enlace de preview ha caducado o no es valido.' }, { status: 401 })
    }

    const destino = destinoPreview(body.destino || (String(tokenData.tipo || '').includes('hub') ? 'hub' : 'carta'))
    const huellaRes = await calcularHuellaPublicacion(supabaseAdmin, restauranteId, destino)
    if (huellaRes.error) {
      console.error('[preview-approval:fingerprint]', huellaRes.error)
      return Response.json({ error: 'No se pudo calcular la version actual de la preview.' }, { status: 503 })
    }

    const payload = {
      restaurante_id: restauranteId,
      token_hash: hashTokenPruebaCarta(previewToken),
      token_tipo: texto(tokenData.tipo, 80),
      destino,
      reviewer_name: texto(body.reviewer_name, 120) || 'Aprobado desde enlace privado',
      reviewer_email: texto(body.reviewer_email, 180) || null,
      note: textoLargo(body.note),
      user_agent: texto(req.headers.get('user-agent'), 300),
      content_fingerprint: huellaRes.fingerprint,
      content_fingerprint_version: huellaRes.version,
      content_summary: huellaRes.resumen,
      token_expires_at: tokenData.exp ? new Date(Number(tokenData.exp)).toISOString() : null,
      approved_at: new Date().toISOString(),
    }

    const { data, error } = await supabaseAdmin
      .from('publication_preview_approvals')
      .upsert(payload, { onConflict: 'token_hash' })
      .select('id, restaurante_id, destino, reviewer_name, reviewer_email, note, token_tipo, content_fingerprint, content_fingerprint_version, content_summary, token_expires_at, approved_at')
      .single()

    if (errorTablaPendiente(error)) {
      return Response.json({
        error: 'Aprobacion no registrada. Aplica supabase/add_preview_approvals.sql en Supabase.',
        aprobaciones_pendientes: true,
        sql: 'supabase/add_preview_approvals.sql',
      }, { status: 409 })
    }
    if (error) throw error

    const deliveryRes = await guardarDeliveryEvent(supabaseAdmin, {
      restauranteId,
      event: 'preview_approved',
      destino,
      metadata: {
        approval_id: data.id,
        reviewer_name: payload.reviewer_name,
        reviewer_email: payload.reviewer_email,
        has_note: Boolean(payload.note),
        content_fingerprint_version: huellaRes.version,
      },
      userAgent: req.headers.get('user-agent'),
    })
    if (deliveryRes.error) console.error('[preview-approval:delivery-event]', deliveryRes.error)

    return Response.json({
      aprobada: true,
      aprobacion: serializarAprobacion(data),
    })
  } catch (error) {
    console.error('[preview-approval:post]', error)
    return Response.json({ error: 'No se pudo registrar la aprobacion de preview.' }, { status: 500 })
  }
}
