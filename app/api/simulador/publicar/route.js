import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsarEditorCarta } from '../../../lib/plans'

// POST /api/simulador/publicar
// Body: { restaurante_id }
// Invoca la función Postgres publicar_simulacion() en una sola transacción:
//   1. Desactiva vinos marcados 'fuera'
//   2. Inserta en vinos los referenciados como 'nuevo' (desde catálogo consultor)
//   3. Elimina las líneas 'fuera' y 'nuevo' del borrador
//
// Idempotencia / cuota (cuotas F1 sin tabla nueva):
//   - Bloqueo en memoria por restaurante_id mientras una publicación está
//     en curso (rechaza con 429 si llega otra concurrente).
//   - Cuota diaria: PUBLICACIONES_POR_DIA basada en carta_historial.published_at
//     del día actual UTC. El consultor (admin) queda exento.
const LIMITE_PUBLICACIONES_POR_DIA = 6
const enCurso = new Set()

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante, error: restError } = await supabaseAdmin
      .from('restaurantes')
      .select('plan, subscription_status, email')
      .eq('id', restauranteId)
      .single()

    if (restError || !restaurante) {
      return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }

    if (!puedeUsarEditorCarta(restaurante)) {
      return Response.json({ error: 'Plan no incluye el editor de carta' }, { status: 403 })
    }

    // Idempotencia: evita dobles clics que duplicarían inserts en `vinos`.
    if (enCurso.has(restauranteId)) {
      return Response.json(
        { error: 'Ya hay una publicación en curso para este restaurante. Espera unos segundos.' },
        { status: 429 }
      )
    }

    // Cuota diaria (UTC). El admin queda exento para no bloquearse en revisiones.
    const emailUsuario = (auth.user?.email || '').toLowerCase()
    const esAdmin = emailUsuario === (process.env.ADMIN_EMAIL || 'cataconjuanjo@gmail.com').toLowerCase()
    if (!esAdmin) {
      const hoyISO = new Date().toISOString().slice(0, 10)
      const { count, error: countErr } = await supabaseAdmin
        .from('carta_historial')
        .select('id', { count: 'exact', head: true })
        .eq('restaurante_id', restauranteId)
        .gte('published_at', `${hoyISO}T00:00:00Z`)
      if (!countErr && (count || 0) >= LIMITE_PUBLICACIONES_POR_DIA) {
        return Response.json(
          { error: `Has alcanzado el límite de ${LIMITE_PUBLICACIONES_POR_DIA} publicaciones por día.` },
          { status: 429 }
        )
      }
    }

    const publishedBy = auth.user?.email || null

    enCurso.add(restauranteId)
    try {
      const { data, error } = await supabaseAdmin.rpc('publicar_simulacion', {
        p_restaurante_id: restauranteId,
        p_published_by:   publishedBy,
      })
      if (error) throw error
      return Response.json({ ok: true, ...(data || {}) })
    } finally {
      enCurso.delete(restauranteId)
    }
  } catch (err) {
    console.error('[simulador/publicar POST]', err)
    return Response.json({ error: 'No se pudo publicar la carta.' }, { status: 500 })
  }
}
