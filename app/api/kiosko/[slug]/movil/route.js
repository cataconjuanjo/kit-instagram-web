import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { getPublicTienda, PUBLIC_VINO_SELECT } from '../../../_lib/kioskoAuth'
import { checkRateLimit } from '../../../../lib/security'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_IDS = 8
// F3 B0.4: doble tope. El session_id lo controla el cliente (puede renovarse)
// asi que ademas aplicamos un tope por IP para proteger el bulk-insert.
const RATE_LIMIT_SESSION = 120      // por slug + session_id (si viene)
const RATE_LIMIT_IP = 600           // por slug + IP, siempre
const RATE_WINDOW_MS = 60 * 60 * 1000

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

// P0-4: logs estructurados para que los descartes dejen de ser silenciosos.
// Un motivo por linea, sin datos personales (solo slug, codigo, longitudes).
function warnDescarte(slug, motivo, extra = {}) {
  console.warn(JSON.stringify({ tag: 'movil_intent_descartado', slug, motivo, ...extra }))
}

export async function POST(request, { params }) {
  const { slug } = await params

  // Payload primero (necesitamos session_id para la rate-limit key).
  let body = {}
  try { body = await request.json() } catch {}
  const sessionId = typeof body?.session_id === 'string' ? body.session_id.slice(0, 64) : ''

  // F3 B0.4: DOS topes de rate-limit, ambos tienen que pasar.
  //   · session_id (si viene): 120/h -> controla cliente-a-cliente razonable.
  //   · IP (siempre): 600/h -> techo del servidor; el cliente no lo puede
  //     saltar generando session_id nuevos. Nunca conocemos al cliente al 100%
  //     porque puede borrar localStorage o venir de incognito.
  const ip = requestIp(request) || 'anon'
  if (sessionId) {
    const okSession = await checkRateLimit(`${slug}:s:${sessionId}`, 'kiosko-mobile-intent', {
      max: RATE_LIMIT_SESSION,
      windowMs: RATE_WINDOW_MS,
    })
    if (!okSession) {
      warnDescarte(slug, 'rate_limit', { keyType: 'session' })
      return NextResponse.json({ ok: true, skipped: true, limited: true, reason: 'rate_session' })
    }
  }
  const okIp = await checkRateLimit(`${slug}:ip:${ip}`, 'kiosko-mobile-intent-ip', {
    max: RATE_LIMIT_IP,
    windowMs: RATE_WINDOW_MS,
  })
  if (!okIp) {
    warnDescarte(slug, 'rate_limit', { keyType: 'ip' })
    return NextResponse.json({ ok: true, skipped: true, limited: true, reason: 'rate_ip' })
  }

  const tienda = await getPublicTienda(slug, { select: 'id, slug, nombre, activo' })
  if (!tienda) {
    warnDescarte(slug, 'tienda_no_encontrada')
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_tienda' })
  }

  const ids = parseIds(body?.ids)
  if (!ids.length) {
    warnDescarte(slug, 'payload_vacio_o_uuid_invalido', { rawLen: Array.isArray(body?.ids) ? body.ids.length : String(body?.ids || '').length })
    return NextResponse.json({ ok: true, skipped: true, reason: 'ids_invalidos' })
  }

  const source = String(body?.source || 'qr_opened').slice(0, 40)
  const lang = ['es', 'en', 'fr', 'de'].includes(body?.lang) ? body.lang : 'es'
  const vinos = await getVinos(tienda.id, ids)
  if (!vinos.length) {
    warnDescarte(slug, 'vinos_no_match', { idsIn: ids.length })
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_match' })
  }

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
    if (migrationPending(error)) {
      warnDescarte(slug, 'migracion_pendiente', { code: error.code })
      return NextResponse.json({ ok: true, pending: true, reason: 'migration_pending' })
    }
    console.error('[kiosko mobile selection intent]', error)
    return NextResponse.json({ ok: true, inserted: false, reason: 'db_error' })
  }

  return NextResponse.json({ ok: true, count: vinos.length })
}
