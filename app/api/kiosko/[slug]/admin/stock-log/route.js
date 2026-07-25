import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

export async function POST(request, { params }) {
  const { slug } = await params

  const { data: tienda } = await supabaseAdmin
    .from('tiendas').select('id').eq('slug', slug).single()
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

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
