import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

async function validarAdmin(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sesion no recibida', status: 401 }
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data } = await anonClient.auth.getUser(token)
  if (!data?.user) return { error: 'Sesion no valida', status: 401 }
  if ((data.user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { error: 'No autorizado', status: 403 }
  }
  return { user: data.user }
}

// GET /api/admin/simulador-revisiones
// Returns all revisions (newest first) with restaurant name
export async function GET(req) {
  try {
    const auth = await validarAdmin(req)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin
      .from('simulador_revisiones')
      .select(`
        id, estado, mensaje_restaurante, respuesta_consultor, created_at, updated_at,
        restaurantes(id, nombre, email)
      `)
      .order('created_at', { ascending: false })
      .limit(40)

    if (error) throw error
    return Response.json({ revisiones: data || [] })
  } catch (err) {
    console.error('[admin/simulador-revisiones GET]', err)
    return Response.json({ error: 'No se pudieron cargar las revisiones.' }, { status: 500 })
  }
}

// PATCH /api/admin/simulador-revisiones
// Body: { id, respuesta_consultor }
// Consultor responds → estado='revisado'
export async function PATCH(req) {
  try {
    const auth = await validarAdmin(req)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const body = await req.json()
    const id = String(body.id || '').trim()
    const respuesta = String(body.respuesta_consultor || '').trim().slice(0, 4000)
    if (!id) return Response.json({ error: 'id obligatorio' }, { status: 400 })

    const { data: revision, error: updateError } = await supabaseAdmin
      .from('simulador_revisiones')
      .update({
        estado: 'revisado',
        respuesta_consultor: respuesta || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select()
      .single()

    if (updateError) throw updateError
    if (!revision) return Response.json({ error: 'Revisión no encontrada o ya respondida' }, { status: 404 })

    return Response.json({ revision })
  } catch (err) {
    console.error('[admin/simulador-revisiones PATCH]', err)
    return Response.json({ error: 'No se pudo guardar la respuesta.' }, { status: 500 })
  }
}
