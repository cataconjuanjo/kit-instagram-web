import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsarEditorCarta } from '../../../lib/plans'

// Cierra con editor_carta además de ownership: evita que un propietario
// cuyo plan cayó a basic siga mutando el borrador existente.
async function verificarPlan(restauranteId) {
  const { data: restaurante } = await supabaseAdmin
    .from('restaurantes')
    .select('plan, subscription_status')
    .eq('id', restauranteId)
    .single()
  if (!restaurante) return { error: 'Restaurante no encontrado', status: 404 }
  if (!puedeUsarEditorCarta(restaurante)) {
    return { error: 'Plan no incluye el editor de carta', status: 403 }
  }
  return { ok: true }
}

const CAMPOS_PRECIO = new Set(['precio_botella', 'precio_copa', 'coste_compra'])
const CAMPOS_BOOL   = new Set(['ofrecido_por_copa'])
const ESTADOS_VALIDOS = new Set(['actual', 'fuera'])

// PATCH /api/simulador/:id
// Body: { restaurante_id, estado?, precio_botella?, precio_copa?, coste_compra? }
// Permite: cambiar estado 'actual' ↔ 'fuera', y editar precios de cualquier línea.
// No permite cambiar el estado de una línea 'nuevo' (solo se elimina vía DELETE).
export async function PATCH(req, { params }) {
  const { id } = await params
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    const plan = await verificarPlan(restauranteId)
    if (plan.error) return Response.json({ error: plan.error }, { status: plan.status })

    // Verify ownership before applying changes
    const { data: linea, error: fetchError } = await supabaseAdmin
      .from('carta_simulacion')
      .select('id, estado')
      .eq('id', id)
      .eq('restaurante_id', restauranteId)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!linea) return Response.json({ error: 'Línea no encontrada' }, { status: 404 })

    const cambios = {}

    if (body.estado !== undefined) {
      if (!ESTADOS_VALIDOS.has(body.estado)) {
        return Response.json({ error: 'Estado no válido. Usa "actual" o "fuera".' }, { status: 422 })
      }
      if (linea.estado === 'nuevo') {
        return Response.json({ error: 'Las referencias nuevas no pueden cambiar de estado; usa DELETE para quitarlas.' }, { status: 422 })
      }
      cambios.estado = body.estado
    }

    for (const campo of CAMPOS_PRECIO) {
      if (body[campo] !== undefined) {
        const val = body[campo] === null ? null : parseFloat(body[campo])
        cambios[campo] = (val === null || isNaN(val) || val < 0) ? null : val
      }
    }

    for (const campo of CAMPOS_BOOL) {
      if (body[campo] !== undefined) {
        cambios[campo] = body[campo] === null ? null : Boolean(body[campo])
      }
    }

    if (Object.keys(cambios).length === 0) {
      return Response.json({ error: 'Sin campos válidos para actualizar' }, { status: 400 })
    }

    cambios.updated_at = new Date().toISOString()

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('carta_simulacion')
      .update(cambios)
      .eq('id', id)
      .eq('restaurante_id', restauranteId)
      .select()
      .single()

    if (updateError) throw updateError

    return Response.json({ linea: updated })
  } catch (err) {
    console.error('[simulador PATCH]', err)
    return Response.json({ error: 'No se pudo actualizar la línea.' }, { status: 500 })
  }
}

// DELETE /api/simulador/:id
// Body: { restaurante_id }
// Solo permite eliminar líneas con estado 'nuevo' (las de catálogo que aún no son vinos propios).
// Las líneas 'actual' y 'fuera' se gestionan con PATCH; no se borran hasta publicar.
export async function DELETE(req, { params }) {
  const { id } = await params
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    const plan = await verificarPlan(restauranteId)
    if (plan.error) return Response.json({ error: plan.error }, { status: plan.status })

    const { data: linea, error: fetchError } = await supabaseAdmin
      .from('carta_simulacion')
      .select('id, estado')
      .eq('id', id)
      .eq('restaurante_id', restauranteId)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!linea) return Response.json({ error: 'Línea no encontrada' }, { status: 404 })

    if (linea.estado !== 'nuevo') {
      return Response.json(
        { error: 'Solo se pueden eliminar referencias con estado "nuevo". Para retirar una referencia actual, usa Quitar (PATCH a estado fuera).' },
        { status: 422 }
      )
    }

    const { error: deleteError } = await supabaseAdmin
      .from('carta_simulacion')
      .delete()
      .eq('id', id)
      .eq('restaurante_id', restauranteId)

    if (deleteError) throw deleteError

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[simulador DELETE]', err)
    return Response.json({ error: 'No se pudo eliminar la línea.' }, { status: 500 })
  }
}
