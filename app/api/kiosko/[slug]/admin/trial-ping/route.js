import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

const TRIAL_LIMIT = 3600 // 1 hora en segundos

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug, {
    select: 'id, plan, trial_used_seconds, propietario_email, email',
  })
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  if (access.tienda.plan !== 'trial') return NextResponse.json({ error: 'No es una tienda en prueba' }, { status: 400 })

  const currentUsed = access.tienda.trial_used_seconds ?? 0

  if (currentUsed >= TRIAL_LIMIT) {
    return NextResponse.json({ trial_used_seconds: currentUsed, trial_remaining_seconds: 0, expired: true })
  }

  const body = await request.json().catch(() => ({}))
  // Máximo 60s por ping como protección ante manipulación
  const addSeconds = Math.min(Math.max(Number(body.seconds) || 30, 1), 60)
  const newUsed = Math.min(currentUsed + addSeconds, TRIAL_LIMIT)

  await supabaseAdmin
    .from('tiendas')
    .update({ trial_used_seconds: newUsed })
    .eq('id', access.tienda.id)

  return NextResponse.json({
    trial_used_seconds: newUsed,
    trial_remaining_seconds: TRIAL_LIMIT - newUsed,
    expired: newUsed >= TRIAL_LIMIT,
  })
}
