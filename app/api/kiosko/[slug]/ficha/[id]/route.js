import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(request, { params }) {
  const { slug, id } = await params

  const { data: tienda } = await supabaseAdmin
    .from('tiendas').select('id, nombre, ciudad').eq('slug', slug).eq('activo', true).single()
  if (!tienda) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

  const { data: vino } = await supabaseAdmin
    .from('vinos_tienda').select('*').eq('id', id).eq('tienda_id', tienda.id).single()
  if (!vino) return NextResponse.json({ error: 'Vino no encontrado' }, { status: 404 })

  // Si ya tiene ficha enriquecida en BD, la devolvemos directamente
  if (vino.ficha_ia) {
    try { return NextResponse.json({ ficha: JSON.parse(vino.ficha_ia) }) } catch {}
  }

  const notasExistentes = (vino.notas_cata || vino.descripcion || '').trim()

  const info = [
    vino.nombre, vino.bodega, vino.tipo, vino.uva, vino.region,
    vino.pais, vino.anada ? `Añada ${vino.anada}` : '',
    vino.precio_pvp ? `${vino.precio_pvp}€` : '',
  ].filter(Boolean).join(' | ')

  const notasInstruction = notasExistentes
    ? `Para el campo "notas", parte de la siguiente descripción de la tienda/productor y mejórala: "${notasExistentes}". Mantén la esencia pero hazla más evocadora y accesible, sin tecnicismos.`
    : `Para el campo "notas", genera 2-3 frases de cata en lenguaje sencillo y evocador, sin tecnicismos.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Eres un sumiller experto generando la ficha para el kiosko de una vinoteca.

Datos del vino: ${info}
${notasExistentes ? `\nDescripción actual de la tienda: "${notasExistentes}"` : ''}

${notasInstruction}

Responde SOLO con JSON válido:
{
  "notas": "2-3 frases de cata",
  "temperatura": "temperatura de servicio, ej: 16-18°C",
  "copa": "tipo de copa ideal, ej: Bordelesa",
  "maridajes": ["plato o comida 1", "plato o comida 2", "plato o comida 3"],
  "curiosidad": "1 dato curioso sobre la bodega, región o tipo de uva (máx 30 palabras)"
}`,
      }],
    })

    const texto = response.content[0]?.text || ''
    const match = texto.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Sin JSON')
    const ficha = JSON.parse(match[0])

    // Guardar en BD para no repetir la llamada
    await supabaseAdmin.from('vinos_tienda')
      .update({ ficha_ia: JSON.stringify(ficha) })
      .eq('id', id)

    return NextResponse.json({ ficha })
  } catch (err) {
    console.error('[ficha IA]', err)
    return NextResponse.json({ ficha: null })
  }
}
