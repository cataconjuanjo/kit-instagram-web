import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

export async function GET(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ tienda: null })

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user?.email) return NextResponse.json({ tienda: null })

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('slug, nombre, ciudad')
    .eq('email', user.email)
    .eq('activo', true)
    .single()

  return NextResponse.json({ tienda: tienda || null })
}
