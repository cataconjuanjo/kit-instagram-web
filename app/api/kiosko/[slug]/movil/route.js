import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { getPublicTienda, PUBLIC_VINO_SELECT } from '../../../_lib/kioskoAuth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_IDS = 8

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

function parseIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  const seen = new Set()
  return raw
    .map(id => String(id || '').trim())
    .filter(id => UUID_RE.test(id) && !seen.has(id) && seen.add(id))
    .slice(0, MAX_IDS)
}

function parseFicha(vino) {
  if (!vino?.ficha_ia) return null
  try {
    return typeof vino.ficha_ia === 'string' ? JSON.parse(vino.ficha_ia) : vino.ficha_ia
  } catch {
    return null
  }
}

async function getVinos(tiendaId, ids) {
  if (!ids.length) return []

  const { data } = await supabaseAdmin
    .from('vinos_tienda')
    .select(`${PUBLIC_VINO_SELECT}, ficha_ia`)
    .eq('tienda_id', tiendaId)
    .eq('activo', true)
    .in('id', ids)

  const byId = new Map((data || []).map(vino => [String(vino.id), vino]))
  return ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(vino => {
      const { ficha_ia, ...publicVino } = vino
      return { ...publicVino, ficha: parseFicha(vino) }
    })
}

export async function GET(request, { params }) {
  const { slug } = await params
  const tienda = await getPublicTienda(slug)
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const ids = parseIds(searchParams.get('ids'))
  if (!ids.length) return NextResponse.json({ error: 'Seleccion vacia' }, { status: 400 })

  const vinos = await getVinos(tienda.id, ids)
  if (!vinos.length) return NextResponse.json({ error: 'Vinos no encontrados' }, { status: 404 })

  return NextResponse.json({ tienda, vinos })
}

export async function POST(request, { params }) {
  const { slug } = await params
  const tienda = await getPublicTienda(slug, { select: 'id, slug, nombre, activo' })
  if (!tienda) return NextResponse.json({ ok: true, skipped: true })

  let body = {}
  try { body = await request.json() } catch {}

  const ids = parseIds(body?.ids)
  if (!ids.length) return NextResponse.json({ ok: true, skipped: true })

  const source = String(body?.source || 'qr_opened').slice(0, 40)
  const lang = ['es', 'en', 'fr', 'de'].includes(body?.lang) ? body.lang : 'es'
  const vinos = await getVinos(tienda.id, ids)
  if (!vinos.length) return NextResponse.json({ ok: true, skipped: true })

  const meta = {
    source,
    lang,
    user_agent: request.headers.get('user-agent') || '',
    ip: requestIp(request),
  }

  const { error } = await supabaseAdmin.from('kiosko_mobile_intents').insert(
    vinos.map(vino => ({
      tienda_id: tienda.id,
      vino_id: vino.id,
      vino_nombre: vino.nombre,
      vino_bodega: vino.bodega,
      ...meta,
    }))
  )

  if (error) {
    if (migrationPending(error)) return NextResponse.json({ ok: true, pending: true })
    console.error('[kiosko mobile selection intent]', error)
  }

  return NextResponse.json({ ok: true, count: vinos.length })
}
