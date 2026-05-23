import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

function normalizarSlug(texto = '') {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function generarPassword() {
  const parte = Math.random().toString(36).slice(2, 8)
  const sufijo = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `CartaViva-${parte}-${sufijo}!`
}

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

export async function POST(req) {
  try {
    if (!serviceRoleKey) {
      return Response.json({
        error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel. Es necesaria para crear usuarios de acceso.'
      }, { status: 500 })
    }

    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const nombre = String(body.nombre || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const ciudad = String(body.ciudad || '').trim()
    const slug = normalizarSlug(body.slug || nombre)
    const password = String(body.password || '').trim() || generarPassword()

    if (!nombre || !email || !slug) {
      return Response.json({ error: 'Nombre, email y slug son obligatorios.' }, { status: 400 })
    }
    if (password.length < 8) {
      return Response.json({ error: 'La contrasena debe tener al menos 8 caracteres.' }, { status: 400 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: existentes, error: existeError } = await adminSupabase
      .from('restaurantes')
      .select('id, email, slug')
      .or(`email.eq.${email},slug.eq.${slug}`)

    if (existeError) throw existeError
    if (existentes?.some(r => r.email === email)) {
      return Response.json({ error: 'Ya existe un restaurante con ese email.' }, { status: 409 })
    }
    if (existentes?.some(r => r.slug === slug)) {
      return Response.json({ error: 'Ya existe un restaurante con ese slug.' }, { status: 409 })
    }

    const { error: userError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { restaurante: nombre }
    })

    if (userError) {
      return Response.json({ error: `No se pudo crear el usuario: ${userError.message}` }, { status: 400 })
    }

    const { data: restaurante, error: restauranteError } = await adminSupabase
      .from('restaurantes')
      .insert([{
        nombre,
        slug,
        email,
        ciudad,
        color_primario: body.color_primario || '#531827',
        color_fondo: body.color_fondo || '#fffaf3',
        color_acento: body.color_acento || '#bfa984',
        tipografia: body.tipografia || 'serif',
        hub_activo: Boolean(body.hub_activo),
        hub_titulo: body.hub_titulo || null,
        hub_subtitulo: body.hub_subtitulo || null,
        instagram_url: body.instagram_url || null,
        facebook_url: body.facebook_url || null,
        plan: body.plan || 'basic',
        subscription_status: body.subscription_status || 'trialing',
        ticket_medio_comida: body.ticket_medio_comida === '' || body.ticket_medio_comida === undefined ? null : Number(body.ticket_medio_comida) || null,
        banner_zoom: 100,
        banner_x: 50,
        banner_y: 50
      }])
      .select('*')
      .single()

    if (restauranteError) throw restauranteError

    return Response.json({
      restaurante,
      credenciales: { email, password },
      urls: {
        dashboard: '/login',
        carta: `/carta/${slug}`,
        camarero: `/camarero/${slug}`
      }
    })
  } catch (error) {
    console.error('Error creando restaurante desde admin:', error)
    return Response.json({ error: 'No se pudo crear el restaurante.' }, { status: 500 })
  }
}

export async function PUT(req) {
  try {
    if (!serviceRoleKey) {
      return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 })
    }

    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '').trim()

    if (!email || !password || password.length < 8) {
      return Response.json({ error: 'Email y contraseña (mín. 8 caracteres) son obligatorios.' }, { status: 400 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: { users }, error: listError } = await adminSupabase.auth.admin.listUsers({ perPage: 1000 })
    if (listError) throw listError

    const authUser = users?.find(u => u.email?.toLowerCase() === email)
    if (!authUser) {
      return Response.json({ error: 'No se encontró usuario con ese email en Supabase Auth.' }, { status: 404 })
    }

    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(authUser.id, { password })
    if (updateError) throw updateError

    return Response.json({ ok: true, email, password })
  } catch (error) {
    console.error('Error reseteando contraseña:', error)
    return Response.json({ error: 'No se pudo cambiar la contraseña.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    if (!serviceRoleKey) {
      return Response.json({
        error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel. Es necesaria para editar restaurantes desde superadmin.'
      }, { status: 500 })
    }

    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const id = String(body.id || '').trim()
    const nombre = String(body.nombre || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const ciudad = String(body.ciudad || '').trim()
    const slug = normalizarSlug(body.slug || nombre)

    if (!id || !nombre || !email || !slug) {
      return Response.json({ error: 'ID, nombre, email y slug son obligatorios.' }, { status: 400 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: conflictos, error: conflictoError } = await adminSupabase
      .from('restaurantes')
      .select('id, email, slug')
      .or(`email.eq.${email},slug.eq.${slug}`)
      .neq('id', id)

    if (conflictoError) throw conflictoError
    if (conflictos?.some(r => r.email === email)) {
      return Response.json({ error: 'Ya existe otro restaurante con ese email.' }, { status: 409 })
    }
    if (conflictos?.some(r => r.slug === slug)) {
      return Response.json({ error: 'Ya existe otro restaurante con ese slug.' }, { status: 409 })
    }

    const cambios = {
      nombre,
      email,
      ciudad,
      slug,
      color_primario: body.color_primario || '#531827',
      color_fondo: body.color_fondo || '#fffaf3',
      color_acento: body.color_acento || '#bfa984',
      tipografia: body.tipografia || 'serif',
      hub_activo: Boolean(body.hub_activo),
      hub_titulo: body.hub_titulo || null,
      hub_subtitulo: body.hub_subtitulo || null,
      instagram_url: body.instagram_url || null,
      facebook_url: body.facebook_url || null,
      plan: body.plan || 'basic',
      subscription_status: body.subscription_status || 'trialing',
      ticket_medio_comida: body.ticket_medio_comida === '' || body.ticket_medio_comida === undefined ? null : Number(body.ticket_medio_comida) || null
    }

    const { data: restaurante, error } = await adminSupabase
      .from('restaurantes')
      .update(cambios)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return Response.json({
      restaurante,
      urls: {
        carta: `/carta/${slug}`,
        camarero: `/camarero/${slug}`
      }
    })
  } catch (error) {
    console.error('Error editando restaurante desde admin:', error)
    return Response.json({ error: 'No se pudo editar el restaurante.' }, { status: 500 })
  }
}
