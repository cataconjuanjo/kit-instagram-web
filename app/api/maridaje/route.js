import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { analizarMaridaje, resumenAnalisisParaPrompt, estimarPerfil } from '../../lib/maridajeEngine'
import { analizarConGoldstein } from '../../lib/goldsteinStructural'
import { puedeUsar } from '../../lib/plans'
import { registrarConsumoAnthropic } from '../../lib/anthropicUsage'
import { origenConsumoCarta } from '../../lib/cartaPruebaToken'
import { actividadRealDesdeISO } from '../../lib/actividadReal'

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

function lineaVino(vino, soloCopa = false) {
  return `- ${vino.nombre} (${[
    vino.bodega,
    vino.tipo,
    vino.region,
    vino.uva ? `uva: ${vino.uva}` : '',
    vino.anada ? `añada: ${vino.anada}` : '',
    vino.precio_copa ? `copa: ${vino.precio_copa}€` : '',
    soloCopa ? '' : `botella: ${vino.precio_botella}€`,
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

function lineaFallback(item, idioma = 'es', soloCopa = false) {
  const vino = item.vino
  const precio = soloCopa
    ? (Number(vino.precio_copa) ? `${Number(vino.precio_copa)}€/copa` : '')
    : (Number(vino.precio_botella) ? `${Number(vino.precio_botella)}€` : '')
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

function fallbackDesdeMotor(candidatos = [], idioma = 'es', soloCopa = false) {
  const lineas = candidatosUnicos(candidatos, 3).map(item => lineaFallback(item, idioma, soloCopa))
  if (lineas.length) return lineas.join('\n\n')
  return idioma === 'en'
    ? 'I cannot find a reliable pairing with the available wine list.'
    : 'No encuentro un maridaje fiable con los vinos disponibles en la carta.'
}

function respuestaSoloConCarta(texto, vinos, fallbackCandidatos, idioma, soloCopa = false) {
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
    validas.push(lineaFallback(item, idioma, soloCopa))
    if (validas.length >= minimo) break
  }

  if (validas.length) return validas.slice(0, 3).join('\n\n')
  return fallbackDesdeMotor(fallbackCandidatos, idioma, soloCopa)
}

function buildSystem(cartaVinos, idioma, soloCopa = false) {
  if (idioma === 'en') {
    const precioLabel = soloCopa ? '[glass price]€/glass' : '[price]€'
    return `You are the sommelier of this restaurant. Your role has two equal parts: give the right pairing AND help the restaurant sell the highest-value wine that truly fits the dish.
Only recommend wines from the real wine list below. Never invent wines.

Your reasoning:
1. Identify the dominant aromatic families of the dish (main ingredient, cooking technique, sauce, condiments).
2. Find wines with shared or complementary aromatic families — sauce and technique often matter more than the protein.
3. Check structure: acidity, body, tannin, alcohol, sweetness.
4. Control risks: spice, salinity, umami, heavy oak, hard tannin.
5. If the pairing is not ideal, say so honestly — never sound confident about a weak pairing.

Chartier rules:
- Grilling, roasting, smoke, Maillard → wines with barrel aging share aromatic bridges.
- Green, anise, citrus, herbal dishes → sauvignon blanc, verdejo, riesling, albarino, assyrtiko, chablis.
- Iodine, saline, marine dishes → precision and minerality: fino, manzanilla, albarino, chablis, dry riesling.
- With cheese, never assume red: most cheeses pair better with whites, fortified, or sweet wines.
- With high spice: avoid hard tannin, high alcohol, drying oak. Seek freshness, low tannin, light sweetness.
- If no wine is ideal, say "the best available option is X" — do not pretend perfection.

Selection rules (restaurant mindset):
- Among the wines that genuinely pair well with the dish, recommend the lowest-priced one (accessible) AND the highest-priced one (premium — for the guest who wants the best the restaurant has).
- Do not search the whole list for "the most expensive wine with any connection" — the premium upsell must already be a solid pairing, just at a higher price point.
- If both are similarly priced (less than 10€ apart), keep only one and find one from a different tier.
- A third option only if it brings something genuinely different: different grape, different region, or different price tier. Never three wines from the same price range.
- Never fill the quota with a weak pairing.

Voice:
- Speak like a calm sommelier at the table, not like a technical manual.
- Use everyday sensory words: fresh, juicy, saline, soft, smoky, creamy, clean, light, deep.
- Avoid jargon. Do not mention molecules, aromatic families, lactones, terpenes or methodology.
- Make the guest feel safe, especially if they do not usually drink wine.

FORMAT — exactly this, nothing more:
[Wine name] — [1 natural sentence explaining why it will taste good with the dish]. ${precioLabel}

[Wine name] — [1 sentence]. ${precioLabel}

Each sentence: natural, sensory and specific, but not technical. Max 22 words.
Plain text only. No asterisks, bold, lists or symbols.

Current wine list:
${cartaVinos}`
  }

  const precioLabelEs = soloCopa ? '[precio copa]€/copa' : '[precio]€'
  return `Eres el sommelier de este restaurante. Tu misión tiene dos partes iguales: dar el maridaje correcto Y ayudar al restaurante a vender el vino de mayor valor que armonice bien con el plato.
Solo recomiendas vinos de la carta real que aparece abajo. Nunca inventas vinos.

Tu razonamiento:
1. Identificar las familias aromáticas dominantes del plato: ingrediente principal, técnica de cocción, salsa, condimentos.
2. Buscar vinos con familias aromáticas compartidas o complementarias — la salsa y la técnica pueden pesar más que la proteína.
3. Comprobar estructura: acidez, cuerpo, tanino, alcohol, dulzor.
4. Controlar riesgos: picante, salinidad, umami, madera excesiva, tanino duro.
5. Si el maridaje no es perfecto, dilo con honestidad — nunca suenes seguro ante un maridaje débil.

Reglas Chartier:
- Brasa, asado, humo, tostado Maillard → vinos con crianza en barrica comparten puente aromático.
- Platos verdes, anisados, cítricos, herbales → sauvignon blanc, verdejo, riesling, albariño, assyrtiko, chablis.
- Platos yodados, salinos, marinos → precisión y mineralidad: fino, manzanilla, albariño, chablis, riesling seco.
- Con quesos: no asumas tinto; la mayoría funcionan mejor con blancos, generosos, dulces.
- Con picante alto: evita tanino duro, alcohol alto y roble secante.
- Con umami alto (setas, soja, miso, curado): vigilar tintos tánicos que pueden endurecerse.
- Si ningún vino es ideal, di cuál es la mejor opción disponible sin fingir perfección.

Reglas de selección (mentalidad restaurante):
- De los vinos que maridajan bien con el plato, elige el de precio más bajo (accesible) Y el de precio más alto (premium — para el cliente que quiere lo mejor del restaurante).
- No busques el más caro de la carta en general: el upsell debe ser un vino que ya marida bien, solo que más caro que el accesible.
- Si ambas opciones tienen precio parecido (menos de 10€ de diferencia), elige solo una y busca otro de franja diferente.
- Una tercera opción solo si aporta algo genuinamente distinto: diferente uva, diferente región, o diferente rango de precio. Nunca tres vinos de la misma franja.
- Nunca rellenes el cupo con un maridaje débil solo para llegar a tres.

Voz:
- Habla como un sumiller tranquilo en mesa, no como un manual técnico.
- Usa palabras sensoriales sencillas: fresco, jugoso, salino, suave, ahumado, cremoso, limpio, ligero, profundo.
- Evita tecnicismos. No menciones moléculas, familias aromáticas, lactonas, terpenos ni metodología.
- Haz que el cliente no habitual se sienta seguro, no examinado.

FORMATO — exactamente esto, nada más:
[Nombre del vino] — [1 frase natural explicando por qué va a estar rico con el plato]. ${precioLabelEs}

[Nombre del vino] — [1 frase]. ${precioLabelEs}

La frase debe ser natural, sensorial y específica, pero no técnica. Máximo 22 palabras.
Solo texto plano. Sin asteriscos, negritas, listas ni símbolos.

Carta de vinos del restaurante:
${cartaVinos}`
}

function buildSystemSucesion(cartaVinos, idioma) {
  if (idioma === 'en') {
    return `You are a sommelier building a glass-by-glass harmonic succession using François Chartier's aromatic methodology.
Only use wines from the list below that have a glass price (copa price). Never invent wines.

Your task: recommend ONE wine by the glass per dish, in the order the dishes will be served.
The succession must follow a harmonic arc — lighter and effervescent first, building through whites and rosés, then reds, finishing with fortified or sweet if the meal ends there.
Each wine must pair with its dish AND flow naturally from the previous glass to the next.
Avoid repeating the same wine twice unless the list is very small.

Voice: calm sommelier at the table. Sensory words only. No jargon, no methodology names.

FORMAT — exactly this, one line per dish, nothing more:
1. [Wine name] with [dish] — [1 sentence: why it pairs and how it connects to what follows]. [copa price]€/glass
2. [Wine name] with [dish] — [1 sentence]. [copa price]€/glass
...
Total arc: XX€

Sentence: natural, sensory, max 22 words. Plain text only. No asterisks, bold or symbols.

Wine list (BTG only):
${cartaVinos}`
  }

  return `Eres un sommelier que construye una sucesión armónica de copas usando la metodología de François Chartier.
Solo usa vinos de la lista de abajo que tengan precio de copa. Nunca inventes vinos.

Tu tarea: recomienda UNA copa por plato, en el orden en que se servirán los platos.
La sucesión debe seguir un arco armónico — empezando por lo más ligero o con burbuja, avanzando por blancos y rosados, luego tintos, y terminando con generosos o dulces si la comida lo pide.
Cada vino debe maridar con su plato Y encadenar bien con la copa anterior y la siguiente.
No repitas el mismo vino dos veces salvo que la carta sea muy pequeña.

Voz: sumiller tranquilo en mesa. Solo palabras sensoriales. Sin tecnicismos ni nombres de metodología.

FORMATO — exactamente este, una línea por plato, nada más:
1. [Nombre del vino] con [plato] — [1 frase: por qué marida y cómo enlaza con lo siguiente]. [precio copa]€/copa
2. [Nombre del vino] con [plato] — [1 frase]. [precio copa]€/copa
...
Total sucesión: XX€

La frase debe ser natural, sensorial, máximo 22 palabras. Solo texto plano. Sin asteriscos, negritas ni símbolos.

Carta de vinos disponibles por copa:
${cartaVinos}`
}

function buildSystemPlatosParaVino(cartaPlatos, idioma) {
  if (idioma === 'en') {
    return `You are a restaurant sommelier. The guest has already chosen the wine and wants the food to follow the bottle.
Only recommend dishes from the real menu below. Never invent dishes.

Reasoning:
1. Read the wine style from its name, type, region, grape and tasting notes.
2. Choose dishes whose ingredient, sauce and cooking technique will make that wine taste better.
3. Avoid dishes that would make the wine feel harsh, flat, alcoholic or sweet.
4. If the fit is not reliable, do not include that dish.

Voice: natural table language, sensory and concise. No technical method names.

FORMAT - repeat this format for 5 or 6 dishes, ordered from strongest fit to lighter alternative:
[Dish name] — [1 natural sentence explaining why it fits that wine]. [price]€

Use exact dish names. Max 24 words per sentence. Plain text only.

Current food menu:
${cartaPlatos}`
  }

  return `Eres un sumiller de restaurante. El cliente ya ha elegido el vino y quiere que la comida siga a esa botella.
Solo recomiendas platos de la carta real de abajo. Nunca inventes platos.

Razonamiento:
1. Lee el estilo del vino por nombre, tipo, region, uva y notas de cata.
2. Elige platos cuyo ingrediente, salsa y tecnica hagan que ese vino sepa mejor.
3. Evita platos que vuelvan el vino duro, plano, alcoholico o dulce.
4. Si el encaje no es fiable, no incluyas ese plato.

Voz: lenguaje natural de mesa, sensorial y concreto. Sin nombres de metodologias.

FORMATO - repite este formato para 5 o 6 platos, ordenados del encaje mas fuerte a la alternativa mas ligera:
[Nombre del plato] — [1 frase natural explicando por que encaja con ese vino]. [precio]€

Usa nombres exactos de platos. Maximo 24 palabras por frase. Solo texto plano.

Carta de platos del restaurante:
${cartaPlatos}`
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
      plato_ids = [],
      perfilQuiz,
    } = await request.json()

    if (!restaurante_id) {
      return Response.json({ error: 'Restaurante obligatorio.' }, { status: 400 })
    }
    const consultaTexto = Array.isArray(consulta) ? consulta.join(', ') : String(consulta || '')
    const platoIds = Array.isArray(plato_ids) ? plato_ids.map(id => String(id)).filter(Boolean).slice(0, 20) : []
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

    const esSucesion = normalizarTexto(modoMesa).includes('sucesion')
    const soloCopa = esSucesion || normalizarTexto(modoMesa).includes('copa') || normalizarTexto(modoMesa).includes('glass')
    const vinos = soloCopa
      ? (vinosData || []).filter(vino => Number(vino.precio_copa) > 0)
      : (vinosData || [])
    const idsContexto = new Set(platoIds)
    const platosContexto = idsContexto.size
      ? (platos || []).filter(plato => idsContexto.has(String(plato.id)))
      : []
    const consultaInterna = platosContexto.length
      ? platosContexto.map(lineaPlato).join(', ')
      : consultaTexto

    const cartaVinos = (vinos || []).map(v => lineaVino(v, soloCopa)).join('\n')
    const cartaPlatos = (platos || []).map(lineaPlato).join('\n')

    let messages
    let prefill = ''
    let fallbackCandidatos = []
    let vinosRespuesta = vinos || []
    const esSeguimiento = Boolean(mensajeSeguimiento && historial.length > 0)
    const esModoPlatosParaVino = !esSeguimiento && !['mesa', 'plato', 'quiz'].includes(modo)

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
        const goldsteinAnalisis = analizarConGoldstein(consultaInterna, vinosRespuesta)
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
          const grafoAnalisis = await grafoMod.analizarConGrafo(consultaInterna, vinosRespuesta)
          resumenGrafo = grafoMod.resumenGrafoParaPrompt(grafoAnalisis) || ''
          candidatosGrafo = (grafoAnalisis?.candidatos || []).slice(0, 6).map(candidatoDesdeGrafo)
        } catch (err) {
          console.error('[maridaje] grafo (no fatal):', err?.message)
        }

        // Motor estructural existente (acidez, tanino, cuerpo, restricciones)
        const motorAnalisis = analizarMaridaje(consultaInterna, vinosRespuesta)
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
        if (actividadRealDesdeISO(restaurante) && origenConsumoCarta({ pruebaToken: prueba_token, restauranteId: restaurante_id }) === 'cliente_real') {
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
      }

      // ── Construir prompt del usuario ───────────────────────────
      const modosTexto = {
        botella: idioma === 'en' ? 'a single bottle for the whole table' : 'una sola botella para toda la mesa',
        copa: idioma === 'en' ? 'a glass for each dish' : 'una copa por plato',
      }

      let prompt
      if (modo === 'quiz') {
        const { tipo, estilo, comida, precio } = perfilQuiz || {}

        // Filtrar carta por tipo y precio antes de mandar a Claude
        let vinosQuiz = (vinosData || []).filter(v => v.activo !== false && v.stock !== 0 && Number(v.precio_botella) > 0)
        if (tipo) {
          const porTipo = vinosQuiz.filter(v => v.tipo === tipo)
          if (porTipo.length >= 3) vinosQuiz = porTipo
        }
        const filtrosPrecio = {
          '25': v => Number(v.precio_botella) <= 25,
          '50': v => Number(v.precio_botella) <= 50,
          '100': v => Number(v.precio_botella) <= 100,
        }
        if (precio && filtrosPrecio[precio]) {
          // Siempre respetamos el presupuesto del cliente — sin fallback al catálogo completo
          vinosQuiz = vinosQuiz.filter(filtrosPrecio[precio])
        }

        // Filtrar por estilo usando perfil estructural estimado
        if (estilo) {
          const filtrosEstilo = {
            fresco:  v => { const p = estimarPerfil(v); return p.cuerpo <= 2 || p.acidez >= 4 },
            cuerpo:  v => { const p = estimarPerfil(v); return p.cuerpo === 3 },
            potente: v => { const p = estimarPerfil(v); return p.cuerpo >= 4 },
            dulce:   v => { const p = estimarPerfil(v); return p.dulzor >= 3 || v.tipo === 'dulce' || v.tipo === 'generoso' },
          }[estilo]
          if (filtrosEstilo) {
            const porEstilo = vinosQuiz.filter(filtrosEstilo)
            if (porEstilo.length >= 2) vinosQuiz = porEstilo
          }
        }

        vinosRespuesta = vinosQuiz

        // Usar el contexto de comida para el motor estructural
        const comidaConsultaMap = {
          pescado: 'pescado a la plancha con limón',
          carne: 'carne a la brasa',
          ligero: 'ensalada aperitivo',
          solo: 'aperitivo',
          variado: 'mesa variada para compartir: pescado, carne y entrantes',
        }
        const comidaConsulta = comidaConsultaMap[comida] || 'aperitivo'
        const motorAnalisis = analizarMaridaje(comidaConsulta, vinosRespuesta)
        fallbackCandidatos = candidatosUnicos([...(motorAnalisis?.recomendados || []), ...(motorAnalisis?.candidatos || [])], 10)
        const resumenMotor = resumenAnalisisParaPrompt(motorAnalisis)

        const estiloTexto = { fresco: 'fresco y ligero', cuerpo: 'con cuerpo', potente: 'potente e intenso', dulce: 'dulce o semidulce' }[estilo] || ''
        const comidaTexto = { pescado: 'pescado o marisco', carne: 'carne o guiso', ligero: 'algo ligero', solo: 'solo, sin comida', variado: 'variado / para compartir' }[comida] || ''
        const precioTexto = { '25': 'hasta 25€', '50': 'hasta 50€', '100': 'hasta 100€', 'sin': 'sin límite' }[precio] || ''

        const perfilTexto = [
          tipo ? `tipo: ${tipo}` : '',
          estiloTexto ? `estilo: ${estiloTexto}` : '',
          comidaTexto ? `con: ${comidaTexto}` : '',
          precioTexto ? `presupuesto: ${precioTexto}` : '',
        ].filter(Boolean).join(' · ')

        const maxVinos = Math.min(3, vinosRespuesta.length)
        prompt = idioma === 'en'
          ? `Customer profile (no specific dish):\n${perfilTexto}\n\n${resumenMotor}\n\nThere are ${vinosRespuesta.length} wines available after filtering. Recommend up to ${maxVinos} — only the ones that genuinely fit. Do not fill the list if a wine does not match well. Use the exact format from the system prompt.`
          : `Perfil del cliente (sin plato concreto):\n${perfilTexto}\n\n${resumenMotor}\n\nHay ${vinosRespuesta.length} vinos disponibles tras el filtro. Recomienda como máximo ${maxVinos} — solo los que encajen de verdad. No rellenes la lista si un vino no encaja bien. Usa el formato exacto del system prompt.`
      } else if (esSucesion && modo === 'mesa') {
        const platosLista = platosContexto.length
          ? platosContexto.map((p, idx) => `${idx + 1}. ${p.nombre}${p.precio ? ` (${p.precio}€)` : ''}`).join('\n')
          : consultaInterna
        prompt = idioma === 'en'
          ? `Build a harmonic glass succession for this meal:\n${platosLista}\n\n${contextoCriterios}\n\nOne BTG wine per dish in serving order. Follow the arc (light/sparkling → whites → reds → sweet). Use only wines with copa price. Use the exact format from the system prompt.`
          : `Construye una sucesión armónica de copas para esta comida:\n${platosLista}\n\n${contextoCriterios}\n\nUna copa por plato en el orden de servicio. Sigue el arco (ligero/burbuja → blancos → tintos → dulces/generosos). Usa solo vinos con precio de copa. Usa el formato exacto del system prompt.`
      } else if (modo === 'mesa') {
        prompt = idioma === 'en'
          ? `Dishes: ${consultaInterna}. Format: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nSelect: (1) the lowest-priced wine that pairs reliably, (2) the highest-priced wine on the list that also harmonizes — this is the upsell. A third option only if it brings a genuinely different grape, region or price tier. If format is by the glass, use only wines with glass price. Never fill the quota with a weak pairing. Use the exact format from the system prompt.`
          : `Platos: ${consultaInterna}. Formato: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nElige: (1) el vino de menor precio que marida de forma fiable, (2) el de mayor precio de la carta que también armonice — ese es el upsell del restaurante. Una tercera opción solo si aporta uva, región o franja de precio genuinamente distinta. Si el formato es por copas, usa solo vinos con precio de copa. Nunca rellenes el cupo con un maridaje débil. Usa el formato exacto del system prompt.`
      } else if (modo === 'plato') {
        prompt = idioma === 'en'
          ? `Dish: "${consultaInterna}".\n\n${contextoCriterios}\n\nSelect: (1) the lowest-priced wine that pairs reliably, (2) the highest-priced wine on the list that also harmonizes — this is the upsell. A third option only if it brings a genuinely different grape, region or price tier. Never fill the quota with a weak pairing. Use the exact format from the system prompt.`
          : `Plato: "${consultaInterna}".\n\n${contextoCriterios}\n\nElige: (1) el vino de menor precio que marida de forma fiable, (2) el de mayor precio de la carta que también armonice — ese es el upsell del restaurante. Una tercera opción solo si aporta uva, región o franja de precio genuinamente distinta. Nunca rellenes el cupo con un maridaje débil. Usa el formato exacto del system prompt.`
      } else {
        // Modo inverso: dado un vino, recomendar platos
        prompt = idioma === 'en'
          ? `Chosen wine: "${consulta}". Recommend 5 or 6 real dishes from the menu that should be ordered because this wine is the priority. Explain why each dish makes the wine work.`
          : `Vino elegido: "${consulta}". Recomienda 5 o 6 platos reales de la carta que pedirias porque este vino es la prioridad. Explica por que cada plato hace funcionar el vino.`
      }

      prefill = ''
      messages = [
        { role: 'user', content: prompt },
      ]
    }

    const cartaParaPrompt = esSeguimiento ? cartaVinos : vinosRespuesta.map(v => lineaVino(v, soloCopa)).join('\n')
    const systemPrompt = esModoPlatosParaVino
      ? buildSystemPlatosParaVino(cartaPlatos, idioma)
      : (!esSeguimiento && esSucesion)
        ? buildSystemSucesion(cartaParaPrompt, idioma)
        : buildSystem(cartaParaPrompt, idioma, soloCopa)

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
    const textoRespuesta = (esSeguimiento || esSucesion || esModoPlatosParaVino)
      ? respuestaClaude
      : respuestaSoloConCarta(respuestaClaude, vinosRespuesta, fallbackCandidatos, idioma, soloCopa)

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
