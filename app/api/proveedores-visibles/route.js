import { requireRestaurantAccess } from '../_lib/auth'
import { isConsultorFromAuth } from '../_lib/isConsultor'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { puedeUsar } from '../../lib/plans'

function texto(value, limite = 80) {
  return String(value || '').trim().slice(0, limite)
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'))
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    const esConsultor = isConsultorFromAuth(auth)

    // Gate: la lista con contacto es parte del catálogo privado; solo
    // premium/admin la reciben. Para planes inferiores devolvemos 403:
    // así el cliente puede ocultar la UI y no se exponen email/teléfono.
    const { data: restaurante, error: restError } = await supabaseAdmin
      .from('restaurantes')
      .select('plan, subscription_status')
      .eq('id', restauranteId)
      .single()
    if (restError || !restaurante) {
      return Response.json({ error: 'Restaurante no encontrado' }, { status: 404 })
    }
    if (!esConsultor && !puedeUsar(restaurante, 'catalogo_consultor')) {
      return Response.json({ error: 'Plan no incluye el catálogo del consultor' }, { status: 403 })
    }

    const { data, error } = await supabaseAdmin
      .from('proveedores_vino')
      .select('nombre, telefono, email')
      .eq('visible_restaurantes', true)
      .order('nombre')

    if (error) throw error
    const proveedores = (data || []).filter(item => item.nombre)
    // Contacto solo para el consultor (admin). El propietario premium ve
    // la lista pero sin email/teléfono por defensa en profundidad.
    return Response.json({
      proveedores: proveedores.map(item => item.nombre),
      proveedores_detalle: proveedores.map(item => esConsultor
        ? { nombre: item.nombre, telefono: item.telefono || '', email: item.email || '' }
        : { nombre: item.nombre }),
    })
  } catch (error) {
    console.error('[proveedores-visibles] leer:', error)
    return Response.json({ error: 'No se pudieron cargar los proveedores.' }, { status: 500 })
  }
}
