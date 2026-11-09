import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

export async function GET(request, { params }) {
  const { slug } = await params

  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 403 })

  const [{ data: lastPayment }, { data: lastCatalog }] = await Promise.all([
    supabaseAdmin
      .from('square_sync_log')
      .select('created_at')
      .eq('tienda_slug', slug)
      .eq('ok', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('vinos_tienda')
      .select('square_last_seen_at')
      .eq('tienda_id', access.tienda.id)
      .not('square_last_seen_at', 'is', null)
      .order('square_last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // F3 P3-10: ultimo error de sync (si lo hay). Query separada y en try para
  // que, si la columna 'error' no existe en square_sync_log, no rompa el
  // resto de la respuesta. Degradacion: campos se devuelven en null.
  let ultimoError = null
  let ultimoErrorAt = null
  try {
    const { data: lastErr } = await supabaseAdmin
      .from('square_sync_log')
      .select('created_at, error')
      .eq('tienda_slug', slug)
      .eq('ok', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    ultimoError = lastErr?.error || null
    ultimoErrorAt = lastErr?.created_at || null
  } catch { /* columna error inexistente u otro problema; se omite */ }

  return NextResponse.json({
    ultimoPagoAt:     lastPayment?.created_at  || null,
    ultimoCatalogoAt: lastCatalog?.square_last_seen_at || null,
    ultimoError,
    ultimoErrorAt,
  })
}
