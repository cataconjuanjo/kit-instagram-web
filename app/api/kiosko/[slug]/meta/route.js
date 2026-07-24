import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export async function GET(request, { params }) {
  const { slug } = await params

  const { data: tienda, error } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, slug, logo_url, descripcion, ciudad, color_primario, color_acento, banner_url')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (error || !tienda) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  return NextResponse.json({ tienda })
}
