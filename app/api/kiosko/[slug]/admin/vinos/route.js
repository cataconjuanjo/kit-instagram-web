import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { ADMIN_VINO_SELECT, pickWritableVinoFields, requireKioskoAccess } from '../../../../_lib/kioskoAuth'

export async function GET(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data, error } = await supabaseAdmin
    .from('vinos_tienda')
    .select(ADMIN_VINO_SELECT)
    .eq('tienda_id', access.tienda.id)
    .order('destacado', { ascending: false })
    .order('nombre')
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sustituir ficha_ia (JSON grande) por booleano para reducir payload
  const vinos = (data || []).map(({ ficha_ia, ...v }) => ({ ...v, has_ficha_ia: ficha_ia != null }))
  return NextResponse.json({ vinos })
}

export async function POST(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const campos = pickWritableVinoFields(body)
  if (!String(campos.nombre || '').trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('vinos_tienda')
    .insert({ ...campos, tienda_id: access.tienda.id })
    .select(ADMIN_VINO_SELECT)
    .single()

  if (error) {
    console.error('admin/vinos POST:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { ficha_ia, ...vino } = data
  return NextResponse.json({ vino: { ...vino, has_ficha_ia: ficha_ia != null } }, { status: 201 })
}
