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
function vinoMencionado(linea, vinos) {
  const texto = normalizarTexto(linea)
  return (vinos || []).find(vino => {
    const nombre = normalizarTexto(vino.nombre || '')
    return nombre.length >= 4 && texto.includes(nombre)
  })
}

function fallbackDesdeMotor(candidatos = [], idioma = 'es') {
  const lineas = candidatos
    .filter(item => item?.vino?.nombre)
    .slice(0, 2)
    .map(item => {
      const vino = item.vino
      const precio = Number(vino.precio_botella) ? `${Number(vino.precio_botella)} EUR` : ''
      const motivo = item.motivo || (idioma === 'en'
        ? 'it is the friendliest option available for the dish, with enough freshness and balance'
        : 'es la opcion mas amable para el plato, con frescura y equilibrio')
      return `${vino.nombre} - ${motivo}. ${precio}`.trim()
    })

  if (lineas.length) return lineas.join('\n\n')
  return idioma === 'en'
    ? 'I cannot find a reliable pairing with the available wine list.'
    : 'No encuentro un maridaje fiable con los vinos disponibles en la carta.'
}

function respuestaSoloConCarta(texto, vinos, fallbackCandidatos, idioma) {
  const lineas = String(texto || '').split(/\n+/).map(linea => linea.trim()).filter(Boolean)
  if (!lineas.length) return fallbackDesdeMotor(fallbackCandidatos, idioma)

  const usadas = new Set()
  const validas = []
  for (const linea of lineas) {
    const vino = vinoMencionado(linea, vinos)
    if (!vino || usadas.has(vino.id || vino.nombre)) continue
    usadas.add(vino.id || vino.nombre)
    validas.push(linea)
    if (validas.length >= 2) break
  }

  if (validas.length) return validas.join('\n\n')
  return fallbackDesdeMotor(fallbackCandidatos, idioma)
}

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
6. Keep Chartier's methodology in your reasoning, but translate the final explanation into natural restaurant language.

Key rules:
- Grilling, roasting, smoke, Maillard → wines with barrel aging share aromatic bridges.
- Green, anise, citrus, herbal dishes → sauvignon blanc, verdejo, riesling, albarino, assyrtiko, chablis.
- Iodine, saline, marine dishes → precision and minerality: fino, manzanilla, albarino, chablis, dry riesling.
- With cheese, never assume red: most cheeses pair better with whites, fortified, or sweet wines.
- With high spice: avoid hard tannin, high alcohol, drying oak. Seek freshness, low tannin, light sweetness.
- If no wine is ideal, say "the best available option is X" — do not pretend perfection.

Voice:
- Speak like a calm sommelier at the table, not like a technical manual.
- Use everyday sensory words: fresh, juicy, saline, soft, smoky, creamy, clean, light, deep.
- Avoid jargon unless it is common for guests. Do not mention molecules, aromatic families, lactones, terpenes or methodology.
- Make the guest feel safe, especially if they do not usually drink wine.

FORMAT — exactly this, nothing more:
[Wine name] — [1 natural sentence explaining why it will taste good with the dish]. [price]€

[Wine name] — [1 sentence alternative if it exists]. [price]€

Each sentence: natural, sensory and specific, but not technical. Max 22 words.
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
6. La metodología Chartier debe estar en tu razonamiento, no en la forma final de hablar al cliente.

Reglas específicas de Chartier:
- Brasa, asado, humo, tostado Maillard → vinos con crianza en barrica comparten puente aromático.
- Platos verdes, anisados, cítricos, herbales → sauvignon blanc, verdejo, riesling, albariño, assyrtiko, chablis.
- Platos yodados, salinos, marinos → precisión y mineralidad: fino, manzanilla, albariño, chablis, riesling seco.
- Con quesos: no asumas tinto; la mayoría funcionan mejor con blancos, generosos, dulces.
- Con picante alto: evita tanino duro, alcohol alto y roble secante.
- Con umami alto (setas, soja, miso, curado): vigilar tintos tánicos que pueden endurecerse.
- Si ningun vino es ideal, di cuál es la mejor opción disponible sin fingir perfección.

Voz:
- Habla como un sumiller tranquilo en mesa, no como un manual técnico.
- Usa palabras sensoriales sencillas: fresco, jugoso, salino, suave, ahumado, cremoso, limpio, ligero, profundo.
- Evita tecnicismos si no ayudan al cliente. No menciones moléculas, familias aromáticas, lactonas, terpenos ni metodología.
- Haz que el cliente no habitual se sienta seguro, no examinado.

FORMATO — exactamente esto, nada más:
[Nombre del vino] — [1 frase natural explicando por qué va a estar rico con el plato]. [precio]€

[Nombre del vino] — [1 frase alternativa si existe]. [precio]€

La frase debe ser natural, sensorial y específica, pero no técnica. Máximo 22 palabras.
Solo texto plano. Sin asteriscos, negritas, listas ni símbolos.

Carta de vinos del restaurante:
${cartaVinos}`
}

export async function POST(request) {
  try {
    // ── Rate limit ─────────────────────────────────────────────────
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
    let fallbackCandidatos = []
    const esSeguimiento = Boolean(mensajeSeguimiento && historial.length > 0)

    if (esSeguimiento) {
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
        fallbackCandidatos = motorAnalisis?.recomendados || motorAnalisis?.candidatos || []
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

      prefill = ''
      messages = [
        { role: 'user', content: prompt },
      ]
    }

    // ── Llamada a Claude (awaited — evita unhandled rejections en Vercel) ────
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })

    const respuestaClaude = msg.content?.[0]?.text || ''
    const textoRespuesta = esSeguimiento
      ? respuestaClaude
      : respuestaSoloConCarta(respuestaClaude, vinos || [], fallbackCandidatos, idioma)

    // ── Devolver como SSE para que el cliente lo lea igual que antes ──────
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: textoRespuesta })}\n\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, prefill })}\n\n`))
        controller.close()
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
    return Response.json({ error: 'Error al consultar el maridaje.', _d: String(error?.message).slice(0,300) }, { status: 500 })
  }
}
