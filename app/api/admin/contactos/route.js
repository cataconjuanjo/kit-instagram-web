import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

const SELECT_CONTACTO = [
  'id', 'restaurante_id', 'ocurrido_en', 'canal', 'resumen',
  'proximo_contacto', 'creado_por', 'created_at',
].join(', ')
const CANALES = new Set(['llamada', 'visita', 'whatsapp', 'email', 'otro'])

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
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function esTablaNoExiste(error) {
  const texto = String(error?.message || '')
  return error?.code === 'PGRST205' || error?.code === '42P01'
    || /Could not find the table/i.test(texto)
    || /relation .* does not exist/i.test(texto)
}

export async function GET(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    const supa = adminClient()

    let query = supa.from('consultor_contactos').select(SELECT_CONTACTO)
      .order('ocurrido_en', { ascending: false })
      .limit(100)
    if (restauranteId) query = query.eq('restaurante_id', restauranteId)

    const { data, error } = await query
    if (error) {
      if (esTablaNoExiste(error)) {
        return Response.json({ items: [], pendiente_migracion: true })
      }
      throw error
    }
    return Response.json({ items: data || [] })
  } catch (error) {
    console.error('Error leyendo contactos:', error)
    return Response.json({ error: 'No se pudieron cargar los contactos.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json().catch(() => ({}))
    const restauranteId = String(body.restaurante_id || '').trim()
    const canal = String(body.canal || '').trim().toLowerCase()
    const resumen = String(body.resumen || '').trim().slice(0, 1000)
    const proximoContacto = body.proximo_contacto ? String(body.proximo_contacto) : null
    const ocurridoEn = body.ocurrido_en ? new Date(body.ocurrido_en).toISOString() : new Date().toISOString()

    if (!restauranteId) return Response.json({ error: 'restaurante_id es obligatorio' }, { status: 400 })
    if (!CANALES.has(canal)) return Response.json({ error: 'Canal no válido' }, { status: 400 })
    if (!resumen) return Response.json({ error: 'El resumen es obligatorio' }, { status: 400 })

    const supa = adminClient()
    const { data, error } = await supa.from('consultor_contactos')
      .insert({
        restaurante_id: restauranteId,
        canal,
        resumen,
        proximo_contacto: proximoContacto,
        ocurrido_en: ocurridoEn,
        creado_por: admin.user?.id || null,
      })
      .select(SELECT_CONTACTO)
      .single()

    if (error) {
      if (esTablaNoExiste(error)) {
        return Response.json({ error: 'La tabla de contactos aún no está aplicada en Supabase.', pendiente_migracion: true }, { status: 503 })
      }
      throw error
    }
    return Response.json({ contacto: data })
  } catch (error) {
    console.error('Error creando contacto:', error)
    return Response.json({ error: 'No se pudo registrar el contacto.' }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return Response.json({ error: 'id requerido' }, { status: 400 })

    const supa = adminClient()
    const { error } = await supa.from('consultor_contactos').delete().eq('id', id)
    if (error) {
      if (esTablaNoExiste(error)) {
        return Response.json({ error: 'La tabla de contactos aún no está aplicada en Supabase.', pendiente_migracion: true }, { status: 503 })
      }
      throw error
    }
    return Response.json({ ok: true })
  } catch (error) {
    console.error('Error borrando contacto:', error)
    return Response.json({ error: 'No se pudo borrar el contacto.' }, { status: 500 })
  }
}
