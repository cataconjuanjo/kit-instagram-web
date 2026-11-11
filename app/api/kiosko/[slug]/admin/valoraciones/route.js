import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

// FD (D4) · Lectura del panel para el bloque "Valoraciones". Usa la
// nueva tabla kiosko_valoraciones. Si la tabla aun no existe (SQL sin
// aplicar), responde { pendiente: true } y el panel pinta solo un aviso.
//
// El rango temporal (dias) se toma del query ?dias=NN con default 30
// para seguir el mismo convenio que /admin/analitica y /admin/embudo.

function migrationPending(error) {
  if (!error) return false
  const code = String(error.code || '').toUpperCase()
  const msg  = String(error.message || '').toLowerCase()
  if (code === '42P01') return true
  if (msg.includes('relation') && msg.includes('kiosko_valoraciones') && msg.includes('does not exist')) return true
  return false
}

export async function GET(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const tiendaId = access.tienda.id

  const { searchParams } = new URL(request.url)
  const diasRaw = Number(searchParams.get('dias') || 30)
  const dias = Math.max(1, Math.min(365, Number.isFinite(diasRaw) ? diasRaw : 30))
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('kiosko_valoraciones')
    .select('id, rating, comentario, comentario_lang, comentario_at, lang, created_at')
    .eq('tienda_id', tiendaId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })

  if (error) {
    if (migrationPending(error)) {
      return NextResponse.json({ pendiente: true, dias })
    }
    console.error('[admin/valoraciones]', error.message, error.code)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data || []
  const total = rows.length
  const sum = rows.reduce((s, r) => s + (Number(r.rating) || 0), 0)
  const media = total > 0 ? Math.round((sum / total) * 100) / 100 : 0

  // Distribucion por carita (1..5)
  const distribucion = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of rows) {
    const k = Number(r.rating)
    if (k >= 1 && k <= 5) distribucion[k] += 1
  }

  // Ultimos comentarios (filas con comentario no vacio). Devolvemos
  // el texto saneado tal cual se almaceno; el panel debe pintarlo con
  // textContent / {texto} de React (nunca innerHTML).
  const comentarios = rows
    .filter(r => r.comentario && String(r.comentario).trim())
    .slice(0, 50)
    .map(r => ({
      id: r.id,
      rating: r.rating,
      texto: r.comentario,
      lang: r.comentario_lang || r.lang || null,
      fecha: r.comentario_at || r.created_at,
    }))

  return NextResponse.json({
    pendiente: false,
    dias,
    total,
    media,
    distribucion,
    comentarios,
  })
}
