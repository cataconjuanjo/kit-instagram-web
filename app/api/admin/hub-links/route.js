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

export async function GET(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    if (!restauranteId) return Response.json({ error: 'restaurante_id obligatorio' }, { status: 400 })

    const { data, error } = await adminClient()
      .from('restaurante_links')
      .select('*')
      .eq('restaurante_id', restauranteId)
      .order('orden')

    if (error) throw error
    return Response.json({ links: data || [] })
  } catch (error) {
    console.error('Error leyendo links del hub:', error)
    return Response.json({ error: 'No se pudieron cargar los enlaces.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const payload = {
      restaurante_id: body.restaurante_id,
      titulo: String(body.titulo || '').trim(),
      url: String(body.url || '').trim(),
      tipo: body.tipo || 'link',
      orden: Number(body.orden) || 0,
      visible: body.visible !== false
    }

    if (!payload.restaurante_id || !payload.titulo || !payload.url) {
      return Response.json({ error: 'Restaurante, titulo y URL son obligatorios.' }, { status: 400 })
    }

    const { data, error } = await adminClient()
      .from('restaurante_links')
      .insert([payload])
      .select('*')
      .single()

    if (error) throw error
    return Response.json({ link: data })
  } catch (error) {
    console.error('Error creando link del hub:', error)
    return Response.json({ error: 'No se pudo crear el enlace.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    if (!body.id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })

    const { data, error } = await adminClient()
      .from('restaurante_links')
      .update({
        titulo: String(body.titulo || '').trim(),
        url: String(body.url || '').trim(),
        tipo: body.tipo || 'link',
        orden: Number(body.orden) || 0,
        visible: body.visible !== false
      })
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) throw error
    return Response.json({ link: data })
  } catch (error) {
    console.error('Error editando link del hub:', error)
    return Response.json({ error: 'No se pudo editar el enlace.' }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { id } = await req.json()
    if (!id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })

    const { error } = await adminClient().from('restaurante_links').delete().eq('id', id)
    if (error) throw error
    return Response.json({ ok: true })
  } catch (error) {
    console.error('Error borrando link del hub:', error)
    return Response.json({ error: 'No se pudo borrar el enlace.' }, { status: 500 })
  }
}
