import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { guardarAtribucionDesdeEventos } from '../../lib/recommendationAttribution'

const RESULTADOS = new Set(['vendida', 'venta_probable', 'venta_posible', 'no_vendida', 'no_convence', 'otra', 'no_stock', 'agotado'])

function texto(valor, limite = 240) {
  return String(valor || '').trim().slice(0, limite)
}

function numero(valor) {
  return Number(valor) || 0
}

function limpiarOutcome(input = {}, restauranteId) {
  const recommendationId = texto(input.recommendation_id, 120)
  const resultado = RESULTADOS.has(input.resultado) ? input.resultado : RESULTADOS.has(input.estado) ? input.estado : 'no_vendida'
  const vinoId = texto(input.vino_id, 80)
  if (!recommendationId && !vinoId) return null
  return {
    restaurante_id: restauranteId,
    tipo: 'venta',
    detalle: JSON.stringify({
      recommendation_id: recommendationId || null,
      grupo_recomendacion_id: texto(input.grupo_recomendacion_id, 120) || null,
      resultado,
      fuente: 'cierre',
      vino_id: vinoId || null,
      vino: texto(input.vino, 180) || null,
      plato: texto(input.plato || input.consulta, 240) || null,
      recommendation_label: texto(input.recommendation_label || input.etiqueta, 120) || null,
      recommendation_position: Math.round(numero(input.recommendation_position || input.posicion)),
      formato_venta: ['botella', 'copa'].includes(input.formato_venta) ? input.formato_venta : 'desconocido',
      importe_vino_estimado: numero(input.importe_vino_estimado || input.importe_estimado) || null,
      cantidad: Math.max(1, numero(input.cantidad) || 1),
    }),
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const outcomesRaw = Array.isArray(body.outcomes) ? body.outcomes : [body]
    const eventos = outcomesRaw
      .map(item => limpiarOutcome(item, restauranteId))
      .filter(Boolean)
      .slice(0, 50)

    if (!eventos.length) return Response.json({ ok: true, ignored: true })

    const { data: eventosInsertados, error } = await supabaseAdmin
      .from('estadisticas')
      .insert(eventos)
      .select('id, restaurante_id, tipo, detalle, created_at')
    if (error) throw error

    const atribucion = await guardarAtribucionDesdeEventos(supabaseAdmin, eventosInsertados || [])

    return Response.json({
      ok: true,
      eventos: eventosInsertados?.length || 0,
      eventos_insertados: eventosInsertados || [],
      atribucion,
    })
  } catch (error) {
    console.error('[recommendation-outcomes] guardar:', error)
    return Response.json({ error: 'No se pudo guardar el resultado de la recomendacion.' }, { status: 500 })
  }
}
