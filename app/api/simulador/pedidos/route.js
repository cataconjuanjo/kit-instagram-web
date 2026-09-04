import { requireRestaurantAccess } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { puedeUsar } from '../../../lib/plans'

// GET /api/simulador/pedidos?restaurante_id=...
// Devuelve todos los pedidos guardados para este restaurante.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = String(searchParams.get('restaurante_id') || '').trim().slice(0, 80)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin
      .from('simulador_pedidos')
      .select('*')
      .eq('restaurante_id', restauranteId)
      .order('updated_at', { ascending: false })
    if (error) throw error

    return Response.json({ pedidos: data || [] })
  } catch (err) {
    console.error('[pedidos GET]', err)
    return Response.json({ error: 'No se pudieron cargar los pedidos.' }, { status: 500 })
  }
}

// POST /api/simulador/pedidos
// Body: { restaurante_id, proveedor_id?, proveedor_nombre, vinos_snapshot, mensaje_final? }
// Crea o actualiza el pedido activo para este (restaurante, proveedor).
export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: restaurante } = await supabaseAdmin
      .from('restaurantes')
      .select('plan, subscription_status')
      .eq('id', restauranteId)
      .single()

    if (!restaurante || !puedeUsar(restaurante, 'catalogo_consultor')) {
      return Response.json({ error: 'Plan no incluye el simulador de carta' }, { status: 403 })
    }

    const proveedorNombre = String(body.proveedor_nombre || '').trim().slice(0, 200)
    if (!proveedorNombre) return Response.json({ error: 'proveedor_nombre obligatorio' }, { status: 400 })

    const fila = {
      restaurante_id:  restauranteId,
      proveedor_id:    body.proveedor_id || null,
      proveedor_nombre: proveedorNombre,
      vinos_snapshot:  Array.isArray(body.vinos_snapshot) ? body.vinos_snapshot : [],
      mensaje_final:   body.mensaje_final || null,
      estado:          'borrador',
      updated_at:      new Date().toISOString(),
    }

    // Upsert: si ya existe un pedido para este (restaurante, proveedor), actualízalo.
    // La unicidad depende de si hay proveedor_id (FK) o solo nombre (texto libre).
    let result
    if (body.proveedor_id) {
      result = await supabaseAdmin
        .from('simulador_pedidos')
        .upsert(fila, { onConflict: 'restaurante_id,proveedor_id', ignoreDuplicates: false })
        .select()
        .single()
    } else {
      // Para proveedores sin FK buscamos por nombre y actualizamos o insertamos
      const { data: existing } = await supabaseAdmin
        .from('simulador_pedidos')
        .select('id')
        .eq('restaurante_id', restauranteId)
        .eq('proveedor_nombre', proveedorNombre)
        .is('proveedor_id', null)
        .maybeSingle()

      if (existing) {
        result = await supabaseAdmin
          .from('simulador_pedidos')
          .update(fila)
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        result = await supabaseAdmin
          .from('simulador_pedidos')
          .insert(fila)
          .select()
          .single()
      }
    }

    if (result.error) throw result.error
    return Response.json({ pedido: result.data })
  } catch (err) {
    console.error('[pedidos POST]', err)
    return Response.json({ error: 'No se pudo guardar el pedido.' }, { status: 500 })
  }
}

// PATCH /api/simulador/pedidos
// Body: { restaurante_id, id, estado, mensaje_final?, enviado_por? }
// Actualiza estado ('enviado') o mensaje de un pedido existente.
export async function PATCH(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim().slice(0, 80)
    const pedidoId = String(body.id || '').trim()

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const cambios = { updated_at: new Date().toISOString() }
    if (body.estado === 'enviado') {
      cambios.estado = 'enviado'
      cambios.enviado_at = new Date().toISOString()
      cambios.enviado_por = body.enviado_por || auth.user?.email || null
    } else if (body.estado === 'borrador') {
      cambios.estado = 'borrador'
      cambios.enviado_at = null
      cambios.enviado_por = null
    }
    if (body.mensaje_final !== undefined) cambios.mensaje_final = body.mensaje_final

    const { data, error } = await supabaseAdmin
      .from('simulador_pedidos')
      .update(cambios)
      .eq('id', pedidoId)
      .eq('restaurante_id', restauranteId)
      .select()
      .single()

    if (error) throw error
    return Response.json({ pedido: data })
  } catch (err) {
    console.error('[pedidos PATCH]', err)
    return Response.json({ error: 'No se pudo actualizar el pedido.' }, { status: 500 })
  }
}
