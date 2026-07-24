import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

const PERMITIDOS = new Set([
  'nombre', 'ciudad', 'descripcion',
  'logo_url', 'color_primario', 'color_acento', 'font_family', 'banner_url',
])

export async function PATCH(request, { params }) {
  const { slug } = await params

  const { data: tienda } = await supabaseAdmin
    .from('tiendas').select('id').eq('slug', slug).single()
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const updates = {}
  for (const [k, v] of Object.entries(body || {})) {
    if (PERMITIDOS.has(k)) updates[k] = v === '' ? null : v
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Sin campos válidos' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('tiendas').update(updates).eq('id', tienda.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
