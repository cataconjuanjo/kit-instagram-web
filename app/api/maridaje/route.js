import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { analizarMaridaje, resumenAnalisisParaPrompt, estimarPerfil, contextoDesdeCategoria } from '../../lib/maridajeEngine'
import { analizarConGoldstein } from '../../lib/goldsteinStructural'
import { puedeUsar } from '../../lib/plans'
import { comprobarCuotaIaRestaurante, registrarConsumoAnthropic, responderCuotaIaAgotada } from '../../lib/anthropicUsage'
import { origenConsumoCarta } from '../../lib/cartaPruebaToken'
import { actividadRealDesdeISO } from '../../lib/actividadReal'
import { guardarAtribucionDesdeEventos } from '../../lib/recommendationAttribution'
import { isLargeFormatWine } from '../../lib/wineFormat'
import { limpiarMarcadorPerfiles } from '../../lib/wineProfileTags'
import {
  limpiarMencionesTemporales, limpiarTagsInternos, limpiarNotasDe,
  filtrarPalabrasProhibidasPost, asegurarMayusculas, aplicarFiltrosVoz,
  extraerTechoPrecio, formatearNotaClienteBloque,
  detectarExclusionTipoVino, detectarRequisitoTipoVino,
  detectarNotaSensible, sanitizarLogInterno,
} from '../../lib/textFilters.mjs'
import { candidatosUnicos, seleccionarVinosConRoles, SCORE_MINIMO_RECOMENDACION } from '../../lib/wineSelection.mjs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SELECT_RESTAURANTE_MARIDAJE = 'id, plan, subscription_status, actividad_real_desde'
const SELECT_VINO_MARIDAJE = [
  'id', 'nombre', 'bodega', 'tipo', 'region', 'uva', 'anada',
  'precio_copa', 'precio_botella', 'notas_cata', 'activo', 'stock',
  'stock_minimo', 'internacional',
].join(', ')
const SELECT_PLATO_MARIDAJE = 'id, nombre, categoria, precio, descripcion, activo, familias_aromaticas'

// ── Rate limiting ──────────────────────────────────────────────────────────
const RATE_LIMIT_RESTAURANTE = 150  // per restaurant per hour
const RATE_LIMIT_SESION = 20        // per session/device per hour
const RATE_WINDOW_MS = 60 * 60 * 1000

async function checkRateLimitNuevo(restauranteId, sessionId) {
  try {
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()

    const { count: countRest } = await supabaseAdmin
      .from('rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('ip', `r:${restauranteId}`)
      .eq('endpoint', 'maridaje')
      .gte('created_at', since)

    if ((countRest || 0) >= RATE_LIMIT_RESTAURANTE) return { allowed: false, tipo: 'restaurante' }

    if (sessionId) {
      const { count: countSesion } = await supabaseAdmin
        .from('rate_limits')
        .select('id', { count: 'exact', head: true })
        .eq('ip', `s:${sessionId}`)
        .eq('endpoint', 'maridaje')
        .gte('created_at', since)

      if ((countSesion || 0) >= RATE_LIMIT_SESION) return { allowed: false, tipo: 'sesion' }
    }

    const inserts = [{ ip: `r:${restauranteId}`, endpoint: 'maridaje' }]
    if (sessionId) inserts.push({ ip: `s:${sessionId}`, endpoint: 'maridaje' })
    await supabaseAdmin.from('rate_limits').insert(inserts)

    return { allowed: true }
  } catch (err) {
    console.error('[rate_limit] error (fail open):', err?.message)
    return { allowed: true }
  }
}

function modoArmoniaDesdeModo(modo = '') {
  if (modo === 'quiz') return 'recomendame'
  if (modo === 'vino') return 'ya_tengo_vino'
  if (modo === 'mesa' || modo === 'plato') return 'por_platos'
  return modo || 'seguimiento'
}

function detalleSommelierArmonia({
  modo = '',
  modoMesa = '',
  consulta = '',
  platoIds = [],
  platosContexto = [],
  perfilQuiz = null,
  vinoId = '',
  vinoNombre = '',
}) {
  const consultaTexto = Array.isArray(consulta) ? consulta.join(', ') : String(consulta || '')
  const detalle = {
    origen: 'cliente',
    modo: modo || 'consulta',
    modo_armonia: modoArmoniaDesdeModo(modo),
    consulta: consultaTexto.slice(0, 200),
  }

  if (modoMesa) detalle.modo_mesa = String(modoMesa).slice(0, 140)
  if (platoIds.length) detalle.plato_ids = platoIds.slice(0, 20)
  if (platosContexto.length) {
    detalle.platos = platosContexto
      .map(plato => ({ id: plato.id, nombre: plato.nombre }))
      .filter(plato => plato.id || plato.nombre)
      .slice(0, 20)
  }

  if (perfilQuiz && typeof perfilQuiz === 'object') {
    const quiz = {
      tipo: String(perfilQuiz.tipo || '').slice(0, 40),
      estilo: String(perfilQuiz.estilo || '').slice(0, 40),
      comida: String(perfilQuiz.comida || '').slice(0, 40),
      precio: String(perfilQuiz.precio || '').slice(0, 40),
    }
    if (Object.values(quiz).some(Boolean)) detalle.perfil_quiz = quiz
  }

  if (vinoId) detalle.vino_id = String(vinoId).slice(0, 80)
  const vino = String(vinoNombre || (modo === 'vino' ? consultaTexto.split(',')[0] : '')).trim()
  if (vino) detalle.vino = vino.slice(0, 180)

  return JSON.stringify(detalle)
}

function normalizarTexto(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function esBebidaFueraMaridaje(vino = {}) {
  return normalizarTexto(vino.tipo || '') === 'sidra' || isLargeFormatWine(vino)
}

function lineaVino(vino, soloCopa = false) {
  return `- ${vino.nombre} (${[
    vino.bodega,
    vino.tipo,
    vino.region,
    vino.uva ? `uva: ${vino.uva}` : '',
    vino.anada ? `añada: ${vino.anada}` : '',
    soloCopa
      ? (Number(vino.precio_copa) ? `copa: ${vino.precio_copa}€` : '')
      : (Number(vino.precio_botella) ? `botella: ${vino.precio_botella}€` : ''),
    limpiarMarcadorPerfiles(vino.notas_cata) ? `notas: ${limpiarMarcadorPerfiles(vino.notas_cata)}` : '',
  ].filter(Boolean).join(', ')})`
}

function lineaPlato(plato) {
  return `- ${plato.nombre}${plato.precio ? ` (${plato.precio}€)` : ''}${plato.descripcion ? ': ' + plato.descripcion : ''} (${plato.categoria})`
}

// ── Prompt maestro — basado en metodología Chartier ───────────────────────
const REGLA_CONTEXTO_TEMPORAL_ES = 'No menciones horas, dias ni momentos subjetivos del servicio: evita "hoy", "esta noche", "esta cena" o "esta comida". Usa formulas neutras como "estos platos", "esta eleccion", "esta mesa" o "el conjunto".'
const REGLA_CONTEXTO_TEMPORAL_EN = 'Do not mention hours, days or subjective service moments: avoid "today", "tonight", "this dinner" or "this lunch". Use neutral wording such as "these dishes", "this selection", "this table" or "the set".'


function formatearPrecioFinal(vino, soloCopa, idioma = 'es') {
  const precioN = soloCopa ? Number(vino.precio_copa) : Number(vino.precio_botella)
  if (!precioN) return ''
  const str = precioN % 1 === 0
    ? precioN.toString()
    : (idioma === 'en' ? precioN.toString() : precioN.toString().replace('.', ','))
  return soloCopa
    ? `${str}€/${idioma === 'en' ? 'glass' : 'copa'}`
    : `${str}€`
}

function detectarSeñalPresupuesto(notaCliente = '') {
  const texto = normalizarTexto(notaCliente)
  const terminos = [
    'sin gastar mucho', 'sin gastar demasiado', 'barato', 'economico', 'economica',
    'asequible', 'no muy caro', 'no muy cara', 'sin pasarse', 'ajustado de precio',
    'relacion calidad', 'precio razonable', 'precio ajustado', 'buena relacion', 'gastando poco',
    'budget', 'affordable', 'cheap', 'inexpensive', 'not too expensive',
    'value for money', 'dont spend', "don't spend", 'on a budget', 'value wine', 'spend less',
  ]
  return terminos.some(t => texto.includes(t)) ||
    /(?:hasta|menos de)\s+\d+\s*(?:euros?|€)/.test(texto) ||
    /less\s+than\s+\d+/.test(texto)
}

/**
 * Classifies nota_cliente using Claude Haiku — returns structured constraints.
 * Falls back to regex functions if the API call fails.
 */
async function clasificarNotaCliente(notaCliente) {
  if (!notaCliente?.trim()) {
    return { tipo_incluido: null, tipo_excluido: null, presupuesto_max: null, señal_presupuesto: false, otras_restricciones: null }
  }
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `Classify this guest wine note. Return ONLY valid JSON, nothing else.

Schema (all keys required):
{
  "tipo_incluido": null or array — wine types the guest explicitly REQUIRES,
  "tipo_excluido": null or array — wine types the guest explicitly REFUSES,
  "presupuesto_max": null or number — euro ceiling, only if a number is stated,
  "señal_presupuesto": boolean — true if ANY budget concern (even without a number),
  "otras_restricciones": null or string
}

Valid types: "tinto", "blanco", "rosado", "espumoso", "generoso", "dulce"
Mappings: red/rojo/uva tinta/grape red → tinto | white/uva blanca → blanco | rosé/rosa → rosado | sparkling/cava/burbuja/champagne → espumoso | sherry/jerez/fino/manzanilla → generoso | sweet/dulce → dulce

tipo_incluido — explicit requirement phrases:
  "solo tintos", "que sea tinto", "prefiero rojo", "dame un blanco", "busco uva tinta",
  "i want a red", "give me a white", "bring me a sparkling", "id like a rosé" → set type array

tipo_excluido — explicit refusal phrases:
  "que no sea blanco", "sin tinto", "nada de blanco", "no white wine", "avoid red" → set type array

presupuesto_max — only explicit numbers:
  "hasta 25€"→25, "unos 15 euros"→15, "menos de 30"→30, "less than 20"→20, "max 40"→40

señal_presupuesto true for ALL budget signals including soft:
  "barato", "económico", "sin gastar mucho", "poco presupuesto", "que no sea muy caro",
  "affordable", "cheap", "not too expensive", "on a budget", "sin pasarse"
  AND any presupuesto_max above

Soft preferences without type/budget: "algo fresco", "con cuerpo", "ligero" → all null/false.

Guest note: "${notaCliente.replace(/"/g, '\\"')}"`
      }],
    })
    const text = msg.content?.[0]?.text?.trim() || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON')
    const r = JSON.parse(m[0])
    return {
      tipo_incluido: Array.isArray(r.tipo_incluido) && r.tipo_incluido.length ? r.tipo_incluido.map(t => String(t).toLowerCase()) : null,
      tipo_excluido: Array.isArray(r.tipo_excluido) && r.tipo_excluido.length ? r.tipo_excluido.map(t => String(t).toLowerCase()) : null,
      presupuesto_max: typeof r.presupuesto_max === 'number' && r.presupuesto_max > 0 ? r.presupuesto_max : null,
      señal_presupuesto: Boolean(r.señal_presupuesto),
      otras_restricciones: typeof r.otras_restricciones === 'string' && r.otras_restricciones ? r.otras_restricciones : null,
    }
  } catch (err) {
    console.error('[clasificarNota] error, fallback a regex:', err?.message)
    const excl = detectarExclusionTipoVino(notaCliente)
    const req  = detectarRequisitoTipoVino(notaCliente)
    const techo = extraerTechoPrecio(notaCliente)
    return {
      tipo_incluido: req.length ? req : null,
      tipo_excluido: excl.length ? excl : null,
      presupuesto_max: techo,
      señal_presupuesto: detectarSeñalPresupuesto(notaCliente) || techo !== null,
      otras_restricciones: null,
    }
  }
}

function limpiarPrefijoRecomendacion(linea = '') {
  return String(linea).trim().replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, '')
}

function vinoAlInicioDeRecomendacion(linea, vinos) {
  const limpia = limpiarPrefijoRecomendacion(linea)
  const texto = normalizarTexto(limpia)
  return (vinos || []).find(vino => {
    const nombre = normalizarTexto(vino.nombre || '')
    if (nombre.length < 4 || !texto.startsWith(nombre)) return false
    // Only accept role separators — dash/em-dash. Colon alone (": tipo → queda fuera")
    // is the internal trace format and must NOT be treated as a valid recommendation.
    return /^[-–—]\s*\S/.test(texto.slice(nombre.length).trimStart())
  })
}

function extractDishName(consulta = '', idioma = 'es') {
  const s = String(consulta).trim()
  // Multiple dishes: lineaPlato format has "- Name (price): desc, - Name2..."
  // Detect multiple by counting "- " entries or commas preceding "- "
  const entradas = s.split(/,\s*-\s+/).length
  if (entradas > 1 || /\n\s*-\s+/.test(s)) {
    return idioma === 'en' ? 'these dishes' : 'estos platos'
  }
  // Single lineaPlato: "- Nombre plato (precio): descripcion (categoria)"
  // OR plain text: "Rabo de toro"
  const match = s.match(/^-?\s*([^(:\n]+)/)
  if (match?.[1]?.trim().length >= 3) {
    return match[1].trim() // full name, no truncation
  }
  return idioma === 'en' ? 'this dish' : 'este plato'
}

function detectarSubtipoGeneroso(vino, idioma = 'es') {
  const nombre = String(vino.nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const tipo = String(vino.tipo || '').toLowerCase()

  // 1. Name-based subtype detection (most reliable)
  if (/\bmanzanilla\b/.test(nombre)) {
    return idioma === 'en'
      ? 'a saline manzanilla, dry and precise with salty snacks and seafood'
      : 'una manzanilla salina, seca y precisa con aperitivos y mariscos'
  }
  if (/\bfino\b/.test(nombre)) {
    return idioma === 'en'
      ? 'a dry fino, saline and crisp — ideal for jamón and fried foods'
      : 'un fino seco y salino, ideal con jamón y fritos'
  }
  if (/\bamontillado\b/.test(nombre)) {
    return idioma === 'en'
      ? 'a dry amontillado with nutty, aged depth for soups and cured flavours'
      : 'un amontillado seco con frutos secos y profundidad envejecida, bien con sopas y curados'
  }
  if (/\boloroso\b/.test(nombre)) {
    return idioma === 'en'
      ? 'a dry oloroso with depth and body for robust stews and aged cheese'
      : 'un oloroso seco con cuerpo y carácter para guisos contundentes y quesos curados'
  }
  if (/\bpalo\s*cortado\b/.test(nombre)) {
    return idioma === 'en'
      ? 'a palo cortado — rare fortified combining fino freshness with oloroso depth'
      : 'un palo cortado, generoso raro que combina la frescura del fino con la profundidad del oloroso'
  }

  // 2. Sweet classification: ONLY by vino.tipo === 'dulce' OR explicit sweet name
  const esDulcePorNombre = /\b(pedro\s*xim[eé]nez|p\.?x\b|moscatel|dulce)\b/.test(nombre)
  if (tipo === 'dulce' || esDulcePorNombre) {
    return idioma === 'en'
      ? 'a sweet fortified to accompany foie, blue cheese or dessert'
      : 'un generoso dulce para acompañar foie, queso azul o postre'
  }

  // 3. Default: generic dry fortified
  return idioma === 'en'
    ? 'a dry fortified that holds up to salt and fat without overwhelming'
    : 'un generoso seco que aguanta sal y grasa sin cansar'
}

function lineaFallback(consulta, item, idioma = 'es', soloCopa = false, index = 0) {
  const vino = item.vino
  const precio = soloCopa
    ? (Number(vino.precio_copa) ? `${Number(vino.precio_copa)}€/copa` : '')
    : (Number(vino.precio_botella) ? `${Number(vino.precio_botella)}€` : '')
  const tipo = String(vino.tipo || '').toLowerCase()
  const plato = extractDishName(consulta, idioma)
  const esPostre = /postre|tarta|helad|browni|chocolat|flan|natill|pannacotta|arrozcon|pudding|cheesecake|bizcocho|toffee|crepe/i.test(String(consulta).toLowerCase())
  const region = vino.region ? (idioma === 'en' ? `from ${vino.region}` : `de ${vino.region}`) : ''

  // Three distinct templates by position to avoid identical lines
  if (idioma === 'en') {
    const base = {
      tinto:    [`a red that pairs well with ${plato}`, `a red${region ? ' ' + region : ''} to accompany ${plato}`, `an accessible red for ${plato}`],
      blanco:   [`a white that fits ${plato}`, `a white${region ? ' ' + region : ''} to go with ${plato}`, `a fresh white for ${plato}`],
      rosado:   [`a fresh rosé alongside ${plato}`, `a rosé that balances ${plato}`, `a light rosé for ${plato}`],
      espumoso: [`a sparkling that brings freshness to ${plato}`, `a fizz to liven up ${plato}`, `a sparkling for ${plato}`],
      generoso: [detectarSubtipoGeneroso(vino, 'en'), `a fortified to go with ${plato}`, `a classic pairing for ${plato}`],
      dulce:    esPostre
        ? [`a sweet option to accompany ${plato}`, `a dessert wine for ${plato}`, `a sweet finish with ${plato}`]
        : [`a sweet fortified to close the meal`, `a sweet wine to finish on`, `a sweet option to round off the meal`],
    }[tipo] || [`a good option with ${plato}`, `another solid choice with ${plato}`, `a reliable pairing for ${plato}`]
    return `${vino.nombre} — It's ${base[Math.min(index, 2)]}. ${precio}`.trim()
  }

  const base = {
    tinto:    [`un tinto que acompaña bien ${plato}`, `un tinto${region ? ' ' + region : ''} para acompañar ${plato}`, `una opción de tinto para ${plato}`],
    blanco:   [`un blanco que va bien con ${plato}`, `un blanco${region ? ' ' + region : ''} para ${plato}`, `una opción fresca para ${plato}`],
    rosado:   [`un rosado fresco junto a ${plato}`, `un rosado que equilibra ${plato}`, `un rosado ligero para ${plato}`],
    espumoso: [`un espumoso que aporta frescura a ${plato}`, `un espumoso para animar ${plato}`, `un espumoso para ${plato}`],
    generoso: [detectarSubtipoGeneroso(vino, 'es'), `un generoso para acompañar ${plato}`, `un maridaje clásico para ${plato}`],
    dulce:    esPostre
      ? [`una opción dulce para acompañar ${plato}`, `un dulce que va con ${plato}`, `un vino dulce para ${plato}`]
      : [`una opción dulce para cerrar la comida`, `un dulce para terminar`, `una opción dulce de cierre`],
  }[tipo] || [`una buena opción con ${plato}`, `otra opción sólida con ${plato}`, `una opción fiable para ${plato}`]

  return `${vino.nombre} — Es ${base[Math.min(index, 2)]}. ${precio}`.trim()
}


function normalizarStockParaMaridaje(vinos = []) {
  const controlStockActivo = vinos.some(vino => Number(vino?.stock) > 0)
  if (controlStockActivo) return vinos
  return vinos.map(vino => ({ ...vino, stock: null }))
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

function fallbackDesdeMotor(candidatos = [], consulta = '', idioma = 'es', soloCopa = false) {
  const lineas = candidatosUnicos(candidatos, 3).map((item, idx) => lineaFallback(consulta, item, idioma, soloCopa, idx))
  if (lineas.length) return lineas.join('\n\n')
  return idioma === 'en'
    ? 'I cannot find a reliable pairing with the available wine list.'
    : 'No encuentro un maridaje fiable con los vinos disponibles en la carta.'
}

function respuestaSoloConCarta(texto, vinos, fallbackCandidatos, idioma, soloCopa = false, consulta = '') {
  const lineas = String(texto || '').split(/\n+/).map(linea => linea.trim()).filter(Boolean)
  const usadas = new Set()
  const validasOrdenadas = []
  for (const linea of lineas) {
    const vino = vinoAlInicioDeRecomendacion(linea, vinos)
    const clave = vino?.id || vino?.nombre
    if (!vino || usadas.has(clave)) continue
    usadas.add(clave)
    // Strip ALL price occurrences from Claude's text before appending the real price
    let lineaLimpia = limpiarPrefijoRecomendacion(linea)
      .replace(/\s*\d+(?:[.,]\d+)?\s*€(?:\/\w+)?/gi, '')
      .replace(/\s*·\s*$/, '')
      .trim()
    const precioReal = formatearPrecioFinal(vino, soloCopa, idioma)
    validasOrdenadas.push(precioReal ? `${lineaLimpia} ${precioReal}` : lineaLimpia)
  }
  // Preferir siempre el output de Claude; el motor solo entra si Claude no generó nada válido
  if (validasOrdenadas.length > 0) return validasOrdenadas.slice(0, 3).join('\n\n')
  return fallbackDesdeMotor(fallbackCandidatos, consulta, idioma, soloCopa)
}

function buildSystem(cartaVinos, idioma, soloCopa = false) {
  if (idioma === 'en') {
    const precioLabel = soloCopa ? '[glass price]€/glass' : '[price]€'
    return `You are the waiter-sommelier of this restaurant. Your role has two equal parts: give the right pairing AND help the restaurant sell the highest-value wine that truly fits the dish.
Only recommend wines from the real wine list below. Never invent wines.

Your reasoning:
1. Identify the dominant aromatic families of the dish (main ingredient, cooking technique, sauce, condiments).
2. Find wines with shared or complementary aromatic families — sauce and technique often matter more than the protein.
3. Check structure: acidity, body, grip, alcohol, sweetness.
4. Control risks: spice, salinity, umami, heavy oak, hard grip.
5. If the pairing is not ideal, say so honestly — never sound confident about a weak pairing.

Chartier rules:
- Grilling, roasting, smoke, Maillard → wines with barrel aging share aromatic bridges.
- Green, anise, citrus, herbal dishes → sauvignon blanc, verdejo, riesling, albarino, assyrtiko, chablis.
- Iodine, saline, marine dishes → precision wines: fino, manzanilla, albarino, chablis, dry riesling.
- With cheese, never assume red: most cheeses pair better with whites, fortified, or sweet wines.
- With high spice: avoid drying oak, high alcohol. Seek freshness and a hint of sweetness.
- If no wine is ideal, say "the best available option is X" — do not pretend perfection.

Writing rules:
- Wines are pre-selected with assigned roles. Your task is to write one pairing sentence per wine.
- Do not assert anything not found in the wine's data. Never invent specific aromas or descriptors (e.g. if the notes say "red fruit" do NOT write "cherry" or "raspberry" — use "red fruit" as given). If a trait is absent, use truthful non-specific terms like "fruit", "freshness" or "body".
- Do not assert anything not found in the dish name or its menu description. Never add ingredients or accompaniments the dish may typically have but are not stated (e.g. do NOT write "the aioli" or "the cream sauce" unless the dish description explicitly mentions them). Only reference what you can read in the dish name and description.

Voice — this is critical:
- Speak like a trusted waiter making a table recommendation, not like a technical guide.
- Use words any diner understands: fresh, soft, juicy, fruity, smoky, light, clean, deep.
- FORBIDDEN words: tannin, barrel, structure, terroir, minerality, unctuousness, round in the mouth, persistent finish, expressive, complex, notes of, balsamic, integrated, elegant bitterness, dark background. If you need a technical concept, translate it in the same sentence (e.g. "with a hint of oak — that vanilla touch").
- NEVER mention "estimated spend", "table budget", "price range" or any pricing logic.
- ALWAYS reference the guest's actual dish or one of its features (the sauce, the fat, the frying, the acidity...). Never use generic wine uses.
- ANTI-MULETILLA: the 3 sentences cannot share the same main verb or the same structure. If two wines work with the dish's fat, say it differently each time.
- UPPERCASE: every sentence starts with a capital letter after the role label.
- When 3 options: each sentence must be different — forbidden to repeat the same phrasing for two wines.
- NEVER output filtering traces or explain which wines are "filtered out" or "kept". That is internal logic. If the pairing is not perfect, mention it briefly in the sentence but NEVER explain type constraints to the guest and never use "non-alcoholic" or "without alcohol" unless the guest explicitly asked for it. Always recommend the best available option. Never use "→", "filtered out", "kept", or the format "name: type → action".
- ${REGLA_CONTEXTO_TEMPORAL_EN}

FORMAT — exactly this, nothing more:
[Wine name] — My pick: [1 sentence mentioning the dish or its key trait, max 22 words]. ${precioLabel}

[Wine name] — [Differentiating trait: copy EXACTLY as assigned — never rename or rephrase]: [1 different sentence, max 22 words]. ${precioLabel}

[Wine name] — Best value: [1 different sentence, max 22 words]. ${precioLabel}

The first option is the safest recommendation. Each sentence MUST mention the dish or one of its traits. Plain text only. No asterisks, bold, lists or symbols.
When wines arrive with pre-assigned roles, copy each role label VERBATIM — 'Best value' stays 'Best value', not 'More daring' or any variant.

Current wine list:
${cartaVinos}`
  }

  const precioLabelEs = soloCopa ? '[precio copa]€/copa' : '[precio]€'
  return `Eres el camarero-sumiller de este restaurante. Tu misión tiene dos partes iguales: dar el maridaje correcto Y ayudar al restaurante a vender el vino de mayor valor que armonice bien con el plato.
Solo recomiendas vinos de la carta real que aparece abajo. Nunca inventas vinos.

Tu razonamiento:
1. Identificar las familias aromáticas dominantes del plato: ingrediente principal, técnica de cocción, salsa, condimentos.
2. Buscar vinos con familias aromáticas compartidas o complementarias — la salsa y la técnica pueden pesar más que la proteína.
3. Comprobar estructura: acidez, cuerpo, agarre, alcohol, dulzor.
4. Controlar riesgos: picante, salinidad, umami, madera excesiva, agarre duro.
5. Si el maridaje no es perfecto, dilo con honestidad — nunca suenes seguro ante un maridaje débil.

Reglas Chartier:
- Brasa, asado, humo, tostado Maillard → vinos con crianza en madera comparten puente aromático.
- Platos verdes, anisados, cítricos, herbales → sauvignon blanc, verdejo, riesling, albariño, assyrtiko, chablis.
- Platos yodados, salinos, marinos → precisión: fino, manzanilla, albariño, chablis, riesling seco.
- Con quesos: no asumas tinto; la mayoría van mejor con blancos, generosos o dulces.
- Con picante alto: evita madera secante y alcohol alto. Busca frescura y un punto dulce.
- Con umami alto (setas, soja, miso, curado): cuidado con los tintos con mucho agarre.
- Si ningún vino es ideal, di cuál es la mejor opción disponible sin fingir perfección.

Reglas de redacción:
- Los vinos ya están asignados con sus roles. Tu tarea es redactar únicamente la frase de maridaje para cada uno.
- No afirmes nada que no esté en los datos del vino. Nunca inventes aromas ni descriptores concretos (ej.: si las notas dicen "fruta roja" no escribas "cereza" ni "frambuesa" — usa "fruta roja" tal como está). Si un rasgo no aparece en los datos, usa términos genéricos y verdaderos como "fruta", "frescura" o "cuerpo".
- No afirmes nada que no esté en el nombre del plato ni en su descripción de carta. Nunca añadas ingredientes o acompañamientos que el plato suele llevar pero que no aparecen en sus datos (ej.: si la carta no menciona "alioli", no escribas "la grasa del alioli"; si no menciona "salsa de nata", no la cites). Solo menciona lo que puedes leer en el nombre y la descripción del plato.

Voz — esto es crítico:
- Habla como un camarero de confianza que recomienda sin abrumar. Frases cortas, en español de España.
- Usa palabras que entienda cualquiera: fresco, suave, intenso, frutal, ligero, limpio, jugoso, salino.
- PALABRAS PROHIBIDAS: tanino, barrica, estructura, terroir, mineralidad, untuosidad, redondo en boca, final persistente, expresivo, complejo, notas de, balsámico, balsámicos, integrado, integrada, crianza (sin explicar), amargor elegante, fondo oscuro. Si necesitas un término técnico, tradúcelo en la misma frase (ej. "con toque de madera, ese punto a vainilla").
- NUNCA menciones "ticket estimado", "presupuesto de mesa", "rango de precio" ni ninguna lógica de precios.
- SIEMPRE menciona el plato elegido o uno de sus rasgos concretos (la salsa, la grasa, la fritura, la acidez...). Nunca los usos genéricos del vino.
- ANTI-MULETILLA: las 3 frases no pueden compartir el mismo verbo principal ni la misma estructura. Si dos vinos funcionan con la grasa del plato, exprésalo de forma distinta cada vez.
- MAYÚSCULA: cada frase empieza siempre con letra mayúscula después del rol.
- Cuando haya 3 opciones: cada frase debe diferenciarse de las demás — prohibido repetir el mismo texto para dos vinos distintos.
- NUNCA hagas trazas de filtrado ni expliques qué vinos "quedan fuera" o "se mantienen". Eso es lógica interna. Si el maridaje no es perfecto, menciónalo brevemente en la frase de recomendación pero NUNCA expliques al cliente las restricciones de tipo aplicadas ni uses "sin alcohol" salvo que el cliente lo haya pedido explícitamente. Recomienda siempre la mejor opción disponible. Nunca uses "→", "queda fuera", "se mantiene" ni el formato "nombre: tipo → acción".
- ${REGLA_CONTEXTO_TEMPORAL_ES}

FORMATO — exactamente esto, nada más:
[Nombre del vino] — Mi elección: [1 frase mencionando el plato o rasgo concreto, máx 22 palabras]. ${precioLabelEs}

[Nombre del vino] — [Rasgo distintivo: úsalo EXACTAMENTE como se te indica — no lo cambies ni parafrasees]: [1 frase distinta, máx 22 palabras]. ${precioLabelEs}

[Nombre del vino] — Más ajustado: [1 frase distinta, máx 22 palabras]. ${precioLabelEs}

La primera opción es la más segura. Cada frase SIEMPRE menciona el plato o algún rasgo del plato. Solo texto plano. Sin asteriscos, negritas, listas ni símbolos.
Cuando se te entregan vinos con roles ya asignados, COPIA ese rol exactamente — 'Más ajustado' es 'Más ajustado', no 'Más atrevido' ni ninguna variante.

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
FORBIDDEN words: tannin, barrel, structure, terroir, minerality, complex, expressive, notes of, balsamic, integrated. Translate technical concepts into sensory language.
Max 22 words per sentence.
${REGLA_CONTEXTO_TEMPORAL_EN}

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
PALABRAS PROHIBIDAS: tanino, barrica, estructura, terroir, mineralidad, complejo, expresivo, notas de, balsámico, integrado. Traduce los conceptos técnicos a lenguaje sensorial.
Máximo 22 palabras por frase.
${REGLA_CONTEXTO_TEMPORAL_ES}

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
FORBIDDEN words: tannin, barrel, structure, terroir, minerality, complex, expressive. Translate technical concepts into sensory language.
Max 24 words per sentence.
${REGLA_CONTEXTO_TEMPORAL_EN}

FORMAT - repeat this format for 5 or 6 dishes, ordered from strongest fit to lighter alternative:
[Dish name] — [1 natural sentence explaining why it fits that wine]. [price]€

Use exact dish names. Plain text only.

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
PALABRAS PROHIBIDAS: tanino, barrica, estructura, terroir, mineralidad, complejo, expresivo. Traduce los conceptos técnicos a lenguaje sensorial.
Máximo 24 palabras por frase.
${REGLA_CONTEXTO_TEMPORAL_ES}

FORMATO - repite este formato para 5 o 6 platos, ordenados del encaje mas fuerte a la alternativa mas ligera:
[Nombre del plato] — [1 frase natural explicando por que encaja con ese vino]. [precio]€

Usa nombres exactos de platos. Solo texto plano.

Carta de platos del restaurante:
${cartaPlatos}`
}

export async function POST(request) {
  try {
    const {
      consulta,
      nota_cliente,  // ← separate guest note field
      modo,
      modoMesa,
      restaurante_id,
      idioma = 'es',
      historial = [],
      mensajeSeguimiento,
      prueba_token,
      plato_ids = [],
      perfilQuiz,
      vino_id,
      vino_nombre,
    } = await request.json()

    if (!restaurante_id) {
      return Response.json({ error: 'Restaurante obligatorio.' }, { status: 400 })
    }

    // ── Rate limit (restaurant + session) ─────────────────────────
    const sessionId = request.headers.get('x-session-id') || null
    const rateLimitResult = await checkRateLimitNuevo(restaurante_id, sessionId)
    if (!rateLimitResult.allowed) {
      const mensaje = rateLimitResult.tipo === 'sesion'
        ? (idioma === 'en'
            ? 'Too many requests from this session. Please wait a few minutes and try again.'
            : 'Has hecho demasiadas consultas seguidas. Espera unos minutos e inténtalo de nuevo.')
        : (idioma === 'en'
            ? 'The restaurant is receiving too many requests right now. Try again in a few minutes.'
            : 'El restaurante está recibiendo demasiadas consultas ahora mismo. Inténtalo en unos minutos.')
      return Response.json({ error: mensaje }, { status: 429 })
    }
    const consultaTexto = Array.isArray(consulta) ? consulta.join(', ') : String(consulta || '')
    const platoIds = Array.isArray(plato_ids) ? plato_ids.map(id => String(id)).filter(Boolean).slice(0, 20) : []
    if (consultaTexto.length > 1200 || !Array.isArray(historial) || historial.length > 12) {
      return Response.json({ error: 'Consulta demasiado larga.' }, { status: 400 })
    }
    const notaCliente = String(nota_cliente || '').trim().slice(0, 200)

    // ── Detección de nota sensible (embarazo/lactancia) ─────────────────────
    // Early return: no consume cuota IA ni genera recomendación de vino.
    if (detectarNotaSensible(notaCliente)) {
      const mensajeNeutro = idioma === 'en'
        ? 'Given what you mentioned, it\'s best to check with the team about non-alcoholic options — they\'ll be happy to help.'
        : 'Por el contexto que comentas, mejor consulta con el equipo sobre opciones sin alcohol. Estarán encantados de ayudarte.'
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: mensajeNeutro })}\n\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, prefill: '' })}\n\n`))
          controller.close()
        },
      })
      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
      })
    }

    // Hard constraints from nota_cliente — Claude Haiku classification runs in parallel
    // with DB queries (no quota impact on restaurant; fallback to regex if call fails).
    const [clasificacion, { data: restaurante }, { data: vinosData }, { data: platos }] = await Promise.all([
      clasificarNotaCliente(notaCliente),
      supabaseAdmin.from('restaurantes').select(SELECT_RESTAURANTE_MARIDAJE).eq('id', restaurante_id).single(),
      supabaseAdmin.from('vinos').select(SELECT_VINO_MARIDAJE).eq('restaurante_id', restaurante_id).eq('activo', true),
      supabaseAdmin.from('platos').select(SELECT_PLATO_MARIDAJE).eq('restaurante_id', restaurante_id).eq('activo', true),
    ])

    const exclusionTipo = clasificacion.tipo_excluido || []
    const requisitoTipo = clasificacion.tipo_incluido || []
    const techoPrecioGlobal = clasificacion.presupuesto_max

    if (!restaurante || !puedeUsar(restaurante, 'maridaje_cliente')) {
      return Response.json({ error: 'Funcion no incluida en el plan activo.' }, { status: 403 })
    }

    const origenConsumo = origenConsumoCarta({ pruebaToken: prueba_token, restauranteId: restaurante_id })
    const cuotaIa = await comprobarCuotaIaRestaurante({
      restauranteId: restaurante_id,
      restaurante,
      endpoint: 'maridaje_cliente',
      origen: origenConsumo,
    })
    if (!cuotaIa.ok) return responderCuotaIaAgotada(cuotaIa)

    const esSucesion = normalizarTexto(modoMesa).includes('sucesion')
    const soloCopa = esSucesion || normalizarTexto(modoMesa).includes('copa') || normalizarTexto(modoMesa).includes('glass')
    const vinosDisponibles = normalizarStockParaMaridaje(vinosData || [])
      .filter(vino => !esBebidaFueraMaridaje(vino))
    const vinos = soloCopa
      ? vinosDisponibles.filter(vino => Number(vino.precio_copa) > 0)
      : vinosDisponibles
    const idsContexto = new Set(platoIds)
    const platosContexto = idsContexto.size
      ? (platos || []).filter(plato => idsContexto.has(String(plato.id)))
      : []
    const consultaInterna = platosContexto.length
      ? platosContexto.map(lineaPlato).join(', ')
      : consultaTexto
    // When platos come from DB, append DB category as a context hint for the engine.
    // This ensures dishes with non-obvious names (e.g. "Especial del chef") get the right
    // context from their DB categoria rather than falling back to 'general'.
    const consultaAnalisis = platosContexto.length
      ? platosContexto.map(p => {
          const ctx = contextoDesdeCategoria(p.categoria)
          return ctx ? `${lineaPlato(p)} [ctx:${ctx}]` : lineaPlato(p)
        })
      : consultaTexto

    const cartaVinos = (vinos || []).map(v => lineaVino(v, soloCopa)).join('\n')
    const cartaPlatos = (platos || []).map(lineaPlato).join('\n')

    let messages
    let prefill = ''
    let fallbackCandidatos = []
    let vinosRespuesta = vinos || []
    let vinosParaClaude = vinosRespuesta
    const esSeguimiento = Boolean(mensajeSeguimiento && historial.length > 0)
    const esModoPlatosParaVino = !esSeguimiento && !['mesa', 'plato', 'quiz'].includes(modo)

    // ── Filtros duros antes del motor (nota_cliente) ─────────────────────────
    // Los dos filtros (exclusión + requisito) corren ANTES de Goldstein, el motor
    // estructural y el grafo de Chartier — no son matices de redacción, son
    // restricciones de candidatos que afectan a la lista que ve Claude.
    let exclusionSinSalida = false

    // A) Exclusión negativa: "que no sea blanco", "sin tinto", "no white", etc.
    if (exclusionTipo.length > 0) {
      const filtrado = vinosRespuesta.filter(v => !exclusionTipo.includes(normalizarTexto(v.tipo || '')))
      if (filtrado.length >= 1) {
        vinosRespuesta = filtrado
      } else {
        // Toda la carta es del tipo excluido — se mantiene la lista completa y se
        // avisa a Claude para que explique la situación con honestidad.
        exclusionSinSalida = true
      }
    }

    // B) Requisito positivo: "que sea tinto", "quiero un blanco", "I want a red", etc.
    // Solo aplica si no hay ya una exclusión sin salida y el requisito no contradice
    // la exclusión activa (p.ej. "que sea tinto" + "exclusionTipo=['tinto']" = imposible).
    if (requisitoTipo.length > 0 && !exclusionSinSalida) {
      const tiposPermitidos = requisitoTipo.filter(t => !exclusionTipo.includes(t))
      if (tiposPermitidos.length > 0) {
        const filtradoReq = vinosRespuesta.filter(v => tiposPermitidos.includes(normalizarTexto(v.tipo || '')))
        if (filtradoReq.length >= 1) {
          vinosRespuesta = filtradoReq
        }
        // Si no hay vinos del tipo pedido, no filtramos — Claude explicará con honestidad
        // (bloqueExclusionSinSalida no aplica aquí; el prompt notaClienteBloque lo gestiona)
      }
    }

    // C) Techo de precio: filtra vinosRespuesta cuando ≥2 vinos caben en presupuesto.
    // Esto cierra el gap del fallback (cuando no hay roles asignados Claude ve solo
    // vinos dentro de presupuesto en el system prompt).
    if (techoPrecioGlobal !== null && !exclusionSinSalida) {
      const pFn = v => soloCopa ? (Number(v.precio_copa) || 0) : (Number(v.precio_botella) || 0)
      const dentroTecho = vinosRespuesta.filter(v => { const p = pFn(v); return p > 0 && p <= techoPrecioGlobal })
      if (dentroTecho.length >= 2) vinosRespuesta = dentroTecho
    }

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
        // 1. GOLDSTEIN — veto duro: elimina vinos estructuralmente incompatibles antes de todo
        const goldsteinAnalisis = analizarConGoldstein(consultaAnalisis, vinosRespuesta)
        const bloqueadosGoldstein = new Set(
          goldsteinAnalisis.candidatos
            .filter(item => item.bloqueado)
            .map(item => String(item.vino.id || item.vino.nombre))
        )
        vinosRespuesta = vinosRespuesta.filter(vino => !bloqueadosGoldstein.has(String(vino.id || vino.nombre)))

        // 2. MOTOR ESTRUCTURAL — determina qué vinos son compatibles con el contexto
        //    Corre antes del grafo para filtrar lo que Claude puede ver
        const motorAnalisis = analizarMaridaje(consultaAnalisis, vinosRespuesta)
        const motorCompatibles = new Set(
          [...(motorAnalisis?.recomendados || []), ...(motorAnalisis?.candidatos || [])]
            .map(c => String(c.vino?.id || c.vino?.nombre))
        )

        // Claude solo recibe vinos que pasaron el motor estructural
        // Si hay menos de 2 compatibles (carta muy pequeña), usa todos para no quedarse sin opciones
        vinosParaClaude = motorCompatibles.size >= 2
          ? vinosRespuesta.filter(v => motorCompatibles.has(String(v.id || v.nombre)))
          : vinosRespuesta

        // 3. GRAFO DE CHARTIER — da la inteligencia aromática sobre el conjunto compatible
        //    El resumen va al prompt; los candidatos se filtran por compatibilidad estructural
        let resumenGrafo = ''
        try {
          const grafoMod = await import('../../lib/chartierGraph')
          const grafoAnalisis = await grafoMod.analizarConGrafo(consultaAnalisis, vinosRespuesta)
          resumenGrafo = grafoMod.resumenGrafoParaPrompt(grafoAnalisis) || ''
          // Solo candidatos del grafo que también pasaron el motor estructural
          candidatosGrafo = (grafoAnalisis?.candidatos || [])
            .slice(0, 6)
            .map(candidatoDesdeGrafo)
            .filter(c => motorCompatibles.has(String(c.vino?.id || c.vino?.nombre)))
        } catch (err) {
          console.error('[maridaje] grafo (no fatal):', err?.message)
        }

        // 4. FALLBACK — solo candidatos validados por ambas fuentes
        fallbackCandidatos = candidatosUnicos([
          ...(motorAnalisis?.recomendados || []),
          ...(motorAnalisis?.candidatos || []),
          ...candidatosGrafo,
        ], 10)
        const resumenMotor = resumenAnalisisParaPrompt(motorAnalisis)

        // Combinar evidencia aromática (Chartier) + estructural para el prompt de Claude
        contextoCriterios = [
          resumenGrafo || '',
          resumenMotor || '',
        ].filter(Boolean).join('\n\n')

        // Registrar estadísticas
        if (actividadRealDesdeISO(restaurante) && origenConsumo === 'cliente_real') {
          const eventos = [{
            restaurante_id,
            tipo: 'sommelier',
            detalle: detalleSommelierArmonia({
              modo,
              modoMesa,
              consulta,
              platoIds,
              platosContexto,
              perfilQuiz,
              vinoId: vino_id,
              vinoNombre: vino_nombre,
            }),
          }]
          if (motorAnalisis?.recomendados?.length) {
            motorAnalisis.recomendados.forEach((item, index) => {
              if (!item?.vino) return
              eventos.push({
                restaurante_id,
                tipo: 'recomendacion',
                detalle: JSON.stringify({
                  origen: 'cliente',
                  modo,
                  modo_armonia: modoArmoniaDesdeModo(modo),
                  consulta: String(consulta || '').slice(0, 200),
                  plato_ids: platoIds,
                  vino_id: item.vino.id,
                  vino: item.vino.nombre,
                  posicion: index + 1,
                  precio: item.vino.precio_botella,
                }),
              })
            })
          }
          const { data: eventosInsertados } = await supabaseAdmin
            .from('estadisticas')
            .insert(eventos)
            .select('id, restaurante_id, tipo, detalle, created_at')
          await guardarAtribucionDesdeEventos(supabaseAdmin, eventosInsertados || [])
        }
      } else if (actividadRealDesdeISO(restaurante) && origenConsumo === 'cliente_real') {
        const { data: eventosInsertados } = await supabaseAdmin
          .from('estadisticas')
          .insert([{
            restaurante_id,
            tipo: 'sommelier',
            detalle: detalleSommelierArmonia({
              modo,
              modoMesa,
              consulta,
              platoIds,
              platosContexto,
              perfilQuiz,
              vinoId: vino_id,
              vinoNombre: vino_nombre,
            }),
          }])
          .select('id, restaurante_id, tipo, detalle, created_at')
        await guardarAtribucionDesdeEventos(supabaseAdmin, eventosInsertados || [])
      }

      // ── Construir prompt del usuario ───────────────────────────
      const modosTexto = {
        botella: idioma === 'en' ? 'a single bottle for the whole table' : 'una sola botella para toda la mesa',
        copa: idioma === 'en' ? 'a glass for each dish' : 'una copa por plato',
      }

      // Bloque de aviso cuando la exclusión deja sin alternativas (p.ej. todos los vinos
      // son blancos y el cliente pide "que no sea blanco").
      const tiposExcluidosLabel = exclusionTipo.join('/')
      const bloqueExclusionSinSalida = exclusionSinSalida && tiposExcluidosLabel
        ? (idioma === 'en'
            ? `\n\nIMPORTANT — type constraint with no alternative: The guest asked to avoid ${tiposExcluidosLabel} wines, but this wine list has no other type that pairs with the dish. Be honest: explain clearly that there is no ${tiposExcluidosLabel}-free option on this list for this dish. If any wine is available, present it as "best available option — even though it is ${tiposExcluidosLabel}" and let the guest decide.`
            : `\n\nIMPORTANTE — restricción sin alternativa: El cliente ha pedido evitar vinos de tipo ${tiposExcluidosLabel}, pero la carta no tiene otro tipo que encaje con este plato. Sé honesto: explica con claridad que no dispones de opción sin ${tiposExcluidosLabel} para este plato en la carta actual. Si hay algún vino disponible, preséntalo como "mejor opción disponible — aunque sea ${tiposExcluidosLabel}" y deja al cliente decidir.`)
        : ''

      let prompt
      if (modo === 'quiz') {
        const { tipo, estilo, comida, precio } = perfilQuiz || {}

        // Filtrar carta por tipo y precio antes de mandar a Claude
        let vinosQuiz = vinosDisponibles.filter(v => v.activo !== false && v.stock !== 0 && Number(v.precio_botella) > 0)
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
        const señalPresupuesto = clasificacion.señal_presupuesto || techoPrecioGlobal !== null
        const notaClienteBloque = formatearNotaClienteBloque(notaCliente, idioma)
        const rolesListaMesa = seleccionarVinosConRoles(fallbackCandidatos, idioma, soloCopa, señalPresupuesto, techoPrecioGlobal)
        if (rolesListaMesa.length > 0) {
          const formatRol = ({ item, rol }) => {
            const v = item.vino
            const p = soloCopa
              ? (Number(v.precio_copa) ? `${Number(v.precio_copa)}€/copa` : '')
              : (Number(v.precio_botella) ? `${Number(v.precio_botella)}€` : '')
            return `• ${rol}: ${v.nombre} (${[v.tipo, p].filter(Boolean).join(', ')})`
          }
          const listadoMesa = rolesListaMesa.map(formatRol).join('\n')
          prompt = idioma === 'en'
            ? `Dishes: ${consultaInterna}. Format: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nWines pre-selected with assigned roles — write one pairing sentence per line:\n${listadoMesa}\n\nUse the exact format from the system prompt. IMPORTANT: copy each role label EXACTLY as given — never rename, rephrase or replace it (e.g. 'Best value' not 'More daring').${notaClienteBloque}${bloqueExclusionSinSalida}`
            : `Platos: ${consultaInterna}. Formato: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nVinos asignados con sus roles — escribe una frase de maridaje por línea:\n${listadoMesa}\n\nUsa el formato exacto del system prompt. IMPORTANTE: copia el rol EXACTAMENTE como aparece — nunca lo renombres ni parafrasees (ej: 'Más ajustado' no es 'Más atrevido').${notaClienteBloque}${bloqueExclusionSinSalida}`
        } else {
          prompt = idioma === 'en'
            ? `Dishes: ${consultaInterna}. Format: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nRecommend up to 3 wines. Use the exact format from the system prompt.${notaClienteBloque}${bloqueExclusionSinSalida}`
            : `Platos: ${consultaInterna}. Formato: ${modosTexto[modoMesa] || modoMesa}.\n\n${contextoCriterios}\n\nRecomienda hasta 3 vinos. Usa el formato exacto del system prompt.${notaClienteBloque}${bloqueExclusionSinSalida}`
        }
      } else if (modo === 'plato') {
        const señalPresupuestoPlato = clasificacion.señal_presupuesto || techoPrecioGlobal !== null
        const notaClienteBloque = formatearNotaClienteBloque(notaCliente, idioma)
        const rolesListaPlato = seleccionarVinosConRoles(fallbackCandidatos, idioma, soloCopa, señalPresupuestoPlato, techoPrecioGlobal)
        if (rolesListaPlato.length > 0) {
          const formatRol = ({ item, rol }) => {
            const v = item.vino
            const p = soloCopa
              ? (Number(v.precio_copa) ? `${Number(v.precio_copa)}€/copa` : '')
              : (Number(v.precio_botella) ? `${Number(v.precio_botella)}€` : '')
            return `• ${rol}: ${v.nombre} (${[v.tipo, p].filter(Boolean).join(', ')})`
          }
          const listadoPlato = rolesListaPlato.map(formatRol).join('\n')
          prompt = idioma === 'en'
            ? `Dish: "${consultaInterna}".\n\n${contextoCriterios}\n\nWines pre-selected with assigned roles — write one pairing sentence per line:\n${listadoPlato}\n\nUse the exact format from the system prompt. IMPORTANT: copy each role label EXACTLY as given — never rename, rephrase or replace it (e.g. 'Best value' not 'More daring').${notaClienteBloque}${bloqueExclusionSinSalida}`
            : `Plato: "${consultaInterna}".\n\n${contextoCriterios}\n\nVinos asignados con sus roles — escribe una frase de maridaje por línea:\n${listadoPlato}\n\nUsa el formato exacto del system prompt. IMPORTANTE: copia el rol EXACTAMENTE como aparece — nunca lo renombres ni parafrasees (ej: 'Más ajustado' no es 'Más atrevido').${notaClienteBloque}${bloqueExclusionSinSalida}`
        } else {
          prompt = idioma === 'en'
            ? `Dish: "${consultaInterna}".\n\n${contextoCriterios}\n\nRecommend up to 3 wines. Use the exact format from the system prompt.${notaClienteBloque}${bloqueExclusionSinSalida}`
            : `Plato: "${consultaInterna}".\n\n${contextoCriterios}\n\nRecomienda hasta 3 vinos. Usa el formato exacto del system prompt.${notaClienteBloque}${bloqueExclusionSinSalida}`
        }
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

    const cartaParaPrompt = esSeguimiento ? cartaVinos : vinosParaClaude.map(v => lineaVino(v, soloCopa)).join('\n')
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
        origen: origenConsumo,
      },
    })

    const respuestaClaude = sanitizarLogInterno(limpiarTagsInternos(msg.content?.[0]?.text || ''))
    const textoRespuestaBase = (esSeguimiento || esSucesion || esModoPlatosParaVino)
      ? respuestaClaude
      : respuestaSoloConCarta(respuestaClaude, vinosParaClaude, fallbackCandidatos, idioma, soloCopa, consultaInterna)
    const textoRespuestaNeto = limpiarMencionesTemporales(aplicarFiltrosVoz(textoRespuestaBase))
    // Safety net: if sanitizer or filters emptied everything, use motor fallback.
    // Prevents blank SSE response reaching the client under any code path.
    const textoRespuesta = textoRespuestaNeto.trim()
      || fallbackDesdeMotor(fallbackCandidatos, consultaInterna, idioma, soloCopa)

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
