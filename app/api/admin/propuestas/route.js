import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

async function validarAdmin(req) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sesión no recibida', status: 401 }

  const supabaseAuth = createClient(supabaseUrl, anonKey)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesión no válida', status: 401 }
  if ((data.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
    return { error: 'No autorizado', status: 403 }
  }

  return { user: data.user }
}

function adminClient() {
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

function payload(body) {
  return {
    restaurante_id: body.restaurante_id,
    titulo: String(body.titulo || '').trim(),
    vino: String(body.vino || '').trim(),
    tipo: String(body.tipo || '').trim(),
    zona: String(body.zona || '').trim(),
    proveedor_sugerido: String(body.proveedor_sugerido || '').trim(),
    coste_estimado: parseFloat(body.coste_estimado) || 0,
    precio_recomendado: parseFloat(body.precio_recomendado) || 0,
    margen_objetivo: parseInt(body.margen_objetivo, 10) || 0,
    plato_objetivo: String(body.plato_objetivo || '').trim(),
    motivo: String(body.motivo || '').trim(),
    prioridad: ['alta', 'media', 'baja'].includes(body.prioridad) ? body.prioridad : 'media',
    estado: ['propuesta', 'interesa', 'descartada', 'incorporada'].includes(body.estado) ? body.estado : 'propuesta',
    updated_at: new Date().toISOString()
  }
}

export async function GET(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    let query = adminClient()
      .from('consultor_propuestas')
      .select('*, restaurantes(nombre, slug, ciudad)')
      .order('created_at', { ascending: false })

    if (restauranteId) query = query.eq('restaurante_id', restauranteId)

    const { data, error } = await query
    if (error) throw error
    return Response.json({ propuestas: data || [] })
  } catch (error) {
    console.error('Error leyendo propuestas:', error)
    return Response.json({ error: 'No se pudieron cargar las propuestas.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const dataPayload = payload(body)
    if (!dataPayload.restaurante_id || !dataPayload.titulo) {
      return Response.json({ error: 'Restaurante y titulo son obligatorios.' }, { status: 400 })
    }

    const { data, error } = await adminClient()
      .from('consultor_propuestas')
      .insert([dataPayload])
      .select('*, restaurantes(nombre, slug, ciudad)')
      .single()

    if (error) throw error
    return Response.json({ propuesta: data })
  } catch (error) {
    console.error('Error creando propuesta:', error)
    return Response.json({ error: 'No se pudo crear la propuesta.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    if (!body.id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })

    const { data, error } = await adminClient()
      .from('consultor_propuestas')
      .update(payload(body))
      .eq('id', body.id)
      .select('*, restaurantes(nombre, slug, ciudad)')
      .single()

    if (error) throw error
    return Response.json({ propuesta: data })
  } catch (error) {
    console.error('Error editando propuesta:', error)
    return Response.json({ error: 'No se pudo editar la propuesta.' }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { id } = await req.json()
    if (!id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })

    const { error } = await adminClient().from('consultor_propuestas').delete().eq('id', id)
    if (error) throw error
    return Response.json({ ok: true })
  } catch (error) {
    console.error('Error borrando propuesta:', error)
    return Response.json({ error: 'No se pudo borrar la propuesta.' }, { status: 500 })
  }
}
