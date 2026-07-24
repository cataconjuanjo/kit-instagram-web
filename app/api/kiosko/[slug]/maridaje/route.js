import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60 * 60 * 1000

async function checkRateLimit(ip) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', 'kiosko_maridaje')
    .gte('created_at', since)

  if ((count || 0) >= RATE_LIMIT) return false
  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint: 'kiosko_maridaje' })
  return true
}

function getIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

function lineaVino(v) {
  return `- ID:${v.id} | ${v.nombre} | ${[
    v.bodega, v.tipo, v.region,
    v.uva   ? `uva: ${v.uva}`   : '',
    v.anada ? `añada: ${v.anada}` : '',
    v.pais !== 'España' ? v.pais : '',
    v.precio_pvp ? `${v.precio_pvp}€` : '',
    v.notas_cata ? `notas: ${v.notas_cata}` : '',
    v.ubicacion_estanteria ? `estantería: ${v.ubicacion_estanteria}` : '',
  ].filter(Boolean).join(', ')}`
}

export async function POST(request, { params }) {
  const { slug } = await params
  const ip = getIP(request)

  const allowed = await checkRateLimit(ip)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Demasiadas consultas. Inténtalo en unos minutos.' },
      { status: 429 }
    )
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const consulta = String(body?.consulta || '').trim()
  if (consulta.length < 2) {
    return NextResponse.json({ error: 'Indica para qué buscas el vino' }, { status: 400 })
  }

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, ciudad')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (!tienda) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  const { data: vinos } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, bodega, tipo, region, uva, anada, pais, precio_pvp, foto_url, notas_cata, ubicacion_estanteria, destacado')
    .eq('tienda_id', tienda.id)
    .eq('activo', true)
    .gt('stock', 0)
    .order('destacado', { ascending: false })
    .limit(150)

  if (!vinos?.length) {
    return NextResponse.json({ error: 'No hay vinos disponibles en este momento' }, { status: 404 })
  }

  const listaVinos = vinos.map(lineaVino).join('\n')
  const consultaLimpia = consulta.slice(0, 400)

  const systemPrompt = `Eres el sumiller experto de ${tienda.nombre}, una tienda de vinos en ${tienda.ciudad || 'España'}.
Tu misión: ayudar al cliente a encontrar el vino perfecto para llevarse a casa.

Cuando el cliente te diga para qué plato, momento o gusto busca el vino:
- Recomienda entre 3 y 5 vinos de la lista disponible
- Explica brevemente (1-2 frases) por qué cada vino encaja usando armonía aromática
- Si el cliente menciona presupuesto, respétalo
- Prioriza vinos destacados cuando encajen bien
- Sé directo y concreto — el cliente está en el kiosko de la tienda física

Responde ÚNICAMENTE con un JSON válido en este formato exacto:
{
  "intro": "frase breve de contexto para el cliente (máx 40 palabras)",
  "recomendaciones": [
    { "id": "uuid-exacto-del-vino", "razon": "explicación en 1-2 frases" }
  ]
}

No añadas texto fuera del JSON.`

  const userPrompt = `El cliente busca: "${consultaLimpia}"

Vinos disponibles en la tienda (solo recomienda de esta lista):
${listaVinos}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const texto = response.content[0]?.text || ''

    let parsed = null
    try {
      const match = texto.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
    } catch {
      // ignore parse error, will return 500 below
    }

    if (!parsed?.recomendaciones?.length) {
      return NextResponse.json({ error: 'No se pudo generar una recomendación' }, { status: 500 })
    }

    const vinosMap = Object.fromEntries(vinos.map(v => [v.id, v]))
    const recomendaciones = parsed.recomendaciones
      .filter(r => r?.id && vinosMap[r.id])
      .map(r => ({ ...vinosMap[r.id], razon: r.razon }))
      .slice(0, 5)

    if (!recomendaciones.length) {
      return NextResponse.json({ error: 'No se encontraron vinos coincidentes' }, { status: 500 })
    }

    return NextResponse.json({
      intro: parsed.intro || '',
      recomendaciones,
    })
  } catch (err) {
    console.error('kiosko/maridaje error:', err)
    return NextResponse.json({ error: 'Error al consultar el sumiller' }, { status: 500 })
  }
}
