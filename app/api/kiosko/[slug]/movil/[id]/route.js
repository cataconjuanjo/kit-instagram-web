import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { getPublicTienda, PUBLIC_VINO_SELECT } from '../../../../_lib/kioskoAuth'

function requestIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''
  )
}

function migrationPending(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return text.includes('kiosko_mobile_intents') || text.includes('schema cache') || text.includes('pgrst')
}

function parseFicha(vino) {
  if (!vino?.ficha_ia) return null
  try {
    return typeof vino.ficha_ia === 'string' ? JSON.parse(vino.ficha_ia) : vino.ficha_ia
  } catch {
    return null
  }
}

export async function GET(_request, { params }) {
  const { slug, id } = await params
  const tienda = await getPublicTienda(slug)
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const { data: vino, error } = await supabaseAdmin
    .from('vinos_tienda')
    .select(`${PUBLIC_VINO_SELECT}, ficha_ia`)
    .eq('id', id)
    .eq('tienda_id', tienda.id)
    .eq('activo', true)
    .single()

  if (error || !vino) return NextResponse.json({ error: 'Vino no encontrado' }, { status: 404 })

  const { ficha_ia, ...publicVino } = vino
  return NextResponse.json({
    tienda,
    vino: publicVino,
    ficha: parseFicha(vino),
  })
}

export async function POST(request, { params }) {
  const { slug, id } = await params
  const tienda = await getPublicTienda(slug, { select: 'id, slug, nombre, activo' })
  if (!tienda) return NextResponse.json({ ok: true, skipped: true })

  let body = {}
  try { body = await request.json() } catch {}

  const source = String(body?.source || 'qr_opened').slice(0, 40)
  const lang = ['es', 'en', 'fr', 'de'].includes(body?.lang) ? body.lang : 'es'

  const { data: vino } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, bodega')
    .eq('id', id)
    .eq('tienda_id', tienda.id)
    .eq('activo', true)
    .single()

  if (!vino) return NextResponse.json({ ok: true, skipped: true })

  const { error } = await supabaseAdmin.from('kiosko_mobile_intents').insert({
    tienda_id: tienda.id,
    vino_id: vino.id,
    vino_nombre: vino.nombre,
    vino_bodega: vino.bodega,
    source,
    lang,
    user_agent: request.headers.get('user-agent') || '',
    ip: requestIp(request),
  })

  if (error) {
    if (migrationPending(error)) return NextResponse.json({ ok: true, pending: true })
    console.error('[kiosko mobile intent]', error)
  }

  return NextResponse.json({ ok: true })
}
