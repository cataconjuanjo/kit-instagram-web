/**
 * /api/eventos-bodega — CRUD de cabeceras de evento (Fase A).
 *
 * GET   ?restaurante_id=…&mes=YYYY-MM  → lista del mes
 * POST  body: { restaurante_id, ...payload }  → crea
 *
 * PATCH/DELETE por id viven en /api/eventos-bodega/[id]/route.js.
 *
 * Degradación: si la tabla `public.eventos_bodega` no existe (SQL
 * pendiente), se devuelve 503 "SQL pendiente" para que la UI lo
 * muestre como aviso.
 */

import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { esRelacionInexistente, parseEventoForm } from '../../lib/eventosBodega'

function respSqlPendiente() {
  return Response.json(
    { error: 'La función de eventos aún no está activa (SQL pendiente).', sql_pendiente: true },
    { status: 503 },
  )
}

function rangoMes(mes) {
  // 'YYYY-MM' → { desde:'YYYY-MM-01', hasta:'YYYY-MM-ultimo_dia' }
  if (typeof mes !== 'string' || !/^\d{4}-\d{2}$/.test(mes)) return null
  const [y, m] = mes.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(last).padStart(2, '0')}`,
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id = searchParams.get('restaurante_id')
    const mes            = searchParams.get('mes')
    if (!restaurante_id || !mes) {
      return Response.json({ error: 'restaurante_id y mes son obligatorios' }, { status: 400 })
    }
    const r = rangoMes(mes)
    if (!r) return Response.json({ error: 'mes debe ser YYYY-MM' }, { status: 400 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin
      .from('eventos_bodega')
      .select('*')
      .eq('restaurante_id', restaurante_id)
      .gte('fecha', r.desde)
      .lte('fecha', r.hasta)
      .order('fecha', { ascending: true })

    if (error) {
      if (esRelacionInexistente(error)) return respSqlPendiente()
      // Error REAL: log completo en servidor (code + hint + details)
      // para diagnosticar 500 futuros. NUNCA se filtra al cliente.
      console.error('[eventos-bodega GET]', {
        code:    error.code,
        message: error.message,
        hint:    error.hint,
        details: error.details,
      })
      return Response.json({ error: 'No se pudieron cargar los eventos.' }, { status: 500 })
    }

    return Response.json({ eventos: data || [] })
  } catch (err) {
    return Response.json({ error: err?.message || 'Error inesperado' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const restaurante_id = body?.restaurante_id
    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const parsed = parseEventoForm(body)
    if (!parsed.ok) {
      return Response.json({ error: parsed.error, field: parsed.field }, { status: 400 })
    }

    const payload = {
      ...parsed.value,
      restaurante_id,
      created_by: (auth.user?.email || '').toLowerCase() || null,
    }

    const { data, error } = await supabaseAdmin
      .from('eventos_bodega')
      .insert(payload)
      .select()
      .single()

    if (error) {
      if (esRelacionInexistente(error)) return respSqlPendiente()
      console.error('[eventos-bodega POST]', {
        code: error.code, message: error.message,
        hint: error.hint, details: error.details,
      })
      return Response.json({ error: 'No se pudo crear el evento.' }, { status: 500 })
    }

    return Response.json({ evento: data }, { status: 201 })
  } catch (err) {
    return Response.json({ error: err?.message || 'Error inesperado' }, { status: 500 })
  }
}
