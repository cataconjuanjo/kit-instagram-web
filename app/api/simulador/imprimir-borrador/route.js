import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsarEditorCarta } from '../../../lib/plans'
import { crearTokenBorradorCarta } from '../../../lib/cartaPruebaToken'

// POST /api/simulador/imprimir-borrador
// Body: { restaurante_id, duracion_min? }
// Devuelve un token firmado + la URL de impresión del borrador. El token
// está limitado en tiempo (15 min por defecto, máximo 24 h) y queda
// ligado al restaurante_id. El borrador se renderiza en /imprimir/carta-pdf
// con `?simulacion=1&token=…` sin exigir carta_publica_activa.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)
    const duracionMin   = Number(body.duracion_min) > 0
      ? Math.min(60 * 24, Number(body.duracion_min))
      : 15

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante, error: restError } = await supabaseAdmin
      .from('restaurantes')
      .select('slug, plan, subscription_status')
      .eq('id', restauranteId)
      .single()
    if (restError || !restaurante) {
      return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }
    if (!puedeUsarEditorCarta(restaurante)) {
      return Response.json({ error: 'Plan no incluye el editor de carta' }, { status: 403 })
    }

    const token = crearTokenBorradorCarta(restauranteId, { duracionMs: duracionMin * 60 * 1000 })
    const slug  = encodeURIComponent(restaurante.slug)
    const url   = `/imprimir/carta-pdf/${slug}?simulacion=1&token=${encodeURIComponent(token)}&print=1&_=${Date.now()}`
    return Response.json({ token, url, expira_min: duracionMin })
  } catch (err) {
    console.error('[simulador/imprimir-borrador POST]', err)
    return Response.json({ error: 'No se pudo generar el enlace de impresión.' }, { status: 500 })
  }
}
