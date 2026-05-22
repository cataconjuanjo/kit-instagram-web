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

function texto(body, campo) {
  return String(body[campo] || '').trim()
}

function dinero(valor) {
  return valor === '' || valor === null || valor === undefined ? 0 : Number(valor) || 0
}

function payloadProveedor(body) {
  return {
    nombre: texto(body, 'nombre'),
    contacto: texto(body, 'contacto') || null,
    email: texto(body, 'email') || null,
    telefono: texto(body, 'telefono') || null,
    zona: texto(body, 'zona') || null,
    notas: texto(body, 'notas') || null,
    visible_restaurantes: Boolean(body.visible_restaurantes),
    updated_at: new Date().toISOString()
  }
}

function payloadVino(body) {
  return {
    proveedor_id: body.proveedor_id,
    nombre: texto(body, 'nombre'),
    bodega: texto(body, 'bodega') || null,
    tipo: texto(body, 'tipo') || null,
    region: texto(body, 'region') || null,
    uva: texto(body, 'uva') || null,
    anada: texto(body, 'anada') || null,
    referencia: texto(body, 'referencia') || null,
    formato: texto(body, 'formato') || null,
    coste_estimado: dinero(body.coste_estimado),
    pvp_recomendado: dinero(body.pvp_recomendado),
    disponibilidad: texto(body, 'disponibilidad') || null,
    notas: texto(body, 'notas') || null,
    activo: body.activo !== false,
    updated_at: new Date().toISOString()
  }
}

export async function GET(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const supabase = adminClient()
    const [{ data: proveedores, error: proveedoresError }, { data: vinos, error: vinosError }] = await Promise.all([
      supabase.from('proveedores_vino').select('*').order('nombre'),
      supabase
        .from('proveedor_catalogo_vinos')
        .select('*, proveedores_vino(nombre)')
        .order('created_at', { ascending: false })
    ])

    if (proveedoresError) throw proveedoresError
    if (vinosError) throw vinosError

    return Response.json({ proveedores: proveedores || [], vinos: vinos || [] })
  } catch (error) {
    console.error('Error leyendo proveedores:', error)
    return Response.json({ error: 'No se pudieron cargar los proveedores.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const supabase = adminClient()

    if (body.kind === 'vino') {
      const dataPayload = payloadVino(body)
      if (!dataPayload.proveedor_id || !dataPayload.nombre) {
        return Response.json({ error: 'Proveedor y nombre del vino son obligatorios.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('proveedor_catalogo_vinos')
        .insert([dataPayload])
        .select('*, proveedores_vino(nombre)')
        .single()

      if (error) throw error
      return Response.json({ vino: data })
    }

    const dataPayload = payloadProveedor(body)
    if (!dataPayload.nombre) return Response.json({ error: 'El nombre del proveedor es obligatorio.' }, { status: 400 })

    const { data, error } = await supabase
      .from('proveedores_vino')
      .insert([dataPayload])
      .select('*')
      .single()

    if (error) throw error
    return Response.json({ proveedor: data })
  } catch (error) {
    console.error('Error creando proveedor/catálogo:', error)
    return Response.json({ error: 'No se pudo guardar.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    if (!body.id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })
    const supabase = adminClient()

    if (body.kind === 'vino') {
      const dataPayload = payloadVino(body)
      if (!dataPayload.proveedor_id || !dataPayload.nombre) {
        return Response.json({ error: 'Proveedor y nombre del vino son obligatorios.' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('proveedor_catalogo_vinos')
        .update(dataPayload)
        .eq('id', body.id)
        .select('*, proveedores_vino(nombre)')
        .single()

      if (error) throw error
      return Response.json({ vino: data })
    }

    const dataPayload = payloadProveedor(body)
    if (!dataPayload.nombre) return Response.json({ error: 'El nombre del proveedor es obligatorio.' }, { status: 400 })

    const { data, error } = await supabase
      .from('proveedores_vino')
      .update(dataPayload)
      .eq('id', body.id)
      .select('*')
      .single()

    if (error) throw error
    return Response.json({ proveedor: data })
  } catch (error) {
    console.error('Error editando proveedor/catálogo:', error)
    return Response.json({ error: 'No se pudo editar.' }, { status: 500 })
  }
}

export async function DELETE(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const { id, kind } = await req.json()
    if (!id) return Response.json({ error: 'ID obligatorio.' }, { status: 400 })

    const tabla = kind === 'vino' ? 'proveedor_catalogo_vinos' : 'proveedores_vino'
    const { error } = await adminClient().from(tabla).delete().eq('id', id)
    if (error) throw error

    return Response.json({ ok: true })
  } catch (error) {
    console.error('Error borrando proveedor/catálogo:', error)
    return Response.json({ error: 'No se pudo borrar.' }, { status: 500 })
  }
}
