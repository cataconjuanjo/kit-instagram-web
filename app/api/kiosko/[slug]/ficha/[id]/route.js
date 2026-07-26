import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const LANG_NAMES = { es: 'Spanish', en: 'English', fr: 'French', de: 'German' }

export async function GET(request, { params }) {
  const { slug, id } = await params
  const lang = new URL(request.url).searchParams.get('lang') || 'es'

  const { data: tienda } = await supabaseAdmin
    .from('tiendas').select('id, nombre, ciudad').eq('slug', slug).eq('activo', true).single()
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const { data: vino } = await supabaseAdmin
    .from('vinos_tienda').select('*').eq('id', id).eq('tienda_id', tienda.id).single()
  if (!vino) return NextResponse.json({ error: 'Vino no encontrado' }, { status: 404 })

  // La caché (ficha_ia) solo es válida para español
  if (lang === 'es' && vino.ficha_ia) {
    try { return NextResponse.json({ ficha: JSON.parse(vino.ficha_ia) }) } catch {}
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
  "copa": "ideal glass type",
  "maridajes": ["food pairing 1", "food pairing 2", "food pairing 3"],
  "curiosidad": "1 curious fact about the winery, region or grape (max 30 words)"
}`,
      }],
    })

    const texto = response.content[0]?.text || ''
    const match = texto.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Sin JSON')
    const ficha = JSON.parse(match[0])

    // Solo guardamos en caché si es español
    if (lang === 'es') {
      await supabaseAdmin.from('vinos_tienda')
        .update({ ficha_ia: JSON.stringify(ficha) })
        .eq('id', id)
    }

    return NextResponse.json({ ficha })
  } catch (err) {
    console.error('[ficha IA]', err)
    return NextResponse.json({ ficha: null })
  }
}
