/**
 * /api/eventos-bodega/[id] — PATCH y DELETE de un evento.
 *
 * El `restaurante_id` se valida siempre (contra el campo de la fila).
 * Degrada con 503 si la tabla no existe.
 */

import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { esRelacionInexistente, parseEventoForm } from '../../../lib/eventosBodega'

function respSqlPendiente() {
  return Response.json(
    { error: 'La función de eventos aún no está activa (SQL pendiente).', sql_pendiente: true },
    { status: 503 },
  )
}

async function cargarEvento(id) {
  const { data, error } = await supabaseAdmin
    .from('eventos_bodega')
    .select('id, restaurante_id')
    .eq('id', id)
    .maybeSingle()
  return { data, error }
}

export async function PATCH(req, { params }) {
  try {
    const { id } = await params
    if (!id) return Response.json({ error: 'id obligatorio' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const parsed = parseEventoForm(body)
    if (!parsed.ok) {
      return Response.json({ error: parsed.error, field: parsed.field }, { status: 400 })
    }

    const found = await cargarEvento(id)
    if (found.error) {
      if (esRelacionInexistente(found.error)) return respSqlPendiente()
      return Response.json({ error: found.error.message || 'Error al cargar' }, { status: 500 })
    }
    if (!found.data) return Response.json({ error: 'No encontrado' }, { status: 404 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, found.data.restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin
      .from('eventos_bodega')
      .update({ ...parsed.value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (esRelacionInexistente(error)) return respSqlPendiente()
      console.error('[eventos-bodega PATCH]', {
        code: error.code, message: error.message,
        hint: error.hint, details: error.details,
      })
      return Response.json({ error: 'No se pudo actualizar el evento.' }, { status: 500 })
    }
    return Response.json({ evento: data })
  } catch (err) {
    return Response.json({ error: err?.message || 'Error inesperado' }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params
    if (!id) return Response.json({ error: 'id obligatorio' }, { status: 400 })

    const found = await cargarEvento(id)
    if (found.error) {
      if (esRelacionInexistente(found.error)) return respSqlPendiente()
      return Response.json({ error: found.error.message || 'Error al cargar' }, { status: 500 })
    }
    if (!found.data) return Response.json({ error: 'No encontrado' }, { status: 404 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, found.data.restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { error } = await supabaseAdmin
      .from('eventos_bodega')
      .delete()
      .eq('id', id)

    if (error) {
      if (esRelacionInexistente(error)) return respSqlPendiente()
      console.error('[eventos-bodega DELETE]', {
        code: error.code, message: error.message,
        hint: error.hint, details: error.details,
      })
      return Response.json({ error: 'No se pudo borrar el evento.' }, { status: 500 })
    }
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: err?.message || 'Error inesperado' }, { status: 500 })
  }
}
