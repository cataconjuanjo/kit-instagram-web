import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { getPublicTienda } from '../../../_lib/kioskoAuth'
import { checkRateLimit as checkPersistentRateLimit } from '../../../../lib/security'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_IDS = 8
const MAX_PEDIDOS_WINDOW = 6
const RATE_WINDOW_MS = 10 * 60 * 1000
const COUNTER_ORDERS_IN_DEVELOPMENT = true

function requestIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''
  )
}

function migrationPending(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return text.includes('kiosko_assisted_orders') || text.includes('schema cache') || text.includes('pgrst')
}

function parseIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',')
  const seen = new Set()
  return raw
    .map(id => String(id || '').trim())
    .filter(id => UUID_RE.test(id) && !seen.has(id) && seen.add(id))
    .slice(0, MAX_IDS)
}

function cleanText(value, max = 160) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function precioActual(vino) {
  const oferta = Number(vino?.precio_oferta || 0)
  const pvp = Number(vino?.precio_pvp || 0)
  return oferta > 0 && pvp > 0 && oferta < pvp ? oferta : pvp
}

function makeOrderCode() {
  const now = new Date()
  const stamp = [
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `K-${stamp}-${rand}`
}

async function getVinos(tiendaId, ids) {
  if (!ids.length) return []

  const { data } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, bodega, tipo, uva, anada, region, precio_pvp, precio_oferta, stock, ubicacion_estanteria, activo')
    .eq('tienda_id', tiendaId)
    .eq('activo', true)
    .in('id', ids)

  const byId = new Map((data || []).map(vino => [String(vino.id), vino]))
  return ids.map(id => byId.get(id)).filter(Boolean)
}

export async function POST(request, { params }) {
  const { slug } = await params
  const tienda = await getPublicTienda(slug, { select: 'id, slug, nombre, activo, kiosko_orders_enabled' })
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  if (COUNTER_ORDERS_IN_DEVELOPMENT) {
    return NextResponse.json({ error: 'Pedido de mostrador en desarrollo', development: true }, { status: 503 })
  }
  if (tienda.kiosko_orders_enabled !== true) {
    return NextResponse.json({ error: 'Pedido de mostrador desactivado' }, { status: 403 })
  }

  const ip = requestIp(request)
  const allowed = await checkPersistentRateLimit(`${slug}:${ip || 'anon'}`, 'kiosko-pedido', {
    max: MAX_PEDIDOS_WINDOW,
    windowMs: RATE_WINDOW_MS,
  })
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados pedidos seguidos. Espera unos minutos.' }, { status: 429 })
  }

  let body = {}
  try { body = await request.json() } catch {}

  const ids = parseIds(body?.ids)
  if (!ids.length) return NextResponse.json({ error: 'Seleccion vacia' }, { status: 400 })

  const vinos = await getVinos(tienda.id, ids)
  if (!vinos.length) return NextResponse.json({ error: 'Vinos no encontrados' }, { status: 404 })

  const lines = vinos.map(vino => {
    const precio = precioActual(vino)
    return {
      vino_id: vino.id,
      nombre: vino.nombre || '',
      bodega: vino.bodega || '',
      tipo: vino.tipo || '',
      uva: vino.uva || '',
      anada: vino.anada || '',
      region: vino.region || '',
      precio_pvp: vino.precio_pvp ?? null,
      precio_oferta: vino.precio_oferta ?? null,
      precio,
      stock: vino.stock ?? null,
      ubicacion_estanteria: vino.ubicacion_estanteria || '',
    }
  })

  const total = lines.reduce((sum, line) => sum + Number(line.precio || 0), 0)
  const payload = {
    tienda_id: tienda.id,
    order_code: makeOrderCode(),
    status: 'pendiente_pago',
    customer_label: cleanText(body?.customer?.label, 80) || null,
    customer_note: cleanText(body?.customer?.note, 240) || null,
    total: total > 0 ? Number(total.toFixed(2)) : null,
    item_count: lines.length,
    source: cleanText(body?.source, 40) || 'mobile_cart',
    lang: ['es', 'en', 'fr', 'de'].includes(body?.lang) ? body.lang : 'es',
    lines,
    user_agent: request.headers.get('user-agent') || '',
    ip,
  }

  const { data, error } = await supabaseAdmin
    .from('kiosko_assisted_orders')
    .insert(payload)
    .select('id, order_code, status, total, item_count, created_at')
    .single()

  if (error) {
    if (migrationPending(error)) return NextResponse.json({ error: 'Pedidos no activados', pending: true }, { status: 503 })
    console.error('[kiosko assisted order]', error)
    return NextResponse.json({ error: 'No se pudo crear el pedido' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pedido: data })
}
