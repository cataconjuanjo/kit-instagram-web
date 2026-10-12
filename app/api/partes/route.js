import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

function texto(v, max = 200) {
  return String(v || '').trim().slice(0, max)
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10)
}

// GET /api/partes?restaurante_id=&fecha=
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const fecha = texto(searchParams.get('fecha'), 10) || fechaHoy()

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const [{ data, error }, { data: settings }] = await Promise.all([
      supabaseAdmin
        .from('partes_servicio')
        .select('*, lineas:partes_servicio_lineas(*, vino:vinos(id, nombre, stock, precio_botella, precio_copa))')
        .eq('restaurante_id', restauranteId)
        .eq('fecha', fecha)
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('restaurant_economic_settings')
        .select('control_stock_desde')
        .eq('restaurante_id', restauranteId)
        .single(),
    ])

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({
      partes: data,
      control_stock_desde: settings?.control_stock_desde ?? null,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/partes
export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const turno = texto(body.turno, 20)
    if (!['mediodia', 'noche', 'unico'].includes(turno)) {
      return Response.json({ error: 'turno no válido' }, { status: 400 })
    }

    const fecha = texto(body.fecha || fechaHoy(), 10)

    const { data, error } = await supabaseAdmin
      .from('partes_servicio')
      .insert({ restaurante_id: restauranteId, fecha, turno, created_by: auth.user.id })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        const { data: existente } = await supabaseAdmin
          .from('partes_servicio')
          .select('*, lineas:partes_servicio_lineas(*, vino:vinos(id, nombre, stock, precio_botella, precio_copa))')
          .eq('restaurante_id', restauranteId)
          .eq('fecha', fecha)
          .eq('turno', turno)
          .single()
        return Response.json(
          { error: 'Ya existe un parte para este turno y fecha', parte: existente || null },
          { status: 409 }
        )
      }
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ parte: { ...data, lineas: [] } }, { status: 201 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
