import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin'

async function getTiendaId(slug) {
  const { data } = await supabaseAdmin
    .from('tiendas')
    .select('id')
    .eq('slug', slug)
    .single()
  return data?.id || null
}

export async function PATCH(request, { params }) {
  const { slug, id } = await params
  const tiendaId = await getTiendaId(slug)
  if (!tiendaId) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const { id: _id, created_at: _c, updated_at: _u, tienda_id: _t, ...campos } = body

  const { data, error } = await supabaseAdmin
    .from('vinos_tienda')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tienda_id', tiendaId)
    .select()
    .single()

  if (error) {
    console.error('admin/vinos PATCH:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ vino: data })
}

export async function DELETE(request, { params }) {
  const { slug, id } = await params
  const tiendaId = await getTiendaId(slug)
  if (!tiendaId) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const { error } = await supabaseAdmin
    .from('vinos_tienda')
    .delete()
    .eq('id', id)
    .eq('tienda_id', tiendaId)

  if (error) {
    console.error('admin/vinos DELETE:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
