import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

const TRIAL_LIMIT = 7200 // 2 horas en segundos

export async function POST(request, { params }) {
  const { slug } = await params

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const sc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  const { data: { user }, error: authErr } = await sc.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, plan, trial_used_seconds, propietario_email, email')
    .eq('slug', slug)
    .single()

  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  // Verificar que el usuario logueado es el propietario
  const userEmail  = user.email?.toLowerCase() || ''
  const ownerEmail = (tienda.propietario_email || tienda.email || '').toLowerCase()
  if (userEmail !== ownerEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  if (tienda.plan !== 'trial') return NextResponse.json({ error: 'No es una tienda en prueba' }, { status: 400 })

  const currentUsed = tienda.trial_used_seconds ?? 0

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
    .eq('id', tienda.id)

  return NextResponse.json({
    trial_used_seconds: newUsed,
    trial_remaining_seconds: TRIAL_LIMIT - newUsed,
    expired: newUsed >= TRIAL_LIMIT,
  })
}
