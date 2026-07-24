import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

async function validarAdmin(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sin sesión', status: 401 }
  const sc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data, error } = await sc.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesión inválida', status: 401 }
  if (data.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) return { error: 'No autorizado', status: 403 }
  return { user: data.user }
}

export async function GET(req) {
  try {
    const check = await validarAdmin(req)
    if (check.error) return Response.json({ error: check.error }, { status: check.status })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await sb
      .from('tiendas')
      .select('id, nombre, email, slug, ciudad, activo, subscription_status, stripe_customer_id, created_at')
      .order('created_at', { ascending: false })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    return Response.json({ tiendas: data || [] })
  } catch (err) {
    console.error('[admin/kiosko/lista]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const check = await validarAdmin(req)
    if (check.error) return Response.json({ error: check.error }, { status: check.status })

    const { id, ...campos } = await req.json()
    if (!id) return Response.json({ error: 'Falta id' }, { status: 400 })

    const permitidos = ['activo', 'nombre', 'ciudad', 'color_primario', 'color_acento', 'subscription_status']
    const update = Object.fromEntries(Object.entries(campos).filter(([k]) => permitidos.includes(k)))
    if (!Object.keys(update).length) return Response.json({ error: 'Sin campos válidos' }, { status: 400 })

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await sb.from('tiendas').update(update).eq('id', id).select().single()
    if (error) return Response.json({ error: error.message }, { status: 500 })

    return Response.json({ ok: true, tienda: data })
  } catch (err) {
    console.error('[admin/kiosko/lista PATCH]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
