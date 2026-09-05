import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { isTiendaAccesible } from '../../../_lib/kioskoAuth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v) }

export async function POST(request, { params }) {
  const { slug } = await params

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { session_id, ronda, vino_a_id, vino_b_id, elegido_id, filtros } = body || {}

  if (!isUuid(session_id) || !isUuid(vino_a_id) || !isUuid(vino_b_id)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  if (!Number.isInteger(ronda) || ronda < 1 || ronda > 50) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  if (elegido_id != null && !isUuid(elegido_id)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  if (elegido_id != null && elegido_id !== vino_a_id && elegido_id !== vino_b_id) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, activo, subscription_status, plan, trial_used_seconds, duelo_activo')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (!tienda || !isTiendaAccesible(tienda) || !tienda.duelo_activo) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  // Verificar que los vinos pertenecen a esta tienda
  const { data: vinosOk } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id')
    .eq('tienda_id', tienda.id)
    .in('id', [vino_a_id, vino_b_id])

  if (!vinosOk || vinosOk.length !== 2) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  supabaseAdmin.from('kiosko_duelo_rounds').insert({
    tienda_id:  tienda.id,
    session_id,
    ronda,
    vino_a_id,
    vino_b_id,
    elegido_id: elegido_id ?? null,
    filtros:    filtros ?? null,
  }).then(() => {}).catch(err => console.error('[duelo]', err.message))

  return NextResponse.json({ ok: true })
}
