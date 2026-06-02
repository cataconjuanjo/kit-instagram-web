import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { analizarMaridaje, resumenAnalisisParaPrompt } from '../../lib/maridajeEngine'
import { analizarConGoldstein } from '../../lib/goldsteinStructural'
import { puedeUsar } from '../../lib/plans'
import { registrarConsumoAnthropic } from '../../lib/anthropicUsage'
import { origenConsumoCarta } from '../../lib/cartaPruebaToken'

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
function limpiarPrefijoRecomendacion(linea = '') {
  return String(linea).trim().replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, '')
}

function vinoAlInicioDeRecomendacion(linea, vinos) {
  const limpia = limpiarPrefijoRecomendacion(linea)
  const texto = normalizarTexto(limpia)
  return (vinos || []).find(vino => {
    const nombre = normalizarTexto(vino.nombre || '')
    if (nombre.length < 4 || !texto.startsWith(nombre)) return false
    return /^[-–—:]\s*\S/.test(texto.slice(nombre.length).trimStart())
  })
}

function lineaFallback(item, idioma = 'es') {
  const vino = item.vino
  const precio = Number(vino.precio_botella) ? `${Number(vino.precio_botella)}€` : ''
  const motivo = item.motivo || (idioma === 'en'
    ? 'it is a friendly option for the dish, with freshness and balance'
    : 'es una opcion amable para el plato, con frescura y equilibrio')
  return `${vino.nombre} — ${motivo}. ${precio}`.trim()
}

function candidatosUnicos(candidatos = [], limite = 3) {
  const usados = new Set()
  return candidatos.filter(item => {
    const clave = item?.vino?.id || item?.vino?.nombre
    if (!clave || usados.has(clave)) return false
    usados.add(clave)
    return true
  }).slice(0, limite)
}

function candidatoDesdeGrafo(item) {
  return {
    vino: item.vino,
    score: item.scoreGrafo,
    motivo: 'es una de las opciones mejor respaldadas para acompañar el conjunto de platos sin imponerse',
    fuente: 'Grafo Chartier + validacion estructural Goldstein',
    compatible: true,
  }
}

function fallbackDesdeMotor(candidatos = [], idioma = 'es') {
  const lineas = candidatosUnicos(candidatos, 3).map(item => lineaFallback(item, idioma))
  if (lineas.length) return lineas.join('\n\n')
  return idioma === 'en'
    ? 'I cannot find a reliable pairing with the available wine list.'
    : 'No encuentro un maridaje fiable con los vinos disponibles en la carta.'
}

function respuestaSoloConCarta(texto, vinos, fallbackCandidatos, idioma) {
  const lineas = String(texto || '').split(/\n+/).map(linea => linea.trim()).filter(Boolean)
  const usadas = new Set()
  const validas = []
  for (const linea of lineas) {
    const vino = vinoAlInicioDeRecomendacion(linea, vinos)
    if (!vino || usadas.has(vino.id || vino.nombre)) continue
    usadas.add(vino.id || vino.nombre)
    validas.push(limpiarPrefijoRecomendacion(linea))
    if (validas.length >= 3) break
  }

  const alternativas = candidatosUnicos(fallbackCandidatos, 10)
  const minimo = Math.min(2, alternativas.length)
  for (const item of alternativas) {
    const clave = item.vino.id || item.vino.nombre
    if (usadas.has(clave)) continue
    usadas.add(clave)
    validas.push(lineaFallback(item, idioma))
    if (validas.length >= minimo) break
  }

  if (validas.length) return validas.slice(0, 3).join('\n\n')
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

[Wine name] — [1 sentence third alternative if it exists]. [price]€

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

[Nombre del vino] — [1 frase con una tercera alternativa si existe]. [precio]€

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
      prueba_token,
    } = await request.json()

    if (!restaurante_id) {
      return Response.json({ error: 'Restaurante obligatorio.' }, { status: 400 })
    }
    const consultaTexto = Array.isArray(consulta) ? consulta.join(', ') : String(consulta || '')
    if (consultaTexto.length > 1200 || !Array.isArray(historial) || historial.length > 12) {
      return Response.json({ error: 'Consulta demasiado larga.' }, { status: 400 })
    }

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

    let messages
    let prefill = ''
    let fallbackCandidatos = []
    let vinosRespuesta = vinos || []
    const esSeguimiento = Boolean(mensajeSeguimiento && historial.length > 0)

    if (esSeguimiento) {
      // Turno de seguimiento — mantiene el historial existente
      messages = [...historial, { role: 'user', content: mensajeSeguimiento }]
    } else {
      // Primer turno — construir contexto completo con grafo + motor estructural
      const esModoMaridaje = modo === 'mesa' || modo === 'plato'

      // ── Análisis del grafo de Chartier ────────────────────────
      let contextoCriterios = ''
      let candidatosGrafo = []

      if (esModoMaridaje) {
        const consultaTexto = Array.isArray(consulta) ? consulta.join(', ') : String(consulta || '')
        const goldsteinAnalisis = analizarConGoldstein(consultaTexto, vinosRespuesta)
        const bloqueadosGoldstein = new Set(
          goldsteinAnalisis.candidatos
            .filter(item => item.bloqueado)
            .map(item => String(item.vino.id || item.vino.nombre))
        )
        vinosRespuesta = vinosRespuesta.filter(vino => !bloqueadosGoldstein.has(String(vino.id || vino.nombre)))

        // Grafo de Chartier — import dinámico para que un fallo no mate la ruta
        let resumenGrafo = ''
        try {
          const grafoMod = await import('../../lib/chartierGraph')
          const grafoAnalisis = await grafoMod.analizarConGrafo(consultaTexto, vinosRespuesta)
          resumenGrafo = grafoMod.resumenGrafoParaPrompt(grafoAnalisis) || ''
          candidatosGrafo = (grafoAnalisis?.candidatos || []).slice(0, 3).map(candidatoDesdeGrafo)
          if (grafoAnalisis?.confianza !== 'baja' && candidatosGrafo.length >= 2) {
            const permitidos = new Set(candidatosGrafo.map(item => String(item.vino.id || item.vino.nombre)))
            vinosRespuesta = vinosRespuesta.filter(vino => permitidos.has(String(vino.id || vino.nombre)))
          }
        } catch (err) {
          console.error('[maridaje] grafo (no fatal):', err?.message)
        }

        // Motor estructural existente (acidez, tanino, cuerpo, restricciones)
        const motorAnalisis = analizarMaridaje(consulta, vinosRespuesta)
        fallbackCandidatos = candidatosUnicos([
          ...candidatosGrafo,
          ...(motorAnalisis?.recomendados || []),
          ...(motorAnalisis?.candidatos || []),
        ], 10)
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
          ? `Dishes: ${consulta}. Format: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nGive 2 or 3 reliable wines: one accessible, one premium, and a third alternative if it is structurally safe. If format is by the glass, use only wines with glass price. Never fill the quota with a weak pairing. Use the exact format from the system prompt.`
          : `Platos: ${consulta}. Formato: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nDa 2 o 3 vinos fiables: uno accesible, otro premium y una tercera alternativa si es estructuralmente segura. Si el formato es por copas, usa solo vinos con precio de copa. Nunca rellenes el cupo con un maridaje débil. Usa el formato exacto del system prompt.`
      } else if (modo === 'plato') {
        prompt = idioma === 'en'
          ? `Dish: "${consulta}".\n\n${contextoCriterios}\n\nGive 2 or 3 reliable wines: one accessible, one premium, and a third alternative if it is structurally safe. Never fill the quota with a weak pairing. Use the exact format from the system prompt.`
          : `Plato: "${consulta}".\n\n${contextoCriterios}\n\nDa 2 o 3 vinos fiables: uno accesible, otro premium y una tercera alternativa si es estructuralmente segura. Nunca rellenes el cupo con un maridaje débil. Usa el formato exacto del system prompt.`
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

    const systemPrompt = buildSystem(
      esSeguimiento ? cartaVinos : vinosRespuesta.map(lineaVino).join('\n'),
      idioma
    )

    // ── Llamada a Claude (awaited — evita unhandled rejections en Vercel) ────
    const modelo = 'claude-sonnet-4-6'
    const msg = await anthropic.messages.create({
      model: modelo,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    })
    await registrarConsumoAnthropic({
      restauranteId: restaurante_id,
      endpoint: 'maridaje_cliente',
      modelo,
      usage: msg.usage,
      metadata: {
        seguimiento: esSeguimiento,
        modo: modo || 'seguimiento',
        origen: origenConsumoCarta({ pruebaToken: prueba_token, restauranteId: restaurante_id }),
      },
    })

    const respuestaClaude = msg.content?.[0]?.text || ''
    const textoRespuesta = esSeguimiento
      ? respuestaClaude
      : respuestaSoloConCarta(respuestaClaude, vinosRespuesta, fallbackCandidatos, idioma)

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
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Error en maridaje:', error)
    return Response.json({ error: 'Error al consultar el maridaje.' }, { status: 500 })
  }
}
