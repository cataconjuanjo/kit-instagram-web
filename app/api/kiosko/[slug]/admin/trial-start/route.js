import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

export async function POST(request, { params }) {
  const { slug } = await params

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, plan, trial_expires_at')
    .eq('slug', slug)
    .single()

  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  if (tienda.plan !== 'trial') return NextResponse.json({ error: 'No es una tienda en prueba' }, { status: 400 })
  if (tienda.trial_expires_at) return NextResponse.json({ trial_expires_at: tienda.trial_expires_at })

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  await supabaseAdmin
    .from('tiendas')
    .update({ trial_expires_at: expiresAt })
    .eq('id', tienda.id)

  return NextResponse.json({ trial_expires_at: expiresAt })
}
