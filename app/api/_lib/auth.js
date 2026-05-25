import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

export async function getUserFromRequest(req) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sesion no recibida', status: 401 }

  const supabaseAuth = createClient(supabaseUrl, anonKey)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesion no valida', status: 401 }

  return { user: data.user }
}

export async function requireUser(req) {
  return getUserFromRequest(req)
}

export async function requireRestaurantAccess(req, adminSupabase, restauranteId) {
  const auth = await getUserFromRequest(req)
  if (auth.error) return auth

  const email = (auth.user.email || '').toLowerCase()
  if (email === adminEmail.toLowerCase()) return auth

  if (!restauranteId) return { error: 'restaurante_id obligatorio', status: 400 }

  const { data: restaurante, error } = await adminSupabase
    .from('restaurantes')
    .select('id')
    .eq('id', restauranteId)
    .eq('email', email)
    .single()

  if (error || !restaurante) return { error: 'No autorizado', status: 403 }
  return auth
}
