import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { validarSesionCamarero } from '../../lib/camareroSession'

const TIPOS_PERMITIDOS = new Set(['escaneo', 'sommelier', 'recomendacion', 'venta', 'incidencia', 'inventario'])
const TIPOS_PUBLICOS = new Set(['escaneo'])

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
    const eventos = eventosRaw.map(limpiarEvento).filter(Boolean).slice(0, 20)

    if (!eventos.length) {
      return Response.json({ error: 'Evento no valido.' }, { status: 400 })
    }

    const requierePin = eventos.some(evento => !TIPOS_PUBLICOS.has(evento.tipo))
    if (requierePin) {
      const restauranteIds = [...new Set(eventos.map(evento => evento.restaurante_id))]
      if (restauranteIds.length !== 1) {
        return Response.json({ error: 'Los eventos deben pertenecer a un solo restaurante.' }, { status: 400 })
      }
      const acceso = validarAccesoSala(restauranteIds[0], body.sala_token)
      if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })
    }

    const { error } = await supabaseAdmin.from('estadisticas').insert(eventos)
    if (error) throw error

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

    const [{ data: ventas }, { data: recomendaciones }] = await Promise.all([
      supabaseAdmin
        .from('estadisticas')
        .select('detalle, created_at')
        .eq('restaurante_id', restauranteId)
        .eq('tipo', 'venta')
        .order('created_at', { ascending: false })
        .limit(300),
      supabaseAdmin
        .from('estadisticas')
        .select('detalle, created_at')
        .eq('restaurante_id', restauranteId)
        .eq('tipo', 'recomendacion')
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    return Response.json({ ventas: ventas || [], recomendaciones: recomendaciones || [] })
  } catch (error) {
    console.error('Error leyendo estadisticas:', error)
    return Response.json({ error: 'No se pudo cargar el historial.' }, { status: 500 })
  }
}
