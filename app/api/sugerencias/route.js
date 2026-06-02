import { getUserFromRequest, requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'
const TIPOS = new Set(['mejora', 'problema', 'nueva_funcion', 'otro'])
const ESTADOS = new Set(['nueva', 'revisando', 'resuelta', 'descartada'])

function esAdmin(user) {
  return (user?.email || '').toLowerCase() === adminEmail.toLowerCase()
}

function texto(value, limite) {
  return String(value || '').trim().slice(0, limite)
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const mensaje = texto(body.mensaje, 3000)
    if (mensaje.length < 10) {
      return Response.json({ error: 'Cuéntanos un poco más para poder ayudarte.' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('sugerencias_restaurante')
      .insert([{
        restaurante_id: restauranteId,
        user_id: auth.user.id,
        user_email: (auth.user.email || '').toLowerCase(),
        tipo: TIPOS.has(body.tipo) ? body.tipo : 'mejora',
        mensaje,
        pagina: texto(body.pagina, 300) || null,
      }])
      .select('id, tipo, mensaje, pagina, estado, created_at')
      .single()

    if (error) throw error
    return Response.json({ sugerencia: data })
  } catch (error) {
    console.error('[sugerencias] crear:', error)
    return Response.json({ error: 'No se pudo enviar la sugerencia.' }, { status: 500 })
  }
}

export async function GET(req) {
  try {
    const auth = await getUserFromRequest(req)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    let query = supabaseAdmin
      .from('sugerencias_restaurante')
      .select('id, restaurante_id, tipo, mensaje, pagina, estado, respuesta_interna, created_at, updated_at, restaurantes(nombre, slug)')
      .order('created_at', { ascending: false })
      .limit(esAdmin(auth.user) ? 500 : 30)

    if (!esAdmin(auth.user)) {
      const acceso = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
      if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })
      query = query.eq('restaurante_id', restauranteId)
    } else if (restauranteId) {
      query = query.eq('restaurante_id', restauranteId)
    }

    const { data, error } = await query
    if (error) throw error
    return Response.json({ sugerencias: data || [] })
  } catch (error) {
    console.error('[sugerencias] leer:', error)
    return Response.json({ error: 'No se pudieron cargar las sugerencias.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const auth = await getUserFromRequest(req)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    if (!esAdmin(auth.user)) return Response.json({ error: 'No autorizado.' }, { status: 403 })

    const body = await req.json()
    const id = texto(body.id, 80)
    if (!id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })

    const cambios = {
      estado: ESTADOS.has(body.estado) ? body.estado : 'revisando',
      respuesta_interna: texto(body.respuesta_interna, 2000) || null,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabaseAdmin
      .from('sugerencias_restaurante')
      .update(cambios)
      .eq('id', id)
      .select('id, restaurante_id, tipo, mensaje, pagina, estado, respuesta_interna, created_at, updated_at, restaurantes(nombre, slug)')
      .single()

    if (error) throw error
    return Response.json({ sugerencia: data })
  } catch (error) {
    console.error('[sugerencias] actualizar:', error)
    return Response.json({ error: 'No se pudo actualizar la sugerencia.' }, { status: 500 })
  }
}
