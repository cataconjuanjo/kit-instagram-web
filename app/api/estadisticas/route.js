import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { validarSesionCamarero } from '../../lib/camareroSession'
import { validarTokenPruebaCarta } from '../../lib/cartaPruebaToken'
import { actividadRealDesdeISO } from '../../lib/actividadReal'
import { guardarAtribucionDesdeEventos } from '../../lib/recommendationAttribution'

const TIPOS_PERMITIDOS = new Set(['escaneo', 'sommelier', 'recomendacion', 'venta', 'incidencia', 'inventario'])
const TIPOS_PUBLICOS = new Set(['escaneo'])
const RATE_LIMIT_PUBLICO = 180
const RATE_WINDOW_MS = 60 * 60 * 1000

function getIP(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
}

async function checkRateLimitPublico(ip) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', 'estadisticas-publicas')
    .gte('created_at', since)

  if ((count || 0) >= RATE_LIMIT_PUBLICO) return false
  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint: 'estadisticas-publicas' })
  return true
}

function limpiarEvento(evento = {}) {
  const restaurante_id = String(evento.restaurante_id || '').trim()
  const tipo = String(evento.tipo || '').trim()
  const detalle = typeof evento.detalle === 'string'
    ? evento.detalle.slice(0, 1000)
    : JSON.stringify(evento.detalle || {}).slice(0, 1000)

  if (!restaurante_id || !TIPOS_PERMITIDOS.has(tipo)) return null
  return { restaurante_id, tipo, detalle }
}

function validarAccesoSala(restauranteId, token) {
  return validarSesionCamarero(token, restauranteId)
    ? { ok: true }
    : { error: 'No autorizado.', status: 403 }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const eventosRaw = Array.isArray(body.eventos) ? body.eventos : [body]
    let eventos = eventosRaw
      .map(limpiarEvento)
      .filter(Boolean)
      .filter(evento => !(evento.tipo === 'escaneo' && validarTokenPruebaCarta(body.prueba_token, evento.restaurante_id)))
      .slice(0, 20)

    if (!eventos.length) {
      return Response.json({ ok: true, ignored: true })
    }

    const restauranteIdsEventos = [...new Set(eventos.map(evento => evento.restaurante_id))]
    const { data: restaurantesActividad } = await supabaseAdmin
      .from('restaurantes')
      .select('id, actividad_real_desde')
      .in('id', restauranteIdsEventos)
    const activos = new Set((restaurantesActividad || [])
      .filter(restaurante => {
        const desde = actividadRealDesdeISO(restaurante)
        return desde && new Date(desde).getTime() <= Date.now()
      })
      .map(restaurante => String(restaurante.id)))
    eventos = eventos.filter(evento => activos.has(String(evento.restaurante_id)))

    if (!eventos.length) {
      return Response.json({ ok: true, ignored: true })
    }

    const requierePin = eventos.some(evento => !TIPOS_PUBLICOS.has(evento.tipo))
    if (requierePin) {
      const restauranteIds = [...new Set(eventos.map(evento => evento.restaurante_id))]
      if (restauranteIds.length !== 1) {
        return Response.json({ error: 'Los eventos deben pertenecer a un solo restaurante.' }, { status: 400 })
      }
      const acceso = validarAccesoSala(restauranteIds[0], body.sala_token)
      if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })
    } else if (!await checkRateLimitPublico(getIP(req))) {
      return Response.json({ error: 'Demasiados eventos. Prueba de nuevo más tarde.' }, { status: 429 })
    }

    const { data: eventosInsertados, error } = await supabaseAdmin
      .from('estadisticas')
      .insert(eventos)
      .select('id, restaurante_id, tipo, detalle, created_at')
    if (error) throw error
    await guardarAtribucionDesdeEventos(supabaseAdmin, eventosInsertados || [])

    return Response.json({ ok: true })
  } catch (error) {
    console.error('Error registrando estadisticas:', error)
    return Response.json({ error: 'No se pudo registrar la actividad.' }, { status: 500 })
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    const salaToken = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()

    if (!restauranteId || !salaToken) {
      return Response.json({ error: 'restaurante_id y sala_token son obligatorios.' }, { status: 400 })
    }

    const acceso = validarAccesoSala(restauranteId, salaToken)
    if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })

    const { data: restaurante } = await supabaseAdmin
      .from('restaurantes')
      .select('actividad_real_desde')
      .eq('id', restauranteId)
      .single()
    const desdeActividad = actividadRealDesdeISO(restaurante)
    if (!desdeActividad) {
      return Response.json({ ventas: [], recomendaciones: [] })
    }

    let ventasQuery = supabaseAdmin
        .from('estadisticas')
        .select('detalle, created_at')
        .eq('restaurante_id', restauranteId)
        .eq('tipo', 'venta')
        .order('created_at', { ascending: false })
        .limit(300)
    let recomendacionesQuery = supabaseAdmin
        .from('estadisticas')
        .select('detalle, created_at')
        .eq('restaurante_id', restauranteId)
        .eq('tipo', 'recomendacion')
        .order('created_at', { ascending: false })
        .limit(500)
    if (desdeActividad) {
      ventasQuery = ventasQuery.gte('created_at', desdeActividad)
      recomendacionesQuery = recomendacionesQuery.gte('created_at', desdeActividad)
    }

    const [{ data: ventas }, { data: recomendaciones }] = await Promise.all([
      ventasQuery,
      recomendacionesQuery,
    ])

    return Response.json({ ventas: ventas || [], recomendaciones: recomendaciones || [] })
  } catch (error) {
    console.error('Error leyendo estadisticas:', error)
    return Response.json({ error: 'No se pudo cargar el historial.' }, { status: 500 })
  }
}
