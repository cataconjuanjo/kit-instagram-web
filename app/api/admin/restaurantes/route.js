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

function segundosPrueba(valor) {
  if (valor === '' || valor === undefined || valor === null) return null
  const numero = Number(valor)
  if (!Number.isFinite(numero) || numero <= 0) return null
  return Math.round(numero * 60 * 60)
}

function fechaPrueba(valor) {
  const texto = String(valor || '').trim()
  if (!texto) return null
  const fecha = new Date(texto)
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString()
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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://cataconjuanjo.com'

function textoErrorSupabase(error) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ').toLowerCase()
}

function historialPublicacionPendiente(error) {
  const texto = textoErrorSupabase(error)
  return texto.includes('publication_events') || ['42P01', 'PGRST205'].includes(String(error?.code || ''))
}

function snapshotsPublicacionPendiente(error) {
  const texto = textoErrorSupabase(error)
  return texto.includes('publication_snapshots') || ['42P01', 'PGRST205'].includes(String(error?.code || ''))
}

async function leerUltimosEventosPublicacion(adminSupabase) {
  const { data, error } = await adminSupabase
    .from('publication_events')
    .select('id, restaurante_id, accion, estado_anterior, estado_nuevo, contenido_resumen, actor_email, created_at')
    .order('created_at', { ascending: false })
    .limit(300)

  if (historialPublicacionPendiente(error)) return { eventosPorRestaurante: {}, pendiente: true }
  if (error) return { error }

  const eventosPorRestaurante = {}
  for (const evento of data || []) {
    if (!eventosPorRestaurante[evento.restaurante_id]) eventosPorRestaurante[evento.restaurante_id] = evento
  }
  return { eventosPorRestaurante, pendiente: false }
}

async function leerUltimosSnapshotsPublicacion(adminSupabase) {
  const { data, error } = await adminSupabase
    .from('publication_snapshots')
    .select('id, restaurante_id, publication_event_id, version_number, contenido_resumen, restaurante_resumen, actor_email, created_at')
    .order('version_number', { ascending: false })
    .limit(300)

  if (snapshotsPublicacionPendiente(error)) return { snapshotsPorRestaurante: {}, pendiente: true }
  if (error) return { error }

  const snapshotsPorRestaurante = {}
  for (const snapshot of data || []) {
    if (!snapshotsPorRestaurante[snapshot.restaurante_id]) snapshotsPorRestaurante[snapshot.restaurante_id] = snapshot
  }
  return { snapshotsPorRestaurante, pendiente: false }
}

export async function GET(req) {
  try {
    if (!serviceRoleKey) {
      return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 })
    }

    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: restaurantes, error } = await adminSupabase
      .from('restaurantes')
      .select('*')
      .order('nombre')
    if (error) throw error

    const eventosRes = await leerUltimosEventosPublicacion(adminSupabase)
    if (eventosRes.error) throw eventosRes.error
    const snapshotsRes = await leerUltimosSnapshotsPublicacion(adminSupabase)
    if (snapshotsRes.error) throw snapshotsRes.error

    return Response.json({
      restaurantes: (restaurantes || []).map(restaurante => ({
        ...restaurante,
        publication_last_event: eventosRes.eventosPorRestaurante[restaurante.id] || null,
        publication_last_snapshot: snapshotsRes.snapshotsPorRestaurante[restaurante.id] || null,
        publication_history_pending: Boolean(eventosRes.pendiente),
        publication_snapshot_pending: Boolean(snapshotsRes.pendiente),
      })),
      publication_history_pending: Boolean(eventosRes.pendiente),
      publication_snapshot_pending: Boolean(snapshotsRes.pendiente),
      sql: eventosRes.pendiente
        ? 'supabase/add_publication_history.sql'
        : snapshotsRes.pendiente
          ? 'supabase/add_publication_snapshots.sql'
          : null,
    })
  } catch (error) {
    console.error('Error cargando restaurantes desde admin:', error)
    return Response.json({ error: 'No se pudieron cargar los restaurantes.' }, { status: 500 })
  }
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

    if (!nombre || !email || !slug) {
      return Response.json({ error: 'Nombre, email y slug son obligatorios.' }, { status: 400 })
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

    // Enviamos invitación por email: Supabase manda el enlace de activación automáticamente.
    // El usuario hace clic → llega a /bienvenida → elige su propia contraseña.
    const { error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${SITE_URL}/bienvenida`,
      data: { restaurante: nombre }
    })

    if (inviteError) {
      // Si el usuario ya existe como invitado previo (no confirmado), intentamos reenviar
      if (inviteError.message?.toLowerCase().includes('already been invited')) {
        // Generamos un nuevo enlace de recuperación para que pueda activar su cuenta
        const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: { redirectTo: `${SITE_URL}/bienvenida` }
        })
        if (linkError) {
          return Response.json({ error: `No se pudo reenviar la invitación: ${linkError.message}` }, { status: 400 })
        }
      } else {
        return Response.json({ error: `No se pudo enviar la invitación: ${inviteError.message}` }, { status: 400 })
      }
    }

    const payloadRestaurante = {
      nombre,
      slug,
      email,
      ciudad,
      color_primario: body.color_primario || '#74223d',
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
      trial_active_seconds_limit: segundosPrueba(body.trial_hours_limit),
      trial_expires_at: fechaPrueba(body.trial_expires_at),
      trial_started_at: body.subscription_status === 'trialing' ? new Date().toISOString() : null,
      ticket_medio_comida: body.ticket_medio_comida === '' || body.ticket_medio_comida === undefined ? null : Number(body.ticket_medio_comida) || null,
      carta_publica_activa: false,
      banner_zoom: 100,
      banner_x: 50,
      banner_y: 50
    }

    let publicationMigrationPending = false
    let insertRes = await adminSupabase
      .from('restaurantes')
      .insert([payloadRestaurante])
      .select('*')
      .single()

    const insertErrorText = [
      insertRes.error?.message,
      insertRes.error?.details,
      insertRes.error?.hint,
      insertRes.error?.code,
    ].filter(Boolean).join(' ').toLowerCase()

    if (insertRes.error && insertErrorText.includes('carta_publica_activa')) {
      publicationMigrationPending = true
      const payloadSinPublicacion = { ...payloadRestaurante }
      delete payloadSinPublicacion.carta_publica_activa
      insertRes = await adminSupabase
        .from('restaurantes')
        .insert([payloadSinPublicacion])
        .select('*')
        .single()
    }

    const { data: restaurante, error: restauranteError } = insertRes

    if (restauranteError) throw restauranteError

    return Response.json({
      restaurante,
      invitacion: { enviada: true, email },
      publication_migration_pending: publicationMigrationPending,
      urls: {
        bienvenida: `${SITE_URL}/bienvenida`,
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
    // modo: 'email' → manda link de recuperación | 'manual' → cambia contraseña directamente
    const modo = body.modo === 'manual' ? 'manual' : 'email'
    const password = String(body.password || '').trim()

    if (!email) {
      return Response.json({ error: 'El email es obligatorio.' }, { status: 400 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // ── Modo email: genera enlace de recuperación y lo devuelve (o lo manda Supabase) ──
    if (modo === 'email') {
      const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${SITE_URL}/bienvenida` }
      })
      if (linkError) {
        return Response.json({ error: `No se pudo generar el enlace: ${linkError.message}` }, { status: 400 })
      }
      // Devolvemos el enlace para que el admin lo comparta si quiere, o simplemente confirmamos
      return Response.json({ ok: true, modo: 'email', email, link: linkData?.properties?.action_link })
    }

    // ── Modo manual: cambia la contraseña directamente (flujo anterior) ──
    if (!password || password.length < 8) {
      return Response.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 })
    }

    const filterRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(`email="${email}"`)}`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    )
    const filterData = await filterRes.json()
    const authUser = filterData.users?.[0]

    if (!authUser) {
      // Fallback: paginar listUsers
      let found = null
      let page = 1
      while (!found) {
        const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage: 50 })
        if (error || !data?.users?.length) break
        found = data.users.find(u => u.email?.toLowerCase() === email)
        if (!data.nextPage) break
        page++
      }
      if (!found) {
        return Response.json({ error: `No se encontró usuario con email ${email} en Supabase Auth.` }, { status: 404 })
      }
      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(found.id, { password })
      if (updateError) throw updateError
      return Response.json({ ok: true, modo: 'manual', email, password })
    }

    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(authUser.id, { password })
    if (updateError) throw updateError

    return Response.json({ ok: true, modo: 'manual', email, password })
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
      color_primario: body.color_primario || '#74223d',
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
      trial_active_seconds_limit: segundosPrueba(body.trial_hours_limit),
      trial_expires_at: fechaPrueba(body.trial_expires_at),
      trial_started_at: body.trial_started_at || (body.subscription_status === 'trialing' ? new Date().toISOString() : null),
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

export async function DELETE(req) {
  try {
    if (!serviceRoleKey) {
      return Response.json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 })
    }

    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ error: admin.error }, { status: admin.status })

    const body = await req.json()
    const id = String(body.id || '').trim()
    const email = String(body.email || '').trim().toLowerCase()

    if (!id || !email) {
      return Response.json({ error: 'ID y email son obligatorios.' }, { status: 400 })
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. Borrar el restaurante de la base de datos
    const { error: dbError } = await adminSupabase
      .from('restaurantes')
      .delete()
      .eq('id', id)

    if (dbError) throw dbError

    // 2. Buscar y borrar el usuario de Supabase Auth
    const filterRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(`email="${email}"`)}`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    )
    const filterData = await filterRes.json()
    const authUser = filterData.users?.[0]

    if (authUser) {
      const { error: authError } = await adminSupabase.auth.admin.deleteUser(authUser.id)
      if (authError) console.error('Error borrando usuario auth:', authError)
    } else {
      // Fallback: buscar paginando
      let found = null
      let page = 1
      while (!found) {
        const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage: 50 })
        if (error || !data?.users?.length) break
        found = data.users.find(u => u.email?.toLowerCase() === email)
        if (!data.nextPage) break
        page++
      }
      if (found) {
        await adminSupabase.auth.admin.deleteUser(found.id)
      }
    }

    return Response.json({ ok: true, email })
  } catch (error) {
    console.error('Error dando de baja restaurante:', error)
    return Response.json({ error: 'No se pudo dar de baja el restaurante.' }, { status: 500 })
  }
}
