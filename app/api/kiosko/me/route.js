import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export async function GET(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ tienda: null })

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user?.email) return NextResponse.json({ tienda: null })

  const email = user.email.toLowerCase()

  // Buscar por propietario_email primero, luego por email genérico de la tienda
  let { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('slug, nombre, ciudad')
    .eq('propietario_email', email)
    .maybeSingle()

  if (!tienda) {
    const { data: tiendaFallback } = await supabaseAdmin
      .from('tiendas')
      .select('slug, nombre, ciudad')
      .eq('email', email)
      .maybeSingle()
    tienda = tiendaFallback
  }

  return NextResponse.json({ tienda: tienda || null })
}
