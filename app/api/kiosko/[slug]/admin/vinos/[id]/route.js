import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../../lib/supabaseAdmin'
import { ADMIN_VINO_SELECT, pickWritableVinoFields, requireKioskoAccess } from '../../../../../_lib/kioskoAuth'

export async function PATCH(request, { params }) {
  const { slug, id } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const campos = pickWritableVinoFields(body)
  if (!Object.keys(campos).length) {
    return NextResponse.json({ error: 'Sin campos validos' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('vinos_tienda')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tienda_id', access.tienda.id)
    .select(ADMIN_VINO_SELECT)
    .single()

  if (error) {
    console.error('admin/vinos PATCH:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { ficha_ia, ...vino } = data
  return NextResponse.json({ vino: { ...vino, has_ficha_ia: ficha_ia != null } })
}

export async function DELETE(request, { params }) {
  const { slug, id } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const { error } = await supabaseAdmin
    .from('vinos_tienda')
    .delete()
    .eq('id', id)
    .eq('tienda_id', access.tienda.id)

  if (error) {
    console.error('admin/vinos DELETE:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
