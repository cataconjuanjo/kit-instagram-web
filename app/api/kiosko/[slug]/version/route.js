import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { getPublicTienda } from '../../../_lib/kioskoAuth'
import { checkRateLimit } from '../../../../lib/security'

// F6 · Endpoint público de solo lectura para auto-actualización del kiosko.
// Devuelve un JSON mínimo { build, flags, catalogo } sin datos personales.
// El cliente (KioskoApp) lo sondea cuando el flag auto_update está activo y,
// si alguno de los 3 campos cambia respecto al valor cargado al inicio,
// programa una recarga suave cuando el kiosko está inactivo. No afecta
// a tracking ni a sincronización con Square.

const RATE_LIMIT = 240        // 240 req/h por IP por slug (1 cada ~15 s)
const RATE_WINDOW_MS = 60 * 60 * 1000

function requestIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''
  )
}

// Hash djb2 → entero 32-bit → base-36 de 7 chars. Estable y determinista.
function shortHash(input) {
  if (input == null) return null
  const s = typeof input === 'string' ? input : JSON.stringify(input)
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  // >>> 0 lo hace unsigned 32-bit
  return (h >>> 0).toString(36).padStart(7, '0').slice(0, 7)
}

function resolveBuild() {
  // Prioridad: identificadores de despliegue conocidos (Vercel/Next).
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.NEXT_PUBLIC_BUILD_ID ||
    null
  )
}

export async function GET(request, { params }) {
  const { slug } = await params

  // Rate-limit por IP+slug. Si lo supera, respondemos vacío con 200 (nunca
  // bloqueamos la UI del cliente). Cache-Control: no-store siempre.
  const ip = requestIp(request) || 'anon'
  const allowed = await checkRateLimit(`${slug}:ip:${ip}`, 'kiosko-version', {
    max: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  })
  if (!allowed) {
    return NextResponse.json(
      { build: null, flags: null, catalogo: null, skipped: true, reason: 'rate_limit' },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // Si la tienda no existe, respondemos campos null sin filtrar que exista:
  // el endpoint NO debe diferenciar tiendas inexistentes de fallos.
  let tienda = null
  try { tienda = await getPublicTienda(slug) } catch { /* silenciar */ }

  const build = resolveBuild()
  // flags: hash corto de features (no se exponen las claves ni los valores).
  const flags = tienda?.features ? shortHash(tienda.features) : null

  // catalogo: max(updated_at) de los vinos de la tienda. Si la columna o la
  // tabla no existen o la tienda no se encuentra, devolvemos null. Se usa
  // supabaseAdmin para ignorar RLS; solo leemos un timestamp agregado.
  let catalogo = null
  if (tienda?.id) {
    try {
      const { data, error } = await supabaseAdmin
        .from('vinos_tienda')
        .select('updated_at')
        .eq('tienda_id', tienda.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!error && data?.updated_at) catalogo = data.updated_at
    } catch { /* silenciar */ }
  }

  return NextResponse.json(
    { build, flags, catalogo },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
