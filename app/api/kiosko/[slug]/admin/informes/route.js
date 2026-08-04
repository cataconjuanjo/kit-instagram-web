import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

export async function GET(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    // Devolver un informe concreto (con html)
    const { data, error } = await supabaseAdmin
      .from('kiosko_informes')
      .select('*')
      .eq('id', id)
      .eq('slug', slug)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ informe: data })
  }

  // Listar informes de esta tienda (sin html para no pesar)
  const { data, error } = await supabaseAdmin
    .from('kiosko_informes')
    .select('id, semana_label, semana_inicio, datos, email_destino, enviado_ok, created_at')
    .eq('slug', slug)
    .order('created_at', { ascending: false })
    .limit(52)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ informes: data || [] })
}
