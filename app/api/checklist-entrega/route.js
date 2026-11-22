/**
 * FASE I — /api/checklist-entrega
 *
 * Marca o desmarca una confirmación manual del checklist de entrega
 * (QR probado en móvil, mapa estrella/joya revisado).
 *
 * Sólo POST — mutación idempotente del JSONB
 * `restaurantes.checklist_entrega`. La lectura la hace Ajustes al
 * cargar el restaurante con SELECT_CLIENT_RESTAURANTE_DASHBOARD + la
 * clave `checklist_entrega`.
 *
 * Autorización: `requireRestaurantAccess` (admin bypass + propietario).
 * Validación: `validarMarcarConfirmacion` (lib pura) rechaza claves
 * fuera de la lista permitida (`CLAVES_CONFIRMACION_MANUAL`). Previene
 * inyección arbitraria en el JSONB.
 *
 * Degradación: si la migración no se ha aplicado todavía, el update
 * falla con 42703/PGRST204 y se devuelve 502 con mensaje explicativo;
 * Ajustes NO se rompe: los ítems manuales siguen apareciendo pendientes.
 */

import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { validarMarcarConfirmacion } from '../../lib/checklistEntrega'
import { esColumnaInexistente } from '../../lib/eventosBodega'

function texto(v, max = 200) { return String(v || '').trim().slice(0, max) }

// GET /api/checklist-entrega?restaurante_id=
// Siempre responde 200 con `{ checklist_entrega: {} }` cuando la
// migración aún no se aplicó — así Ajustes no se rompe y los ítems
// manuales quedan "Pendiente".
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id = texto(searchParams.get('restaurante_id'), 80)
    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin
      .from('restaurantes')
      .select('checklist_entrega')
      .eq('id', restaurante_id)
      .single()

    if (error) {
      if (esColumnaInexistente(error)) {
        // Degradación suave: la UI sigue funcionando con ítems manuales en Pendiente.
        return Response.json({ checklist_entrega: {}, migracion_pendiente: true })
      }
      return Response.json({ error: error.message }, { status: 500 })
    }

    const checklist = (data?.checklist_entrega && typeof data.checklist_entrega === 'object')
      ? data.checklist_entrega
      : {}
    return Response.json({ checklist_entrega: checklist })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null)
    const restaurante_id = texto(body?.restaurante_id, 80)
    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const val = validarMarcarConfirmacion(body)
    if (!val.ok) return Response.json({ error: val.mensaje }, { status: 400 })

    // Leer JSONB actual con tolerancia a columna inexistente.
    let actual = {}
    try {
      const { data, error } = await supabaseAdmin
        .from('restaurantes')
        .select('checklist_entrega')
        .eq('id', restaurante_id)
        .single()
      if (error) {
        if (esColumnaInexistente(error)) {
          return Response.json(
            { error: 'Migración pendiente: columna restaurantes.checklist_entrega no existe todavía' },
            { status: 502 },
          )
        }
        return Response.json({ error: error.message }, { status: 500 })
      }
      actual = (data?.checklist_entrega && typeof data.checklist_entrega === 'object')
        ? { ...data.checklist_entrega }
        : {}
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 })
    }

    if (val.marcar) {
      actual[val.clave] = new Date().toISOString()
    } else {
      delete actual[val.clave]
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from('restaurantes')
      .update({ checklist_entrega: actual })
      .eq('id', restaurante_id)
      .select('checklist_entrega')
      .single()

    if (upErr) {
      if (esColumnaInexistente(upErr)) {
        return Response.json(
          { error: 'Migración pendiente: columna restaurantes.checklist_entrega no existe todavía' },
          { status: 502 },
        )
      }
      return Response.json({ error: upErr.message }, { status: 500 })
    }

    return Response.json({ checklist_entrega: updated?.checklist_entrega ?? actual })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
