import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { isTiendaAccesible } from '../../../_lib/kioskoAuth'

const VALID_FLOWS  = new Set(['wizard', 'cesta', 'pairing'])
const VALID_STEPS  = new Set(['start', 'ocasion', 'estilo', 'presupuesto', 'prefs', 'resultado', 'consulta', 'carrito', 'abandon'])
const VALID_REASONS = new Set(['idle_timeout', 'user_exit'])

function isMigrationMissing(error) {
  const t = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return t.includes('kiosko_funnel') || t.includes('schema cache') || t.includes('pgrst204') || t.includes('pgrst')
}

export async function POST(request, { params }) {
  const { slug } = await params

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { attempt_id, flow, step, abandon_reason } = body || {}
  if (!attempt_id || !VALID_FLOWS.has(flow) || !VALID_STEPS.has(step)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  if (abandon_reason && !VALID_REASONS.has(abandon_reason)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, activo, subscription_status, plan, trial_used_seconds')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (!tienda || !isTiendaAccesible(tienda)) return NextResponse.json({ ok: false }, { status: 404 })

  const { error } = await supabaseAdmin.from('kiosko_funnel_events').insert({
    tienda_id:     tienda.id,
    attempt_id,
    flow,
    step,
    abandon_reason: abandon_reason || null,
  })

  if (error) {
    if (isMigrationMissing(error)) return NextResponse.json({ ok: true, pendiente: true })
    console.error('[funnel]', error.message)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
