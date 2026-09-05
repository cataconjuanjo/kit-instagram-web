import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import { PUBLIC_VINO_SELECT, isTiendaAccesible } from '../../../../_lib/kioskoAuth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LANG_NAMES = { es: 'Spanish', en: 'English', fr: 'French', de: 'German' }
const LANG_COL   = { en: 'ficha_ia_en', fr: 'ficha_ia_fr', de: 'ficha_ia_de' }
const RATE_LIMIT = 80
const RATE_WINDOW_MS = 60 * 60 * 1000

function getIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

async function checkRateLimit(ip) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', 'kiosko_ficha_ia')
    .gte('created_at', since)

  if ((count || 0) >= RATE_LIMIT) return false
  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint: 'kiosko_ficha_ia' })
  return true
}

export async function GET(request, { params }) {
  const { slug, id } = await params
  const lang = new URL(request.url).searchParams.get('lang') || 'es'

  const { data: tienda } = await supabaseAdmin
    .from('tiendas').select('id, nombre, ciudad, activo, subscription_status, plan, trial_used_seconds').eq('slug', slug).eq('activo', true).single()
  if (!tienda || !isTiendaAccesible(tienda)) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const { data: vino } = await supabaseAdmin
    .from('vinos_tienda')
    .select(`${PUBLIC_VINO_SELECT}, ficha_ia`)
    .eq('id', id)
    .eq('tienda_id', tienda.id)
    .eq('activo', true)
    .single()
  if (!vino) return NextResponse.json({ error: 'Vino no encontrado' }, { status: 404 })

  // Caché ES (columna original, siempre disponible)
  if (lang === 'es' && vino.ficha_ia) {
    try { return NextResponse.json({ ficha: JSON.parse(vino.ficha_ia) }) } catch {}
  }

  // Caché EN/FR/DE (columnas opcionales — la query falla silenciosamente si la migración no está aplicada)
  const cacheCol = LANG_COL[lang]
  if (cacheCol) {
    const { data: cached } = await supabaseAdmin
      .from('vinos_tienda')
      .select(cacheCol)
      .eq('id', id)
      .eq('tienda_id', tienda.id)
      .single()

    if (cached?.[cacheCol]) {
      try { return NextResponse.json({ ficha: JSON.parse(cached[cacheCol]) }) } catch {}
    }
  }

  const allowed = await checkRateLimit(getIP(request))
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiadas fichas generadas. Intentalo en unos minutos.' }, { status: 429 })
  }

  const notasExistentes = (vino.notas_cata || vino.descripcion || '').trim()
  const langName = LANG_NAMES[lang] || 'Spanish'

  const info = [
    vino.nombre, vino.bodega, vino.tipo, vino.uva, vino.region,
    vino.pais, vino.anada ? `Vintage ${vino.anada}` : '',
    vino.precio_pvp ? `${vino.precio_pvp}€` : '',
  ].filter(Boolean).join(' | ')

  const notasInstruction = notasExistentes
    ? `For the "notas" field, start from this existing description and improve it: "${notasExistentes}". Keep the essence but make it more evocative and accessible, without technical jargon.`
    : `For the "notas" field, write 2-3 tasting sentences in simple, evocative language without technical jargon.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are a wine expert generating a wine card for a wine shop kiosk. Respond entirely in ${langName}.

Wine data: ${info}
${notasExistentes ? `\nExisting shop description: "${notasExistentes}"` : ''}

${notasInstruction}

Reply ONLY with valid JSON:
{
  "notas": "2-3 tasting sentences",
  "temperatura": "serving temperature, e.g.: 16-18°C",
  "copa": "ideal glass type as a full phrase without starting with 'Copa', e.g.: 'Vaso de vino blanco tipo tulipa'",
  "maridajes": ["food pairing 1", "food pairing 2", "food pairing 3"],
  "curiosidad": "1 curious fact about the winery, region or grape (max 30 words)"
}`,
      }],
    })

    const texto = response.content[0]?.text || ''
    const match = texto.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Sin JSON')
    const ficha = JSON.parse(match[0])

    // Guardar en caché según idioma (fire-and-forget — no bloquea la respuesta)
    if (lang === 'es') {
      supabaseAdmin.from('vinos_tienda')
        .update({ ficha_ia: JSON.stringify(ficha) })
        .eq('id', id).eq('tienda_id', tienda.id)
        .then(() => {}).catch(() => {})
    } else if (cacheCol) {
      supabaseAdmin.from('vinos_tienda')
        .update({ [cacheCol]: JSON.stringify(ficha) })
        .eq('id', id).eq('tienda_id', tienda.id)
        .then(() => {}).catch(() => {})
    }

    return NextResponse.json({ ficha })
  } catch (err) {
    console.error('[ficha IA]', err)
    return NextResponse.json({ ficha: null })
  }
}
