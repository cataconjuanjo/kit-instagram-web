import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { isTiendaAccesible } from '../../../_lib/kioskoAuth'

// FC fix · 'explorar' es el flujo aditivo introducido en el commit 96c69b81.
// La tabla kiosko_funnel_events.flow es TEXT sin CHECK constraint ni enum
// (ver supabase/kiosko_funnel_events.sql:8), por lo que basta con permitir
// el nombre en la whitelist del endpoint; no hay SQL que aplicar. Los
// pasos validos para 'explorar' son un subconjunto de los ya existentes
// (start, carrito, abandon) y entran por la whitelist de VALID_STEPS.
const VALID_FLOWS  = new Set(['wizard', 'cesta', 'pairing', 'duelo', 'explorar'])
const VALID_STEPS  = new Set(['start', 'ocasion', 'estilo', 'presupuesto', 'prefs', 'resultado', 'consulta', 'carrito', 'abandon', 'regenerar', 'reiniciar'])
const VALID_REASONS = new Set(['idle_timeout', 'user_exit'])

// FC fix · Postgres check_violation (23514) en caso de que alguien aniada
// en el futuro un CHECK sobre flow/step: no debe romper el kiosko ni los
// demas flujos. Se trata como "pendiente" (no bloquea la UX).
function isConstraintViolation(error) {
  const code = String(error?.code || '')
  return code === '23514'
}

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
    .select('id, activo, subscription_status, billing_grace_until, plan, trial_used_seconds')
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
    if (isConstraintViolation(error)) {
      // Degradacion segura ante un CHECK futuro que rechace un valor nuevo
      // (p. ej. una restriccion sobre flow/step). El evento se descarta pero
      // la UI no se entera, y wizard/cesta/pairing siguen funcionando.
      console.warn('[funnel] check_violation descartado:', error.message)
      return NextResponse.json({ ok: true, pendiente: true, reason: 'constraint' })
    }
    console.error('[funnel]', error.message)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
