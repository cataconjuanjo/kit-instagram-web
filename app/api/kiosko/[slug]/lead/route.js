import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export async function POST(request, { params }) {
  const { slug } = await params

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { email, consentimiento, source, preferencias, vinos_recomendados } = body

  if (!email || !isValidEmail(email.trim())) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }
  if (!consentimiento) {
    return NextResponse.json({ error: 'Se requiere consentimiento explícito' }, { status: 400 })
  }

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  // Deduplicar: mismo email en los últimos 7 días = no crear duplicado
  const desde7 = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data: existing } = await supabaseAdmin
    .from('kiosko_leads')
    .select('id')
    .eq('tienda_id', tienda.id)
    .eq('email', email.toLowerCase().trim())
    .gte('created_at', desde7)
    .is('borrado_at', null)
    .limit(1)

  if (existing?.length) return NextResponse.json({ ok: true, duplicado: true })

  const { error } = await supabaseAdmin.from('kiosko_leads').insert({
    tienda_id:          tienda.id,
    email:              email.toLowerCase().trim(),
    source:             source || 'kiosko',
    preferencias:       preferencias || null,
    vinos_recomendados: vinos_recomendados || null,
    consentimiento_at:  new Date().toISOString(),
  })

  if (error) {
    console.error('[kiosko-lead]', error.message)
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
