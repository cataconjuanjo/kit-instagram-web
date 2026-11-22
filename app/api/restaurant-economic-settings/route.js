/**
 * FASE I — /api/restaurant-economic-settings
 *
 * Lectura/escritura de los 4 parámetros económicos visibles al
 * propietario en Ajustes → "Parámetros de bodega":
 *   copas_por_botella (int 1..12)
 *   iva_venta_pct     (num 0..30, 2 dec)
 *   merma_copa_pct    (num 0..30, 2 dec)
 *   fuente_ventas     ('parte' | 'tpv' | 'ambas' | null)
 *
 * RLS bloquea leer `restaurant_economic_settings` desde cliente (ya
 * documentado en FASE G, mismo motivo que `/api/conteos`). Por eso
 * TODO pasa por este endpoint con service_role tras
 * `requireRestaurantAccess`.
 *
 * GET:
 *   - Si NO existe fila: devuelve DEFAULTS (iguales a los que usa
 *     `agregarPeriodoBodega.js`) + `por_defecto` por campo para
 *     que la UI los pinte como "por defecto". `existe_fila=false`.
 *   - Si existe: devuelve los 4 campos tal como están + `por_defecto`
 *     marcado true para los que llegan null (el agregador caería al
 *     default también).
 *
 * PUT:
 *   - Valida con `validarParametros` (lib pura). Sólo escribe las
 *     claves tocadas (upsert parcial). Incluye `updated_at`.
 *   - Preserva 'tpv'/'ambas' en `fuente_ventas` si el usuario no las
 *     toca (clave ausente en el body → NO se re-escribe).
 *   - Cambiar IVA/copas/merma afecta a meses ABIERTOS. Meses cerrados
 *     conservan su snapshot (ver `cierres_mensuales_bodega.snapshot`),
 *     así que no se tocan.
 */

import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import {
  DEFAULTS,
  validarParametros,
  construirVistaParametros,
} from '../../lib/parametrosBodega'

function texto(v, max = 200) { return String(v || '').trim().slice(0, max) }

const SELECT_FIELDS = 'copas_por_botella, iva_venta_pct, merma_copa_pct, fuente_ventas'

// GET /api/restaurant-economic-settings?restaurante_id=
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
      .from('restaurant_economic_settings')
      .select(SELECT_FIELDS)
      .eq('restaurante_id', restaurante_id)
      .maybeSingle()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const vista = construirVistaParametros(data || null)
    return Response.json({
      existe_fila: vista.existe_fila,
      valores:     vista.valores,
      por_defecto: vista.por_defecto,
      defaults:    DEFAULTS,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// PUT /api/restaurant-economic-settings  { restaurante_id, ...cambios }
export async function PUT(req) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Body inválido' }, { status: 400 })
    }
    const restaurante_id = texto(body.restaurante_id, 80)
    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    // Sólo validamos las 4 claves conocidas; cualquier otra se ignora.
    const subset = {}
    for (const k of ['copas_por_botella', 'iva_venta_pct', 'merma_copa_pct', 'fuente_ventas']) {
      if (k in body) subset[k] = body[k]
    }
    const validacion = validarParametros(subset)
    if (!validacion.ok) {
      return Response.json({ error: 'Validación', detalles: validacion.errores }, { status: 400 })
    }

    const patch = { ...validacion.normalizado }
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: 'Sin cambios: no hay campos editables en el body' }, { status: 400 })
    }

    // Upsert parcial: si no existe fila, se crea con los campos
    // tocados; el resto cae a los defaults del schema (iva=10, copas=5,
    // merma=10, fuente_ventas=NULL). onConflict por `restaurante_id`
    // (único según schema) para mezclar con lo existente.
    const { data, error } = await supabaseAdmin
      .from('restaurant_economic_settings')
      .upsert(
        { restaurante_id, ...patch, updated_at: new Date().toISOString() },
        { onConflict: 'restaurante_id' },
      )
      .select(SELECT_FIELDS)
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const vista = construirVistaParametros(data || null)
    return Response.json({
      existe_fila: vista.existe_fila,
      valores:     vista.valores,
      por_defecto: vista.por_defecto,
      cambios:     patch,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
