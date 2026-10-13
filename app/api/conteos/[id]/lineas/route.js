import { requireRestaurantAccess } from '../../../_lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

async function resolverRestauranteDeConteo(conteoId) {
  const { data } = await supabaseAdmin
    .from('conteos_inventario')
    .select('restaurante_id, estado')
    .eq('id', conteoId)
    .single()
  return data
}

const MOTIVOS_VALIDOS = new Set(['rotura', 'invitacion_no_reg', 'error_anterior', 'venta_no_reg', 'otro'])

// PATCH /api/conteos/[id]/lineas  { vino_id, stock_contado, motivo, contado }
export async function PATCH(req, { params }) {
  try {
    const { id } = await params
    const conteo = await resolverRestauranteDeConteo(id)
    if (!conteo) return Response.json({ error: 'Conteo no encontrado' }, { status: 404 })
    if (conteo.estado !== 'borrador') {
      return Response.json({ error: 'El conteo ya está cerrado' }, { status: 409 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, conteo.restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const body = await req.json()
    const vino_id = String(body.vino_id || '').trim()
    if (!vino_id) return Response.json({ error: 'vino_id obligatorio' }, { status: 400 })

    const patch = {}

    if (body.stock_contado !== undefined && body.stock_contado !== null && body.stock_contado !== '') {
      const val = Number(body.stock_contado)
      if (Number.isNaN(val) || val < 0) {
        return Response.json({ error: 'stock_contado debe ser un número >= 0' }, { status: 400 })
      }
      patch.stock_contado = Math.round(val)
      patch.contado = true
    }

    if (body.motivo !== undefined) {
      if (body.motivo === null || body.motivo === '') {
        patch.motivo = null
      } else if (MOTIVOS_VALIDOS.has(body.motivo)) {
        patch.motivo = body.motivo
      } else {
        return Response.json({ error: 'motivo no válido' }, { status: 400 })
      }
    }

    if (body.contado === false) {
      patch.contado = false
      patch.stock_contado = null
      patch.motivo = null
    }

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('conteos_inventario_lineas')
      .update(patch)
      .eq('conteo_id', id)
      .eq('vino_id', vino_id)
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!data) return Response.json({ error: 'Línea no encontrada' }, { status: 404 })

    return Response.json({ linea: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
