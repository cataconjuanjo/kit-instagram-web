import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

export async function POST(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug, {
    select: 'id, plan, trial_expires_at, propietario_email, email',
  })
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const tienda = access.tienda

  if (tienda.plan !== 'trial') return NextResponse.json({ error: 'No es una tienda en prueba' }, { status: 400 })
  if (tienda.trial_expires_at) return NextResponse.json({ trial_expires_at: tienda.trial_expires_at })

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

  await supabaseAdmin
    .from('tiendas')
    .update({ trial_expires_at: expiresAt })
    .eq('id', tienda.id)

  return NextResponse.json({ trial_expires_at: expiresAt })
}
