import { supabaseAdmin } from '../../../lib/supabaseAdmin'
import { crearSesionCamarero } from '../../../lib/camareroSession'
import { puedeUsar } from '../../../lib/plans'

const RATE_LIMIT = 20
const RESTAURANTE_RATE_LIMIT = 60
const RATE_WINDOW_MS = 60 * 60 * 1000
const SELECT_RESTAURANTE_SESION = [
  'id', 'slug', 'plan', 'subscription_status',
  'camarero_pin_bloqueo_activo', 'camarero_pin_hash',
].join(', ')

function getIP(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
}

async function checkRateLimit(key, endpoint = 'camarero-sesion', max = RATE_LIMIT) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', key)
    .eq('endpoint', endpoint)
    .gte('created_at', since)

  if ((count || 0) >= max) return false
  await supabaseAdmin.from('rate_limits').insert({ ip: key, endpoint })
  return true
}

function esSlugDemoPermitido(slug) {
  const permitidos = String(process.env.CAMARERO_DEMO_SLUGS || 'taberna-del-puerto')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return permitidos.includes(String(slug || '').trim())
}

export async function POST(req) {
  try {
    const { restaurante_id, pin, demo = false } = await req.json()
    if (!restaurante_id) return Response.json({ error: 'Restaurante obligatorio.' }, { status: 400 })
    if (demo !== true && !await checkRateLimit(getIP(req), 'camarero-sesion-ip', RATE_LIMIT)) {
      return Response.json({ error: 'Demasiados intentos. Prueba de nuevo más tarde.' }, { status: 429 })
    }

    const { data: restaurante, error } = await supabaseAdmin
      .from('restaurantes')
      .select(SELECT_RESTAURANTE_SESION)
      .eq('id', restaurante_id)
      .single()

    if (error || !restaurante) return Response.json({ error: 'Restaurante no encontrado.' }, { status: 404 })
    if (!puedeUsar(restaurante, 'modo_camarero')) {
      return Response.json({ error: 'Modo camarero no incluido en el plan activo.' }, { status: 403 })
    }

    const demoPermitida = demo &&
      process.env.NEXT_PUBLIC_SHOW_DEMO === 'true' &&
      esSlugDemoPermitido(restaurante.slug)
    const demoExentaRateLimit = demo === true &&
      esSlugDemoPermitido(restaurante.slug) &&
      (demoPermitida || restaurante.camarero_pin_bloqueo_activo !== true)
    if (!demoExentaRateLimit && demo === true && !await checkRateLimit(getIP(req), 'camarero-sesion-ip', RATE_LIMIT)) {
      return Response.json({ error: 'Demasiados intentos. Prueba de nuevo mas tarde.' }, { status: 429 })
    }

    if (!demoPermitida && restaurante.camarero_pin_bloqueo_activo === true) {
      const restauranteAllowed = await checkRateLimit(
        `rest:${restaurante.id}`,
        'camarero-sesion-restaurante',
        RESTAURANTE_RATE_LIMIT
      )
      if (!restauranteAllowed) {
        return Response.json({ error: 'Demasiados intentos para esta sala. Prueba de nuevo mas tarde.' }, { status: 429 })
      }
    }

    let pinValido = demoPermitida
    if (!pinValido && restaurante.camarero_pin_bloqueo_activo !== true) {
      pinValido = true
    } else if (!pinValido && restaurante.camarero_pin_hash) {
      const { data } = await supabaseAdmin.rpc('verificar_pin_camarero', {
        p_restaurante_id: restaurante.id,
        p_pin: String(pin || '').trim(),
      })
      pinValido = data === true
    }

    if (!pinValido) return Response.json({ error: 'PIN incorrecto.' }, { status: 403 })
    return Response.json({ sala_token: crearSesionCamarero(restaurante.id) })
  } catch (error) {
    console.error('[camarero-sesion]', error)
    return Response.json({ error: 'No se pudo iniciar la sesión de sala.' }, { status: 500 })
  }
}
