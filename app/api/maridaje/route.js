import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../supabase'
import { analizarMaridaje, resumenAnalisisParaPrompt } from '../../lib/maridajeEngine'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function lineaVino(vino) {
  return `- ${vino.nombre} (${[
    vino.bodega,
    vino.tipo,
    vino.region,
    vino.uva ? `uva: ${vino.uva}` : '',
    vino.anada ? `anada: ${vino.anada}` : '',
    vino.precio_copa ? `copa: ${vino.precio_copa} EUR` : '',
    `botella: ${vino.precio_botella} EUR`,
    vino.notas_cata ? `notas: ${vino.notas_cata}` : ''
  ].filter(Boolean).join(', ')})`
}

function lineaPlato(plato) {
  return `- ${plato.nombre}${plato.precio ? ` (${plato.precio} EUR)` : ''}${plato.descripcion ? ': ' + plato.descripcion : ''} (${plato.categoria})`
}

function buildSystem(cartaVinos, idioma) {
  if (idioma === 'en') {
    return `You are an expert sommelier. The customer reads on a mobile screen. Be VERY brief.

FORMAT — exactly this, nothing more:
[Wine name] — [1 sentence why]. [price]€

[Wine name] — [1 sentence why]. [price]€

Rules:
- Plain text only. No asterisks, bold, lists, or symbols.
- One short sentence per wine explaining the structural reason (tannin, acidity, body, fat, umami — not just "it pairs well").
- Only recommend wines from the list below. Never invent wines.
- WSET L3 and Chartier methodology.

Current wine list:
${cartaVinos}`
  }
  return `Eres un sommelier experto. El cliente lee desde el movil. Se MUY breve.

FORMATO — exactamente esto, nada mas:
[Nombre del vino] — [1 frase de por que]. [precio]€

[Nombre del vino] — [1 frase de por que]. [precio]€

Reglas:
- Solo texto plano. Sin asteriscos, negritas, listas ni simbolos.
- Una frase corta por vino explicando la razon estructural (tanino, acidez, cuerpo, grasa, umami — no solo "marida bien").
- Solo recomiendas vinos de la carta real que aparece abajo. Nunca inventas vinos.
- Metodologia WSET L3 y Chartier.

Carta de vinos actual del restaurante:
${cartaVinos}`
}

export async function POST(request) {
  try {
    const {
      consulta,
      modo,
      modoMesa,
      restaurante_id,
      idioma = 'es',
      historial = [],
      mensajeSeguimiento,
    } = await request.json()

    const [{ data: vinos }, { data: platos }] = await Promise.all([
      supabase.from('vinos').select('*').eq('restaurante_id', restaurante_id).eq('activo', true).gt('stock', 0),
      supabase.from('platos').select('*').eq('restaurante_id', restaurante_id).eq('activo', true),
    ])

    const cartaVinos = (vinos || []).map(lineaVino).join('\n')
    const cartaPlatos = (platos || []).map(lineaPlato).join('\n')
    const systemPrompt = buildSystem(cartaVinos, idioma)

    let messages
    let prefill = ''

    if (mensajeSeguimiento && historial.length > 0) {
      // Turno de seguimiento: añade el mensaje al historial existente
      messages = [...historial, { role: 'user', content: mensajeSeguimiento }]
    } else {
      // Primer turno: construir prompt completo con análisis de maridaje
      const analisisMaridaje = (modo === 'mesa' || modo === 'plato')
        ? analizarMaridaje(consulta, vinos || [])
        : null
      const criterioCompartido = analisisMaridaje ? resumenAnalisisParaPrompt(analisisMaridaje) : ''

      let prompt
      if (modo === 'mesa') {
        prompt = idioma === 'en'
          ? `Dishes: ${consulta}. Format: ${modoMesa}.\n\nPairing analysis:\n${criterioCompartido}\n\nGive exactly 2 wines (one under 30€, one any price). Use the exact format from the system prompt.`
          : `Platos: ${consulta}. Formato: ${modoMesa}.\n\nAnalisis de maridaje:\n${criterioCompartido}\n\nDa exactamente 2 vinos (uno bajo 30€, otro sin limite). Usa el formato exacto del system prompt.`
      } else if (modo === 'plato') {
        prompt = idioma === 'en'
          ? `Dish: "${consulta}".\n\nPairing analysis:\n${criterioCompartido}\n\nGive exactly 2 wines (one under 30€, one any price). Use the exact format from the system prompt.`
          : `Plato: "${consulta}".\n\nAnalisis de maridaje:\n${criterioCompartido}\n\nDa exactamente 2 vinos (uno bajo 30€, otro sin limite). Usa el formato exacto del system prompt.`
      } else {
        prompt = idioma === 'en'
          ? `Wine: "${consulta}". List 3 dishes from below that pair well. One sentence each. Exact dish names.\n\n${cartaPlatos}`
          : `Vino: "${consulta}". Lista 3 platos de abajo que mariden bien. Una frase cada uno. Nombres exactos.\n\n${cartaPlatos}`
      }

      prefill = idioma === 'en'
        ? 'Of course, here is my recommendation:'
        : 'Claro, aqui va mi recomendacion:'

      messages = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: prefill },
      ]

      // Registrar estadística solo en el primer turno
      await supabase.from('estadisticas').insert([{
        restaurante_id,
        tipo: 'sommelier',
        detalle: String(consulta || '').slice(0, 200),
      }])
    }

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`))
            }
          }
          // Enviar prefill al final para que el frontend construya el historial correctamente
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, prefill })}\n\n`))
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error en maridaje:', error)
    return Response.json({ error: 'Error al consultar el sommelier.' }, { status: 500 })
  }
}
