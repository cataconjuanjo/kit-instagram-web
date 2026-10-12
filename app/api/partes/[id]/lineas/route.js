import { requireRestaurantAccess } from '../../../_lib/auth'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const TIPOS_LINEA = new Set([
  'venta_botella', 'venta_copa',
  'invitacion_botella', 'invitacion_copa',
  'cocina', 'grupo_evento', 'maridaje', 'rotura', 'cata',
])

function texto(v, max = 200) {
  return String(v || '').trim().slice(0, max)
}

async function resolverParte(parteId) {
  const { data } = await supabaseAdmin
    .from('partes_servicio')
    .select('restaurante_id, estado')
    .eq('id', parteId)
    .single()
  return data
}

// GET /api/partes/[id]/lineas
export async function GET(req, { params }) {
  try {
    const { id } = await params
    const parte = await resolverParte(id)
    if (!parte) return Response.json({ error: 'Parte no encontrado' }, { status: 404 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, parte.restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin
      .from('partes_servicio_lineas')
      .select('*, vino:vinos(id, nombre, stock, precio_botella, precio_copa)')
      .eq('parte_id', id)
      .order('created_at', { ascending: true })

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ lineas: data })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/partes/[id]/lineas
export async function POST(req, { params }) {
  try {
    const { id } = await params
    const body = await req.json()
    const parte = await resolverParte(id)
    if (!parte) return Response.json({ error: 'Parte no encontrado' }, { status: 404 })
    if (parte.estado !== 'borrador') {
      return Response.json({ error: 'El parte ya está cerrado' }, { status: 409 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, parte.restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const tipo = texto(body.tipo, 30)
    if (!TIPOS_LINEA.has(tipo)) return Response.json({ error: 'tipo no válido' }, { status: 400 })

    const cantidad = Number(body.cantidad)
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      return Response.json({ error: 'cantidad debe ser un entero positivo' }, { status: 400 })
    }

    const vinoId = texto(body.vino_id, 80)
    if (!vinoId) return Response.json({ error: 'vino_id obligatorio' }, { status: 400 })

    const esCopa = tipo === 'venta_copa' || tipo === 'invitacion_copa'
    const copasVendidas = esCopa && body.copas_vendidas
      ? (Number.isInteger(Number(body.copas_vendidas)) && Number(body.copas_vendidas) > 0
          ? Number(body.copas_vendidas) : null)
      : null

    const mesa = texto(body.mesa || '', 60) || null
    const precioUnitario = body.precio_unitario != null && body.precio_unitario !== ''
      ? Number(body.precio_unitario) : null

    const { data, error } = await supabaseAdmin
      .from('partes_servicio_lineas')
      .insert({
        parte_id:        id,
        restaurante_id:  parte.restaurante_id,
        vino_id:         vinoId,
        tipo,
        cantidad,
        copas_vendidas:  copasVendidas,
        mesa,
        precio_unitario: precioUnitario,
      })
      .select('*, vino:vinos(id, nombre, stock, precio_botella, precio_copa)')
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ linea: data }, { status: 201 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/partes/[id]/lineas?linea_id=
export async function DELETE(req, { params }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const lineaId = texto(searchParams.get('linea_id'), 80)
    if (!lineaId) return Response.json({ error: 'linea_id obligatorio' }, { status: 400 })

    const parte = await resolverParte(id)
    if (!parte) return Response.json({ error: 'Parte no encontrado' }, { status: 404 })
    if (parte.estado !== 'borrador') {
      return Response.json({ error: 'El parte ya está cerrado' }, { status: 409 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, parte.restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { error } = await supabaseAdmin
      .from('partes_servicio_lineas')
      .delete()
      .eq('id', lineaId)
      .eq('parte_id', id)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
