import { isConsultorFromAuth } from '../_lib/isConsultor'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { requireCatalogoConsultor } from '../_lib/requireCatalogoConsultor'

function texto(value, limite = 80) {
  return String(value || '').trim().slice(0, limite)
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'))

    // Gate único: catalogo_consultor en el plan del restaurante. Admin
    // sin plan en el restaurante también cae en 403 (regla unificada).
    const gate = await requireCatalogoConsultor(req, restauranteId)
    if (gate.error) return Response.json({ error: gate.error }, { status: gate.status })
    const esConsultor = isConsultorFromAuth(gate.auth)

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
