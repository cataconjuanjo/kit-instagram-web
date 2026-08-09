import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

export async function GET(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const tiendaId = access.tienda.id

  const { searchParams } = new URL(request.url)
  const formato = searchParams.get('formato') // 'csv' para exportar

  const { data, error } = await supabaseAdmin
    .from('kiosko_leads')
    .select('id, email, source, preferencias, vinos_recomendados, consentimiento_at, created_at')
    .eq('tienda_id', tiendaId)
    .is('borrado_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (formato === 'csv') {
    const filas = [
      'email,fuente,ocasion,estilo,presupuesto,vinos,fecha',
      ...(data || []).map(l => {
        const p = l.preferencias || {}
        const vinos = (l.vinos_recomendados || []).map(v => v.nombre).join(' | ')
        return [
          l.email,
          l.source,
          p.ocasion || '',
          p.estilo || '',
          p.presupuesto || '',
          `"${vinos}"`,
          new Date(l.created_at).toLocaleDateString('es-ES'),
        ].join(',')
      }),
    ].join('\n')

    return new Response(filas, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-${slug}.csv"`,
      },
    })
  }

  return NextResponse.json({ leads: data || [] })
}

export async function DELETE(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const tiendaId = access.tienda.id

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('kiosko_leads')
    .update({ borrado_at: new Date().toISOString(), email: '[eliminado]' })
    .eq('id', id)
    .eq('tienda_id', tiendaId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
