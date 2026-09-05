import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { isTiendaAccesible } from '../../../_lib/kioskoAuth'

const ALLOWED_MODES = ['regalo', 'explorar']

export async function POST(request, { params }) {
  const { slug } = await params

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const mode    = String(body?.mode    || '').trim()
  const consulta = String(body?.consulta || '').slice(0, 200).trim()

  if (!ALLOWED_MODES.includes(mode) || !consulta) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const vinos_ids     = Array.isArray(body?.vinos_ids)     ? body.vinos_ids.map(String).slice(0, 20)     : []
  const vinos_nombres = Array.isArray(body?.vinos_nombres) ? body.vinos_nombres.map(String).slice(0, 20) : []

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, activo, subscription_status, plan, trial_used_seconds')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (!tienda || !isTiendaAccesible(tienda)) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  supabaseAdmin.from('kiosko_searches').insert({
    tienda_id: tienda.id,
    consulta,
    mode,
    vinos_ids,
    vinos_nombres,
  }).then(() => {}).catch(() => {})

  return NextResponse.json({ ok: true })
}
