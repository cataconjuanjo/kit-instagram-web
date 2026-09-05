import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

const STEP_ORDER = {
  wizard:  ['start', 'ocasion', 'estilo', 'presupuesto', 'resultado', 'carrito'],
  cesta:   ['start', 'ocasion', 'presupuesto', 'resultado', 'carrito'],
  pairing: ['start', 'consulta', 'resultado', 'carrito'],
}

function isMigrationMissing(error) {
  const t = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return t.includes('kiosko_funnel') || t.includes('schema cache') || t.includes('pgrst204') || t.includes('pgrst')
}

export async function GET(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const tiendaId = access.tienda.id
  const dias = 30
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('kiosko_funnel_events')
    .select('flow, step, attempt_id, abandon_reason')
    .eq('tienda_id', tiendaId)
    .gte('created_at', desde)

  if (error) {
    if (isMigrationMissing(error)) return NextResponse.json({ pendiente: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const events = data || []

  const funnel = {}
  for (const [flow, steps] of Object.entries(STEP_ORDER)) {
    const flowEvts = events.filter(e => e.flow === flow)

    const stepCounts = {}
    for (const step of steps) {
      stepCounts[step] = new Set(flowEvts.filter(e => e.step === step).map(e => e.attempt_id)).size
    }

    const abandons = flowEvts.filter(e => e.step === 'abandon')
    funnel[flow] = {
      steps: stepCounts,
      abandon: {
        total:        new Set(abandons.map(e => e.attempt_id)).size,
        idle_timeout: new Set(abandons.filter(e => e.abandon_reason === 'idle_timeout').map(e => e.attempt_id)).size,
        user_exit:    new Set(abandons.filter(e => e.abandon_reason === 'user_exit').map(e => e.attempt_id)).size,
      },
    }
  }

  return NextResponse.json({ funnel, dias })
}
