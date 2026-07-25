import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { isAdminEmail } from '../../../demo'

// Lista tiendas para el panel multi-tienda.
// Si es superadmin → devuelve todas.
// Si tiene propietario_email → devuelve solo las suyas.
export async function GET(request) {
  const auth  = request.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '').trim()

  // Resolver usuario desde token Supabase
  let userEmail = null
  if (token) {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)
    userEmail = user?.email || null
  }

  let query = supabaseAdmin
    .from('tiendas')
    .select('id, nombre, slug, logo_url, ciudad, plan, activo, created_at')
    .order('nombre')

  // Superadmin ve todo; usuario normal solo sus tiendas
  if (userEmail && !isAdminEmail(userEmail)) {
    query = query.eq('propietario_email', userEmail)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tiendas: data || [] })
}
