import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { analizarMaridaje, resumenAnalisisParaPrompt } from '../../lib/maridajeEngine'
import { puedeUsar } from '../../lib/plans'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Rate limiting ──────────────────────────────────────────────
const RATE_LIMIT = 20          // max llamadas por IP
const RATE_WINDOW_MS = 60 * 60 * 1000  // ventana de 1 hora

async function checkRateLimit(ip) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()

  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', 'maridaje')
    .gte('created_at', since)

  if ((count || 0) >= RATE_LIMIT) return false

  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint: 'maridaje' })
  return true
}

function getIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

function normalizarTexto(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

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
    return `You are a wine-pairing assistant supervised by the restaurant wine consultant. The customer reads on a mobile screen. Be VERY brief and selective.

FORMAT — exactly this, nothing more:
[Wine name] — [1 sentence why]. [price]€

[Wine name] — [1 sentence why]. [price]€

Rules:
- Plain text only. No asterisks, bold, lists, or symbols.
- One short sentence per wine explaining the structural reason (tannin, acidity, body, fat, umami — not just "it pairs well").
- Recommend up to 2 wines: one accessible option and one more ambitious/premium option.
- If both are valid, prefer different styles or colours so the customer does not feel locked into one colour.
- Only recommend wines from the list below. Never invent wines.
- WSET L3 and Chartier methodology.

Current wine list:
${cartaVinos}`
  }
  return `Eres un asistente de maridaje supervisado por el consultor de vinos del restaurante. El cliente lee desde el móvil. Sé MUY breve y exigente.

FORMATO — exactamente esto, nada más:
[Nombre del vino] — [1 frase de por que]. [precio]€

[Nombre del vino] — [1 frase de por que]. [precio]€

Reglas:
- Solo texto plano. Sin asteriscos, negritas, listas ni simbolos.
- Una frase corta por vino explicando la razón estructural (tanino, acidez, cuerpo, grasa, umami — no solo "marida bien").
- Recomienda hasta 2 vinos: una opción accesible y otra más ambiciosa/premium.
- Si ambas son válidas, intenta que tengan estilos o colores distintos para que el cliente no sienta que solo existe una vía.
- Solo recomiendas vinos de la carta real que aparece abajo. Nunca inventas vinos.
- Metodologia WSET L3 y Chartier.

Carta de vinos actual del restaurante:
${cartaVinos}`
}

export async function POST(request) {
  try {
    // ── Rate limit por IP ──────────────────────────────────────
    const ip = getIP(request)
    const allowed = await checkRateLimit(ip)
    if (!allowed) {
      return Response.json(
        { error: 'Demasiadas consultas. Espera un momento antes de volver a pedir recomendaciones.' },
        { status: 429 }
      )
    }

    const {
      consulta,
      modo,
      modoMesa,
      restaurante_id,
      idioma = 'es',
      historial = [],
      mensajeSeguimiento,
    } = await request.json()

    const [{ data: restaurante }, { data: vinosData }, { data: platos }] = await Promise.all([
      supabaseAdmin.from('restaurantes').select('*').eq('id', restaurante_id).single(),
      supabaseAdmin.from('vinos').select('*').eq('restaurante_id', restaurante_id).eq('activo', true).gt('stock', 0),
      supabaseAdmin.from('platos').select('*').eq('restaurante_id', restaurante_id).eq('activo', true),
    ])

    if (!restaurante || !puedeUsar(restaurante, 'maridaje_cliente')) {
      return Response.json({ error: 'Funcion no incluida en el plan activo.' }, { status: 403 })
    }

    const soloCopa = normalizarTexto(modoMesa).includes('copa') || normalizarTexto(modoMesa).includes('glass')
    const vinos = soloCopa
      ? (vinosData || []).filter(vino => Number(vino.precio_copa) > 0)
      : (vinosData || [])

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
          ? `Dishes: ${consulta}. Format: ${modoMesa}.\n\nPairing analysis:\n${criterioCompartido}\n\nGive up to 2 wines: one accessible option and one premium option. If format is by the glass, use only wines with glass price. If possible, avoid both wines being the same colour/style unless that is clearly the best pairing. Use the exact format from the system prompt.`
          : `Platos: ${consulta}. Formato: ${modoMesa}.\n\nAnálisis de maridaje:\n${criterioCompartido}\n\nDa hasta 2 vinos: una opción accesible y otra premium. Si el formato es por copas, usa solo vinos con precio de copa. Si es posible, evita que los dos sean del mismo color/estilo salvo que sea claramente lo mejor para el maridaje. Usa el formato exacto del system prompt.`
      } else if (modo === 'plato') {
        prompt = idioma === 'en'
          ? `Dish: "${consulta}".\n\nPairing analysis:\n${criterioCompartido}\n\nGive up to 2 wines: one accessible option and one premium option. If possible, avoid both wines being the same colour/style unless that is clearly the best pairing. Use the exact format from the system prompt.`
          : `Plato: "${consulta}".\n\nAnálisis de maridaje:\n${criterioCompartido}\n\nDa hasta 2 vinos: una opción accesible y otra premium. Si es posible, evita que los dos sean del mismo color/estilo salvo que sea claramente lo mejor para el maridaje. Usa el formato exacto del system prompt.`
      } else {
        prompt = idioma === 'en'
          ? `Wine: "${consulta}". List 3 dishes from below that pair well. One sentence each. Exact dish names.\n\n${cartaPlatos}`
          : `Vino: "${consulta}". Lista 3 platos de abajo que mariden bien. Una frase cada uno. Nombres exactos.\n\n${cartaPlatos}`
      }

      prefill = idioma === 'en'
        ? 'Of course, here is my recommendation:'
        : 'Claro, aquí va mi recomendación:'

      messages = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: prefill },
      ]

      // Registrar estadística solo en el primer turno
      const eventos = [{
        restaurante_id,
        tipo: 'sommelier',
        detalle: String(consulta || '').slice(0, 200),
      }]

      if (analisisMaridaje?.recomendados?.length) {
        analisisMaridaje.recomendados.forEach((item, index) => {
          if (!item?.vino) return
          eventos.push({
            restaurante_id,
            tipo: 'recomendacion',
            detalle: JSON.stringify({
              origen: 'cliente',
              modo,
              consulta: String(consulta || '').slice(0, 200),
              vino_id: item.vino.id,
              vino: item.vino.nombre,
              posicion: index + 1,
              precio: item.vino.precio_botella,
            }),
          })
        })
      }

      await supabaseAdmin.from('estadisticas').insert(eventos)
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
    return Response.json({ error: 'Error al consultar el maridaje.' }, { status: 500 })
  }
}
