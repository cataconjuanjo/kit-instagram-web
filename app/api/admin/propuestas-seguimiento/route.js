import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

const SELECT_SEGUIMIENTO = [
  'id', 'propuesta_id', 'restaurante_id', 'estado',
  'enviada_en', 'aceptada_en', 'implantada_en',
  'importe_estimado_eur', 'importe_capturado_eur', 'nota',
  'created_at', 'updated_at',
].join(', ')

const ESTADOS = ['propuesta', 'enviada', 'aceptada', 'rechazada', 'implantada']

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

function numeroOpcional(valor) {
  if (valor === '' || valor === null || valor === undefined) return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

export async function GET(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    const supa = adminClient()

    let query = supa.from('consultor_propuesta_seguimiento').select(SELECT_SEGUIMIENTO)
      .order('updated_at', { ascending: false })
      .limit(500)
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
    console.error('Error leyendo seguimiento:', error)
    return Response.json({ error: 'No se pudo cargar el seguimiento.' }, { status: 500 })
  }
}

export async function PUT(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json().catch(() => ({}))
    const propuestaId = String(body.propuesta_id || '').trim()
    const restauranteId = String(body.restaurante_id || '').trim()
    const estado = String(body.estado || 'propuesta').trim().toLowerCase()

    if (!propuestaId) return Response.json({ error: 'propuesta_id es obligatorio' }, { status: 400 })
    if (!restauranteId) return Response.json({ error: 'restaurante_id es obligatorio' }, { status: 400 })
    if (!ESTADOS.includes(estado)) return Response.json({ error: 'Estado no válido' }, { status: 400 })

    const ahora = new Date().toISOString()
    const parche = {
      propuesta_id: propuestaId,
      restaurante_id: restauranteId,
      estado,
      importe_estimado_eur: numeroOpcional(body.importe_estimado_eur),
      importe_capturado_eur: numeroOpcional(body.importe_capturado_eur),
      nota: body.nota != null ? String(body.nota).slice(0, 2000) : null,
    }
    // Actualizar sellos temporales de forma aditiva: si llega estado
    // 'enviada' sin enviada_en previa, anotamos ahora. El cliente puede
    // forzar fechas pasándolas en el body.
    if (body.enviada_en !== undefined) parche.enviada_en = body.enviada_en
    if (body.aceptada_en !== undefined) parche.aceptada_en = body.aceptada_en
    if (body.implantada_en !== undefined) parche.implantada_en = body.implantada_en

    const supa = adminClient()
    // Upsert por propuesta_id (UNIQUE). Rellenamos el sello nuevo del
    // estado si no vino en el body.
    const { data: existente, error: errorLee } = await supa
      .from('consultor_propuesta_seguimiento')
      .select(SELECT_SEGUIMIENTO)
      .eq('propuesta_id', propuestaId)
      .maybeSingle()
    if (errorLee && !esTablaNoExiste(errorLee)) throw errorLee
    if (errorLee && esTablaNoExiste(errorLee)) {
      return Response.json({ error: 'Tabla de seguimiento no aplicada en Supabase.', pendiente_migracion: true }, { status: 503 })
    }

    if (estado === 'enviada' && parche.enviada_en === undefined && !existente?.enviada_en) parche.enviada_en = ahora
    if (estado === 'aceptada' && parche.aceptada_en === undefined && !existente?.aceptada_en) parche.aceptada_en = ahora
    if (estado === 'implantada' && parche.implantada_en === undefined && !existente?.implantada_en) parche.implantada_en = ahora

    const { data, error } = await supa
      .from('consultor_propuesta_seguimiento')
      .upsert(parche, { onConflict: 'propuesta_id' })
      .select(SELECT_SEGUIMIENTO)
      .single()
    if (error) {
      if (esTablaNoExiste(error)) {
        return Response.json({ error: 'Tabla de seguimiento no aplicada en Supabase.', pendiente_migracion: true }, { status: 503 })
      }
      throw error
    }
    return Response.json({ item: data })
  } catch (error) {
    console.error('Error upserting seguimiento:', error)
    return Response.json({ error: 'No se pudo guardar el seguimiento.' }, { status: 500 })
  }
}
