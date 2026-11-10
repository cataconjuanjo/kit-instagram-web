import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

// P1-4: set del motivo de inactividad via endpoint auxiliar para no tocar el
// PATCH principal (que podría romperse si la columna no existe). Detecta la
// ausencia de la columna y devuelve pending:true para que la UI oculte el
// selector mientras no se haya aplicado el SQL.

const MOTIVOS = new Set(['sin_stock', 'retirado', 'descatalogado', 'otro'])

function columnaInexistente(err) {
  if (!err) return false
  const code = String(err.code || '').toUpperCase()
  const msg  = String(err.message || '').toLowerCase()
  if (code === '42703') return true
  if (msg.includes('column') && msg.includes('motivo_inactividad') && msg.includes('does not exist')) return true
  return false
}

// GET: ping para la UI; dice si la columna ya está disponible.
export async function GET(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  const { error } = await supabaseAdmin
    .from('vinos_tienda')
    .select('motivo_inactividad')
    .eq('tienda_id', access.tienda.id)
    .limit(1)

  if (error) {
    if (columnaInexistente(error)) return NextResponse.json({ pending: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ pending: false })
}

// POST: { id, motivo }  motivo in MOTIVOS o null para limpiar
export async function POST(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })

  let body = {}
  try { body = await request.json() } catch {}
  const id = String(body?.id || '')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const motivo = body?.motivo == null ? null : String(body.motivo)
  if (motivo != null && !MOTIVOS.has(motivo)) {
    return NextResponse.json({ error: 'Motivo no válido' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('vinos_tienda')
    .update({ motivo_inactividad: motivo })
    .eq('id', id)
    .eq('tienda_id', access.tienda.id)

  if (error) {
    if (columnaInexistente(error)) {
      return NextResponse.json({ error: 'Falta aplicar supabase/kiosko_motivo_inactividad.sql', pending: true }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
