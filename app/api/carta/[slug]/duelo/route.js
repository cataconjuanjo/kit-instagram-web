import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v) }

function isMigrationMissing(error) {
  const t = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return t.includes('restaurante_duelo_rounds') || t.includes('schema cache') ||
    ['pgrst204', 'pgrst205', '42p01'].some(c => t.includes(c))
}

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

  const { data: restaurante } = await supabaseAdmin
    .from('restaurantes')
    .select('id, carta_publica_activa')
    .eq('slug', slug)
    .single()

  if (!restaurante) return NextResponse.json({ ok: false }, { status: 404 })

  // Verificar que los vinos pertenecen a este restaurante
  const { data: vinosOk } = await supabaseAdmin
    .from('vinos')
    .select('id')
    .eq('restaurante_id', restaurante.id)
    .in('id', [vino_a_id, vino_b_id])

  if (!vinosOk || vinosOk.length !== 2) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('restaurante_duelo_rounds').insert({
    restaurante_id: restaurante.id,
    session_id,
    ronda,
    vino_a_id,
    vino_b_id,
    elegido_id: elegido_id ?? null,
    filtros:    filtros ?? null,
  })

  if (error) {
    if (isMigrationMissing(error)) return NextResponse.json({ ok: true, pendiente: true })
    console.error('[carta-duelo]', error.message)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
