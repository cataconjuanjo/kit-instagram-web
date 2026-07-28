import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const tienda = access.tienda

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const { vino_id, vino_nombre, stock_anterior, stock_nuevo } = body || {}
  if (!vino_id || stock_anterior == null || stock_nuevo == null) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('stock_movements').insert({
    tienda_id: tienda.id,
    vino_id,
    vino_nombre: vino_nombre || null,
    stock_anterior: Number(stock_anterior),
    stock_nuevo:    Number(stock_nuevo),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
