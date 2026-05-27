import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { analizarMaridaje, resumenAnalisisParaPrompt } from '../../lib/maridajeEngine'
import { puedeUsar } from '../../lib/plans'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Rate limiting ──────────────────────────────────────────────────────────
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60 * 60 * 1000

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
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function lineaVino(vino) {
  return `- ${vino.nombre} (${[
    vino.bodega,
    vino.tipo,
    vino.region,
    vino.uva ? `uva: ${vino.uva}` : '',
    vino.anada ? `añada: ${vino.anada}` : '',
    vino.precio_copa ? `copa: ${vino.precio_copa}€` : '',
    `botella: ${vino.precio_botella}€`,
    vino.notas_cata ? `notas: ${vino.notas_cata}` : '',
  ].filter(Boolean).join(', ')})`
}

function lineaPlato(plato) {
  return `- ${plato.nombre}${plato.precio ? ` (${plato.precio}€)` : ''}${plato.descripcion ? ': ' + plato.descripcion : ''} (${plato.categoria})`
}

// ── Prompt maestro — basado en metodología Chartier ───────────────────────
function buildSystem(cartaVinos, idioma) {
  if (idioma === 'en') {
    return `You are a wine pairing sommelier using François Chartier's aromatic methodology.
Only recommend wines from the real wine list below. Never invent wines.

Your reasoning:
1. Identify the dominant aromatic families of the dish (main ingredient, cooking technique, sauce, condiments).
2. Find wines with shared or complementary aromatic families — sauce and technique often matter more than the protein.
3. Check structure: acidity, body, tannin, alcohol, sweetness.
4. Control risks: spice, salinity, umami, heavy oak, hard tannin.
5. If the pairing is not ideal, say so honestly — never sound confident about a weak pairing.

Key rules:
- Grilling, roasting, smoke, Maillard → wines with barrel aging share aromatic bridges.
- Green, anise, citrus, herbal dishes → sauvignon blanc, verdejo, riesling, albarino, assyrtiko, chablis.
- Iodine, saline, marine dishes → precision and minerality: fino, manzanilla, albarino, chablis, dry riesling.
- With cheese, never assume red: most cheeses pair better with whites, fortified, or sweet wines.
- With high spice: avoid hard tannin, high alcohol, drying oak. Seek freshness, low tannin, light sweetness.
- If no wine is ideal, say "the best available option is X" — do not pretend perfection.

FORMAT — exactly this, nothing more:
[Wine name] — [1 sentence why, using the specific aromatic bridge]. [price]€

[Wine name] — [1 sentence alternative if it exists]. [price]€

Each sentence: sensory and specific — aromas, texture, freshness, aging, smoke, fat, salinity, finish. Max 25 words.
Plain text only. No asterisks, bold, lists or symbols.

Current wine list:
${cartaVinos}`
  }

  return `Eres un sommelier de maridaje que usa la metodología aromática de François Chartier.
Solo recomiendas vinos de la carta real que aparece abajo. Nunca inventas vinos.

Tu razonamiento:
1. Identificar las familias aromáticas dominantes del plato: ingrediente principal, técnica de cocción, salsa, condimentos.
2. Buscar vinos con familias aromáticas compartidas o complementarias — la salsa y la técnica pueden pesar más que la proteína.
3. Comprobar estructura: acidez, cuerpo, tanino, alcohol, dulzor.
4. Controlar riesgos: picante, salinidad, umami, madera excesiva, tanino duro.
5. Si el maridaje no es perfecto, dilo con honestidad — nunca suenes seguro ante un maridaje débil.

Reglas específicas de Chartier:
- Brasa, asado, humo, tostado Maillard → vinos con crianza en barrica comparten puente aromático.
- Platos verdes, anisados, cítricos, herbales → sauvignon blanc, verdejo, riesling, albariño, assyrtiko, chablis.
- Platos yodados, salinos, marinos → precisión y mineralidad: fino, manzanilla, albariño, chablis, riesling seco.
- Con quesos: no asumas tinto; la mayoría funcionan mejor con blancos, generosos, dulces.
- Con picante alto: evita tanino duro, alcohol alto y roble secante.
- Con umami alto (setas, soja, miso, curado): vigilar tintos tánicos que pueden endurecerse.
- Si ningun vino es ideal, di cuál es la mejor opción disponible sin fingir perfección.

FORMATO — exactamente esto, nada más:
[Nombre del vino] — [1 frase del puente aromático concreto]. [precio]€

[Nombre del vino] — [1 frase alternativa si existe]. [precio]€

La frase debe ser sensorial y específica: aromas, textura, frescura, crianza, brasa, grasa, salinidad, final en boca. Máximo 25 palabras.
Solo texto plano. Sin asteriscos, negritas, listas ni símbolos.

Carta de vinos del restaurante:
${cartaVinos}`
}

export async function POST(request) {
  try {
    // ── Rate limit ─────────────────────────────────────────────────
    const ip = getIP(request)
    try {
      const allowed = await checkRateLimit(ip)
      if (!allowed) {
        return Response.json(
          { error: 'Demasiadas consultas. Espera un momento antes de volver a pedir recomendaciones.' },
          { status: 429 }
        )
      }
    } catch (err) {
      console.error('[maridaje] checkRateLimit error:', err?.message, err?.code)
      throw err
    }

    let body
    try {
      body = await request.json()
    } catch (err) {
      console.error('[maridaje] request.json error:', err?.message)
      throw err
    }

    const {
      consulta,
      modo,
      modoMesa,
      restaurante_id,
      idioma = 'es',
      historial = [],
      mensajeSeguimiento,
    } = body

    let restaurante, vinosData, platos

    try {
      const results = await Promise.all([
        supabaseAdmin.from('restaurantes').select('*').eq('id', restaurante_id).single(),
        supabaseAdmin.from('vinos').select('*').eq('restaurante_id', restaurante_id).eq('activo', true).gt('stock', 0),
        supabaseAdmin.from('platos').select('*').eq('restaurante_id', restaurante_id).eq('activo', true),
      ])

      const [resRest, resVinos, resPlatos] = results

      if (resRest.error) {
        console.error('[maridaje] restaurantes query error:', resRest.error?.message)
        throw new Error(`Restaurante query failed: ${resRest.error?.message}`)
      }
      if (resVinos.error) {
        console.error('[maridaje] vinos query error:', resVinos.error?.message)
        throw new Error(`Vinos query failed: ${resVinos.error?.message}`)
      }
      if (resPlatos.error) {
        console.error('[maridaje] platos query error:', resPlatos.error?.message)
        throw new Error(`Platos query failed: ${resPlatos.error?.message}`)
      }

      restaurante = resRest.data
      vinosData = resVinos.data
      platos = resPlatos.data
    } catch (err) {
      console.error('[maridaje] Promise.all error:', err?.message)
      throw err
    }

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
      // Turno de seguimiento — mantiene el historial existente
      messages = [...historial, { role: 'user', content: mensajeSeguimiento }]
    } else {
      // Primer turno — construir contexto completo con grafo + motor estructural
      const esModoMaridaje = modo === 'mesa' || modo === 'plato'

      // ── Análisis del grafo de Chartier ────────────────────────
      let contextoCriterios = ''

      if (esModoMaridaje) {
        // Grafo de Chartier — import dinámico para que un fallo no mate la ruta
        let resumenGrafo = ''
        try {
          const consultaTexto = Array.isArray(consulta) ? consulta.join(', ') : String(consulta || '')
          const grafoMod = await import('../../lib/chartierGraph')
          const grafoAnalisis = await grafoMod.analizarConGrafo(consultaTexto, vinos || [])
          resumenGrafo = grafoMod.resumenGrafoParaPrompt(grafoAnalisis) || ''
        } catch (err) {
          console.error('[maridaje] grafo (no fatal):', err?.message)
        }

        // Motor estructural existente (acidez, tanino, cuerpo, restricciones)
        const motorAnalisis = analizarMaridaje(consulta, vinos || [])
        const resumenMotor = resumenAnalisisParaPrompt(motorAnalisis)

        // Combinar ambas fuentes de evidencia
        contextoCriterios = [
          resumenGrafo || '',
          resumenMotor || '',
        ].filter(Boolean).join('\n\n')

        // Registrar estadísticas
        const eventos = [{ restaurante_id, tipo: 'sommelier', detalle: String(consulta || '').slice(0, 200) }]
        if (motorAnalisis?.recomendados?.length) {
          motorAnalisis.recomendados.forEach((item, index) => {
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

      // ── Construir prompt del usuario ───────────────────────────
      const modosTexto = {
        botella: idioma === 'en' ? 'a single bottle for the whole table' : 'una sola botella para toda la mesa',
        copa: idioma === 'en' ? 'a glass for each dish' : 'una copa por plato',
        progresion: idioma === 'en' ? 'a wine progression from lighter to fuller' : 'una progresión de menos a más cuerpo',
      }

      let prompt
      if (modo === 'mesa') {
        prompt = idioma === 'en'
          ? `Dishes: ${consulta}. Format: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nGive up to 2 wines: one accessible, one premium. If format is by the glass, use only wines with glass price. Use the exact format from the system prompt.`
          : `Platos: ${consulta}. Formato: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nDa hasta 2 vinos: uno accesible y otro premium. Si el formato es por copas, usa solo vinos con precio de copa. Usa el formato exacto del system prompt.`
      } else if (modo === 'plato') {
        prompt = idioma === 'en'
          ? `Dish: "${consulta}".\n\n${contextoCriterios}\n\nGive up to 2 wines: one accessible, one premium. Use the exact format from the system prompt.`
          : `Plato: "${consulta}".\n\n${contextoCriterios}\n\nDa hasta 2 vinos: uno accesible y otro premium. Usa el formato exacto del system prompt.`
      } else {
        // Modo inverso: dado un vino, recomendar platos
        prompt = idioma === 'en'
          ? `Wine: "${consulta}". List 3 dishes from below that pair well. One sentence each. Exact dish names.\n\n${cartaPlatos}`
          : `Vino: "${consulta}". Lista 3 platos de abajo que mariden bien. Una frase cada uno. Nombres exactos.\n\n${cartaPlatos}`
      }

      prefill = idioma === 'en' ? 'Of course, here is my recommendation:' : 'Claro, aquí va mi recomendación:'
      messages = [
        { role: 'user', content: prompt },
        { role: 'assistant', content: prefill },
      ]
    }

    // ── Streaming ──────────────────────────────────────────────────
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
    console.error('[maridaje] FULL ERROR:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack?.split('\n').slice(0, 3).join(' | '),
    })
    return Response.json({ error: 'Error al consultar el maridaje.' }, { status: 500 })
  }
}
