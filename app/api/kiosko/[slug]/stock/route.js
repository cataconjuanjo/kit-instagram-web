import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export async function GET(request, { params }) {
  const { slug } = await params

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (!tienda) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since') // ISO timestamp — solo devolver cambios posteriores

  let query = supabaseAdmin
    .from('vinos_tienda')
    .select('id, stock, activo, updated_at')
    .eq('tienda_id', tienda.id)
    .eq('categoria', 'vino')

  if (since) query = query.gt('updated_at', since)

  const { data } = await query
  const ahora = new Date().toISOString()

  return NextResponse.json(
    { items: data || [], serverTime: ahora },
    {
      headers: {
        'Cache-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
      },
    }
  )
}
