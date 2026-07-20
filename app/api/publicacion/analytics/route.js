import { requireRestaurantAccess } from '../../_lib/auth'
import { actividadRealDesdeISO, maxFechaISO } from '../../../lib/actividadReal'
import { deliveryAnalyticsPendiente, guardarDeliveryEvent, normalizarDeliveryDestino, normalizarDeliveryEvent } from '../../../lib/publicationDeliveryAnalytics'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

function texto(valor, limite = 160) {
  return String(valor || '').trim().slice(0, limite)
}

function diasSeguro(valor) {
  const numero = Number(valor)
  if (!Number.isFinite(numero)) return 30
  return Math.max(1, Math.min(90, Math.round(numero)))
}

function resumenEventos(eventos = []) {
  return eventos.reduce((acc, evento) => {
    acc[evento.event] = (acc[evento.event] || 0) + 1
    acc.por_destino = acc.por_destino || { carta: 0, hub: 0 }
    acc.por_destino[evento.destino] = (acc.por_destino[evento.destino] || 0) + 1
    return acc
  }, { por_destino: { carta: 0, hub: 0 } })
}

function destinoEscaneo(detalle = '') {
  const textoDetalle = typeof detalle === 'string' ? detalle : JSON.stringify(detalle || {})
  const limpio = textoDetalle.toLowerCase()
  if (limpio.includes('hub')) return 'hub'
  if (limpio.includes('carta')) return 'carta'
  return 'otro'
}

function resumenUsoReal(eventos = [], desde = null, actividadIniciada = false) {
  const porDestino = { carta: 0, hub: 0, otro: 0 }
  eventos.forEach(evento => {
    const destino = destinoEscaneo(evento.detalle)
    porDestino[destino] = (porDestino[destino] || 0) + 1
  })

  return {
    actividad_iniciada: actividadIniciada,
    desde,
    escaneos_total: eventos.length,
    escaneos_carta: porDestino.carta,
    escaneos_hub: porDestino.hub,
    escaneos_otro: porDestino.otro,
    por_destino: porDestino,
    ultimos_escaneos: eventos.slice(0, 10).map(evento => ({
      id: evento.id,
      detalle: evento.detalle,
      destino: destinoEscaneo(evento.detalle),
      created_at: evento.created_at,
    })),
  }
}

async function leerUsoReal(restauranteId, desdePeriodo) {
  const { data: restaurante, error: restError } = await supabaseAdmin
    .from('restaurantes')
    .select('actividad_real_desde')
    .eq('id', restauranteId)
    .single()

  if (restError) return { error: restError }

  const desdeActividad = actividadRealDesdeISO(restaurante)
  if (!desdeActividad) {
    return {
      uso_real: resumenUsoReal([], null, false),
    }
  }

  const desde = maxFechaISO(desdePeriodo, desdeActividad)
  const { data, error } = await supabaseAdmin
    .from('estadisticas')
    .select('id, detalle, created_at')
    .eq('restaurante_id', restauranteId)
    .eq('tipo', 'escaneo')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return { error }
  return {
    uso_real: resumenUsoReal(data || [], desde, true),
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const dias = diasSeguro(searchParams.get('days'))
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabaseAdmin
      .from('publication_delivery_events')
      .select('id, event, destino, metadata, actor_email, created_at')
      .eq('restaurante_id', restauranteId)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(120)

    if (deliveryAnalyticsPendiente(error)) {
      return Response.json({
        eventos: [],
        resumen: resumenEventos([]),
        analytics_pendiente: true,
        desde,
        dias,
        sql: 'supabase/add_publication_delivery_events.sql',
      })
    }
    if (error) throw error

    const eventos = data || []
    const usoRealRes = await leerUsoReal(restauranteId, desde)
    if (usoRealRes.error) throw usoRealRes.error

    return Response.json({
      eventos,
      resumen: resumenEventos(eventos),
      uso_real: usoRealRes.uso_real,
      analytics_pendiente: false,
      desde,
      dias,
      sql: null,
    })
  } catch (error) {
    console.error('[publicacion:analytics:get]', error)
    return Response.json({ error: 'No se pudo cargar la analitica de entrega.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const event = normalizarDeliveryEvent(body.event)
    const destino = normalizarDeliveryDestino(body.destino)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    if (!event) {
      return Response.json({ error: 'Evento de entrega no valido.' }, { status: 400 })
    }

    const resultado = await guardarDeliveryEvent(supabaseAdmin, {
      restauranteId,
      event,
      destino,
      metadata: body.metadata || {},
      auth,
      userAgent: req.headers.get('user-agent'),
    })

    if (resultado.pendiente) {
      return Response.json({
        ok: true,
        analytics_pendiente: true,
        sql: resultado.sql,
      })
    }
    if (resultado.error) throw resultado.error

    return Response.json({
      ok: true,
      evento: resultado.evento || null,
      analytics_pendiente: false,
    })
  } catch (error) {
    console.error('[publicacion:analytics:post]', error)
    return Response.json({ error: 'No se pudo registrar el evento de entrega.' }, { status: 500 })
  }
}
