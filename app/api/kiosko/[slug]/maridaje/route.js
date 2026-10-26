import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { isTiendaAccesible } from '../../../_lib/kioskoAuth'
import { analizarConGoldstein } from '../../../../lib/goldsteinStructural'
import { estimarPerfil, criteriosEstructurales } from '../../../../lib/maridajeEngine'
import { checkRateLimit as checkGlobalRateLimit } from '../../../../lib/security'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const GLOBAL_DAILY_MAX = 1000
const GLOBAL_DAILY_MS  = 24 * 60 * 60 * 1000

const RATE_LIMIT    = 30
const RATE_WINDOW_MS = 60 * 60 * 1000

// ── Rate limiting ─────────────────────────────────────────────────────────────

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

// Límite diario por tienda demo (usa tienda_id como clave en rate_limits).
async function checkDemoTiendaLimit(tiendaId, dailyLimit) {
  const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const endpoint = `demo_daily`
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', `tienda:${tiendaId}`)
    .eq('endpoint', endpoint)
    .gte('created_at', since)
  if ((count || 0) >= dailyLimit) return false
  await supabaseAdmin.from('rate_limits').insert({ ip: `tienda:${tiendaId}`, endpoint })
  return true
}

function getIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

// ── Normalización ─────────────────────────────────────────────────────────────

function norm(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ── Mapa región → CCAA (para filtro soloRegion del wizard) ───────────────────
const REGION_TO_CCAA = {
  'Rías Baixas': 'Galicia', 'Ribeiro': 'Galicia', 'Ribeira Sacra': 'Galicia',
  'Valdeorras': 'Galicia', 'Monterrei': 'Galicia',
  'Canarias': 'Canarias', 'Lanzarote': 'Canarias', 'La Palma': 'Canarias',
  'Tenerife': 'Canarias', 'Gran Canaria': 'Canarias', 'El Hierro': 'Canarias',
  'La Gomera': 'Canarias', 'Fuerteventura': 'Canarias',
  'Ycoden-Daute-Isora': 'Canarias', 'Tacoronte-Acentejo': 'Canarias',
  'Valle de Güímar': 'Canarias', 'Valle de la Orotava': 'Canarias',
  'Abona': 'Canarias', 'Gran Canaria DO': 'Canarias', 'Islas Canarias': 'Canarias',
  'Rioja': 'La Rioja', 'Ribera del Duero': 'Castilla y León',
  'Rueda': 'Castilla y León', 'Toro': 'Castilla y León', 'Bierzo': 'Castilla y León',
  'Cigales': 'Castilla y León', 'Arlanza': 'Castilla y León',
  'Priorat': 'Cataluña', 'Penedès': 'Cataluña', 'Empordà': 'Cataluña',
  'Costers del Segre': 'Cataluña', 'Conca de Barberà': 'Cataluña',
  'Navarra': 'Navarra',
  'Jerez': 'Andalucía', 'Manzanilla': 'Andalucía', 'Montilla-Moriles': 'Andalucía',
  'Málaga': 'Andalucía', 'Sierras de Málaga': 'Andalucía',
  'Jumilla': 'Murcia', 'Yecla': 'Murcia', 'Bullas': 'Murcia',
  'La Mancha': 'Castilla-La Mancha', 'Valdepeñas': 'Castilla-La Mancha',
  'Manchuela': 'Castilla-La Mancha',
  'Alicante': 'Comunidad Valenciana', 'Utiel-Requena': 'Comunidad Valenciana',
  'Valencia': 'Comunidad Valenciana',
  'Txakoli': 'País Vasco', 'Getariako Txakolina': 'País Vasco',
  'Somontano': 'Aragón', 'Calatayud': 'Aragón', 'Campo de Borja': 'Aragón',
  'Vinho Verde': 'Portugal', 'Douro': 'Portugal', 'Alentejo': 'Portugal',
  'Champagne': 'Francia', 'Bourgogne': 'Francia', 'Bordeaux': 'Francia',
  'Alsace': 'Francia', 'Côtes du Rhône': 'Francia',
}

// ── Filtro estructural adaptado a vinos_tienda ────────────────────────────────
// Usa estimarPerfil (de maridajeEngine) con los campos de vinos_tienda.
// No usa precio_botella ni coste_compra — eso es lógica de restaurante.

function necesidadesKiosko(consulta) {
  const t = norm(consulta)
  const n = {}

  if (['pescado','lubina','dorada','merluza','bacalao','salmon','rape','rodaballo','sepia','chipiron','gamba','langostino','marisco','almeja','mejillon'].some(p => t.includes(p))) {
    n.taninosMax = 2; n.acidezMin = 3
  }
  if (['carne','ternera','vaca','buey','cordero','chuleton','entrecot','solomillo','presa','secreto','carrillera','rabo','codillo'].some(p => t.includes(p))) {
    n.taninosMin = 3; n.cuerpoMin = 3
  }
  if (['frito','fritura','croqueta','tempura','rebozado'].some(p => t.includes(p))) {
    n.acidezMin = 4; n.taninosMax = 2; n.cuerpoMax = 3
  }
  if (['picante','curry','guindilla','brava','pil pil'].some(p => t.includes(p))) {
    n.alcoholMax = 3; n.taninosMax = 2
  }
  if (['postre','chocolate','tarta','helado','brownie'].some(p => t.includes(p))) {
    n.dulzorMin = 3
  }

  return n
}

function puntuarVino(vino, necesidades) {
  const p = estimarPerfil(vino)
  let score = 0

  if (necesidades.taninosMax !== undefined && p.taninos > necesidades.taninosMax) score -= 30
  if (necesidades.taninosMin !== undefined && p.taninos < necesidades.taninosMin) score -= 20
  if (necesidades.acidezMin  !== undefined && p.acidez  < necesidades.acidezMin)  score -= 20
  if (necesidades.cuerpoMin  !== undefined && p.cuerpo  < necesidades.cuerpoMin)  score -= 15
  if (necesidades.cuerpoMax  !== undefined && p.cuerpo  > necesidades.cuerpoMax)  score -= 15
  if (necesidades.alcoholMax !== undefined && p.alcohol > necesidades.alcoholMax)  score -= 20
  if (necesidades.dulzorMin  !== undefined && p.dulzor  < necesidades.dulzorMin)  score -= 30

  return score
}

// ── Grafo de Chartier (opcional — no falla si no está disponible) ─────────────

async function intentarGrafo(consulta, vinos) {
  try {
    const grafoMod = await import('../../../../lib/chartierGraph')
    const analisis = await grafoMod.analizarConGrafo(consulta, vinos)
    const resumen  = grafoMod.resumenGrafoParaPrompt(analisis)
    const idsGrafo = new Set(
      (analisis?.candidatos || []).slice(0, 10).map(c => String(c.vino?.id || c.vino?.nombre))
    )
    return { resumen, idsGrafo }
  } catch {
    return { resumen: '', idsGrafo: new Set() }
  }
}

// ── Línea de vino para el prompt ──────────────────────────────────────────────

function lineaVino(v) {
  return `- ID:${v.id} | ${v.nombre} | ${[
    v.bodega, v.tipo, v.region,
    v.uva    ? `uva: ${v.uva}`    : '',
    v.anada  ? `añada: ${v.anada}` : '',
    v.pais && v.pais !== 'España' ? v.pais : '',
    v.precio_pvp ? `${v.precio_pvp}€` : '',
    v.notas_cata ? `notas: ${v.notas_cata}` : '',
    v.ubicacion_estanteria ? `estantería: ${v.ubicacion_estanteria}` : '',
  ].filter(Boolean).join(', ')}`
}

// ── System prompt para el wizard de preferencias ──────────────────────────────

function buildSystemWizard(tienda, listaVinos) {
  return `Eres el asesor experto en vinos de ${tienda.nombre}, una tienda de vinos${tienda.ciudad ? ` en ${tienda.ciudad}` : ''}.
El cliente NO busca un maridaje con comida — busca un vino según su ocasión y estilo preferido.

Criterios de selección:
- "regalo": elige vinos con etiqueta atractiva, nombre interesante o que destaquen visualmente.
- "celebración": prioriza espumosos, blancos elegantes o tintos suaves y festivos.
- "para casa": recomienda según estilo sin restricciones de maridaje.
- "afrutado" → blancos jóvenes, rosados, tintos de fruta fresca.
- "seco y elegante" → blancos con crianza, tintos finos y estructurados.
- "mucho cuerpo" → tintos con crianza o reserva, robustos y complejos.
- "ligero y fresco" → blancos jóvenes, tintos ligeros, rosados.
- "espumoso" → cavas, champagnes, proseccos.
- "dulce o generoso" → generosos, dulces naturales, vendimias tardías.
- Respeta siempre el presupuesto indicado.

Responde ÚNICAMENTE con este JSON:
{
  "intro": "frase breve (máx 20 palabras) que confirma en lenguaje sencillo qué estás buscando para el cliente",
  "recomendaciones": [
    { "id": "uuid-exacto-del-vino", "razon": "1-2 frases concretas sobre por qué encaja con lo que pide" }
  ]
}

La intro debe ser simple y directa, sin tecnicismos. Por ejemplo: "Aquí tienes tres tintos con cuerpo y crianza, perfectos para regalar." No inventes contexto ni especifiques estilos que el cliente no pidió.
Solo recomienda vinos de esta lista:

${listaVinos}`
}

// ── System prompt con metodología Chartier ────────────────────────────────────

function buildSystem(tienda, listaVinos, contextoCriterios) {
  return `Eres el asesor experto en vinos de ${tienda.nombre}, una tienda especializada en vinos${tienda.ciudad ? ` en ${tienda.ciudad}` : ''}.
Tu misión: ayudar al cliente a encontrar el vino perfecto para llevarse a casa.

Tu razonamiento:
1. Identificar las familias aromáticas dominantes: ingrediente principal, técnica de cocción, salsa, condimentos.
2. Buscar vinos con familias aromáticas compartidas o complementarias — la salsa y la técnica pueden pesar más que la proteína.
3. Comprobar estructura: acidez, cuerpo, tanino, alcohol, dulzor.
4. Controlar riesgos: picante, salinidad, umami, madera excesiva, tanino duro.
5. Si el maridaje no es perfecto, dilo con honestidad.

Reglas Chartier:
- Brasa, asado, humo, tostado → vinos con crianza en barrica comparten puente aromático.
- Platos verdes, anisados, cítricos, herbales → sauvignon blanc, verdejo, riesling, albariño, godello.
- Platos yodados, salinos, marinos → precisión y mineralidad: fino, manzanilla, albariño, chablis, riesling seco.
- Con quesos: no asumas tinto; la mayoría funcionan mejor con blancos, generosos o dulces.
- Con picante alto: evita tanino duro, alcohol alto y roble secante. Busca frescura.
- Con umami alto (setas, trufa, estofado): vigilar tintos tánicos que pueden endurecerse.
- Si ningún vino es ideal, di cuál es la mejor opción disponible sin fingir perfección.

${contextoCriterios ? `Análisis previo del plato:\n${contextoCriterios}\n` : ''}

Responde ÚNICAMENTE con un JSON válido en este formato exacto:
{
  "intro": "frase breve de contexto para el cliente (máx 40 palabras)",
  "recomendaciones": [
    { "id": "uuid-exacto-del-vino", "razon": "explicación en 1-2 frases sensoriales y concretas" }
  ]
}

La razón SIEMPRE menciona el plato o ingrediente del cliente — nunca uses frases genéricas como "ideal para mariscos". Máximo 3-5 vinos.
Solo recomienda vinos de esta lista. No inventes vinos:

${listaVinos}`
}

// ── Instrucción de idioma ─────────────────────────────────────────────────────

function langInstruction(lang) {
  if (lang === 'en') return '\n\nRespond entirely in English. All text in the JSON response (intro, razon fields) must be in English.'
  if (lang === 'fr') return '\n\nRéponds entièrement en français. Tout le texte dans la réponse JSON (champs intro, razon) doit être en français.'
  if (lang === 'de') return '\n\nAntworte vollständig auf Deutsch. Der gesamte Text in der JSON-Antwort (Felder intro, razon) muss auf Deutsch sein.'
  return ''
}

// ── Rate limiting para wine-to-food (20 req / 10 min por IP) ─────────────────

const WINE_FOOD_LIMIT     = 20
const WINE_FOOD_WINDOW_MS = 10 * 60 * 1000

async function checkWineFoodRateLimit(ip) {
  const since = new Date(Date.now() - WINE_FOOD_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', 'kiosko_wine_food')
    .gte('created_at', since)
  if ((count || 0) >= WINE_FOOD_LIMIT) return false
  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint: 'kiosko_wine_food' })
  return true
}

// ── Frases genéricas de fallback para wine-to-food ───────────────────────────

const WINE_FOOD_FALLBACK_ES = {
  'Embutido':     'El tanino pulido integra la sal y la grasa curada del embutido ibérico',
  'Queso':        'La acidez equilibra la cremosidad del queso y realza su complejidad aromática',
  'Foie·Paté':   'La untuosidad del foie se equilibra con la tensión ácida o las burbujas del vino',
  'Conserva mar': 'La salinidad marina amplifica la expresión mineral del vino',
  'Conserva':     'El cuerpo del vino aguanta la intensidad del plato sin dominar su sabor',
}
const WINE_FOOD_FALLBACK_EN = {
  'Embutido':     'The polished tannin integrates the salt and cured fat of the ibérico',
  'Queso':        'The acidity balances the creaminess of the cheese and enhances its aromatic complexity',
  'Foie·Paté':   'The richness of the foie is balanced by the wine\'s acidity or bubbles',
  'Conserva mar': 'The brine of the sea amplifies the mineral expression of the wine',
  'Conserva':     'The wine\'s body matches the dish\'s intensity without overwhelming its flavour',
}

function wineFoodFallbackRazon(catGourmet, lang) {
  const map = lang === 'en' ? WINE_FOOD_FALLBACK_EN : WINE_FOOD_FALLBACK_ES
  return map[catGourmet] || (lang === 'en' ? 'A balanced pairing by intensity and body' : 'Maridaje equilibrado por intensidad y cuerpo')
}

// ── Scorer de tags vino→gourmet ───────────────────────────────────────────────

function scoreGourmetForWine(vino, gourmetItem) {
  const vinoTags  = new Set((vino.maridaje_tags || []).map(t => String(t).toLowerCase()))
  const gTags     = (gourmetItem.maridaje_tags || []).map(t => String(t).toLowerCase())
  let score = 0
  for (const gt of gTags) {
    if (vinoTags.has(gt)) score++
  }
  // Bonus si cat_gourmet hace match con algún tag del vino
  const cat = String(gourmetItem.cat_gourmet || '').toLowerCase()
  const catKeywords = cat.split(/[·\s]+/)
  for (const kw of catKeywords) {
    if (kw.length > 2 && vinoTags.has(kw)) score += 2
  }
  return score
}

// ── Filtro maridable (excluye aceites, mermeladas) ────────────────────────────

function isMaridable(g) {
  const cat = (g.cat_gourmet || '').toLowerCase()
  if (cat === 'aceite·aove') return false
  if (cat === 'dulce')       return false
  return true
}

// ── Filtros WSET duros para wine-to-food ────────────────────────────────────

function wsetsFilterRoute(vino, items) {
  const tipo   = (vino.tipo || '').toLowerCase()
  const nombre = (vino.nombre || '').toLowerCase()
  const tags   = new Set((vino.maridaje_tags || []).map(t => String(t).toLowerCase()))
  const isFino       = tipo === 'generoso' || tags.has('fino')
  const isEspumoso   = tipo === 'espumoso'
  const isTinto      = tipo === 'tinto'
  const isSemidulce  = nombre.includes('semidulce') || tags.has('semidulce')
  const isVermut     = tipo === 'vermut'
  const isBlancoPremium = tipo === 'blanco' && (tags.has('premium') || tags.has('reserva') || tags.has('borgona') || tags.has('chardonnay'))
  const isBlancoLigero  = tipo === 'blanco' && !isBlancoPremium

  return items.filter(g => {
    if (!isMaridable(g)) return false
    const cat  = g.cat_gourmet || ''
    const gnom = (g.nombre || '').toLowerCase()

    if (isTinto      && cat === 'Conserva mar') return false
    if (isFino       && (cat === 'Queso' || cat === 'Foie·Paté')) return false
    if (isEspumoso   && gnom.includes('fabada')) return false
    if (isVermut     && cat === 'Queso') return false
    if (isBlancoLigero && (gnom.includes('fabada') || gnom.includes('cecina'))) return false
    if (isSemidulce  && cat === 'Embutido') {
      const esLigero = gnom.includes('fuet') || (gnom.includes('salchich') && gnom.includes('loncheado'))
      if (!esLigero) return false
    }
    return true
  })
}

// ── Selección de candidatos con diversidad de categorías ─────────────────────

function buildWineFoodCandidates(vino, gourmetFiltered) {
  const scored = gourmetFiltered.map(g => ({ ...g, _score: scoreGourmetForWine(vino, g) }))
  scored.sort((a, b) => b._score - a._score || a.nombre.localeCompare(b.nombre))

  const result  = []
  const catDone = {}
  const added   = new Set()

  // Garantiza al menos 1 de cada categoría disponible
  for (const g of scored) {
    const cat = g.cat_gourmet || 'unknown'
    if (!catDone[cat]) { catDone[cat] = true; result.push(g); added.add(g.id) }
  }
  // Rellena hasta 15
  for (const g of scored) {
    if (result.length >= 15) break
    if (!added.has(g.id)) { result.push(g); added.add(g.id) }
  }

  result.sort((a, b) => b._score - a._score)
  return result
}

// ── Handler wine-to-food ──────────────────────────────────────────────────────

async function handleWineToFood(request, slug, ip, body, lang) {
  const allowed = await checkWineFoodRateLimit(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiadas consultas. Inténtalo en unos minutos.' }, { status: 429 })
  }

  const vinoId = typeof body?.vinoId === 'string' ? body.vinoId.trim() : ''
  if (!vinoId) {
    return NextResponse.json({ error: 'vinoId requerido' }, { status: 400 })
  }

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, activo, subscription_status, billing_grace_until, plan, trial_used_seconds, is_demo, demo_daily_limit, wine_food_cache')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (!tienda || !isTiendaAccesible(tienda)) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  if (tienda.is_demo && tienda.demo_daily_limit) {
    const ok = await checkDemoTiendaLimit(tienda.id, tienda.demo_daily_limit)
    if (!ok) {
      return NextResponse.json({ error: 'Límite diario de consultas alcanzado para esta demo.' }, { status: 429 })
    }
  }

  // Cache de servidor: respuesta instantánea
  if (tienda.wine_food_cache?.[vinoId]) {
    const cached = tienda.wine_food_cache[vinoId]
    return NextResponse.json({ intro: '', recomendaciones: cached, fromCache: true })
  }

  const { data: vino } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, tipo, uva, region, maridaje_tags, notas_cata, descripcion')
    .eq('id', vinoId)
    .eq('tienda_id', tienda.id)
    .eq('activo', true)
    .single()

  if (!vino) {
    return NextResponse.json({ error: 'Vino no encontrado' }, { status: 404 })
  }

  const { data: gourmetRaw } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, bodega, cat_gourmet, precio_pvp, foto_url, notas_cata, descripcion, maridaje_tags')
    .eq('tienda_id', tienda.id)
    .eq('categoria', 'otro')
    .eq('activo', true)
    .gt('stock', 0)

  const gourmetList = gourmetRaw || []
  if (gourmetList.length < 1) {
    return NextResponse.json({ noResults: true, reason: 'sin_gourmet' })
  }

  // Filtros WSET + maridable + candidatos con diversidad
  const filtered   = wsetsFilterRoute(vino, gourmetList)
  const candidates = buildWineFoodCandidates(vino, filtered)
  const gourmetMap = Object.fromEntries(gourmetList.map(g => [g.id, g]))

  // Fallback con razones inteligentes
  function fallbackRecomendaciones() {
    const sorted = filtered
      .map(g => ({ ...g, _score: scoreGourmetForWine(vino, g) }))
      .sort((a, b) => b._score - a._score)

    const result  = []
    const catUsed = new Set()
    const added   = new Set()

    for (const g of sorted) {
      if (result.length >= 3) break
      const cat = g.cat_gourmet || 'unknown'
      if (!catUsed.has(cat)) {
        result.push({ id: g.id, nombre: g.nombre, bodega: g.bodega, cat_gourmet: g.cat_gourmet,
          precio_pvp: g.precio_pvp, foto_url: g.foto_url, razon: wineFoodFallbackRazon(g.cat_gourmet, lang) })
        catUsed.add(cat); added.add(g.id)
      }
    }
    for (const g of sorted) {
      if (result.length >= 3) break
      if (!added.has(g.id)) {
        result.push({ id: g.id, nombre: g.nombre, bodega: g.bodega, cat_gourmet: g.cat_gourmet,
          precio_pvp: g.precio_pvp, foto_url: g.foto_url, razon: wineFoodFallbackRazon(g.cat_gourmet, lang) })
        added.add(g.id)
      }
    }
    return result.slice(0, 3)
  }

  if (candidates.length < 3) {
    return NextResponse.json({ intro: '', recomendaciones: fallbackRecomendaciones() })
  }

  // Prompt mejorado
  const vinoInfo = [
    `Vino: ${vino.nombre}`,
    `Tipo: ${vino.tipo || 'desconocido'}`,
    vino.uva    ? `Uva: ${vino.uva}` : '',
    vino.region ? `Región: ${vino.region}` : '',
    vino.notas_cata ? `Notas: ${vino.notas_cata}` : '',
  ].filter(Boolean).join(' | ')

  const listaGourmet = candidates.map(g =>
    `- ID:${g.id} | ${g.nombre}${g.bodega ? ` (${g.bodega})` : ''} | ${g.cat_gourmet || ''} | ${g.precio_pvp ? `${g.precio_pvp}€` : ''}`
  ).join('\n')

  const langSuffix = lang === 'en' ? '\nRespond entirely in English.' : lang === 'fr' ? '\nRéponds entièrement en français.' : lang === 'de' ? '\nAntworte vollständig auf Deutsch.' : ''

  const systemPrompt = `Eres sumiller en Club del Gourmet. Elige 3 productos que acompañen este vino.

${vinoInfo}

Candidatos:
${listaGourmet}

Reglas: devuelve 3, máximo 1 por categoría (cat_gourmet), razón ≤140 chars citando una propiedad concreta del vino Y una del producto. Sin "complemento perfecto", "maridaje clásico", "ideal para". Sin inventar propiedades.

Responde ÚNICAMENTE con JSON:
{"recomendaciones": [{"id": "uuid", "razon": "frase"}]}
Exactamente 3.${langSuffix}`

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 600,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: `¿Qué gourmet acompaña al ${vino.nombre}?` }],
      signal:     AbortSignal.timeout(6000),
    })

    const texto = response.content[0]?.text || ''
    let parsed = null
    try {
      const match = texto.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
    } catch {}

    if (!parsed?.recomendaciones?.length) {
      return NextResponse.json({ intro: '', recomendaciones: fallbackRecomendaciones() })
    }

    const recomendaciones = parsed.recomendaciones
      .filter(r => r?.id && gourmetMap[r.id])
      .map(r => ({
        id:          r.id,
        nombre:      gourmetMap[r.id].nombre,
        bodega:      gourmetMap[r.id].bodega,
        cat_gourmet: gourmetMap[r.id].cat_gourmet,
        precio_pvp:  gourmetMap[r.id].precio_pvp,
        foto_url:    gourmetMap[r.id].foto_url,
        notas_cata:  gourmetMap[r.id].notas_cata,
        razon:       (r.razon || '').slice(0, 140),
      }))
      .slice(0, 3)

    if (!recomendaciones.length) {
      return NextResponse.json({ intro: '', recomendaciones: fallbackRecomendaciones() })
    }

    return NextResponse.json({ intro: '', recomendaciones })

  } catch (err) {
    if (tienda.wine_food_cache?.[vinoId]) {
      return NextResponse.json({ intro: '', recomendaciones: tienda.wine_food_cache[vinoId], fromCache: true })
    }
    console.error('wine-to-food error:', err?.message || err)
    return NextResponse.json({ intro: '', recomendaciones: fallbackRecomendaciones() })
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(request, { params }) {
  const { slug } = await params
  const ip = getIP(request)

  const globalOk = await checkGlobalRateLimit('__global__', 'kiosko_maridaje', {
    max: GLOBAL_DAILY_MAX, windowMs: GLOBAL_DAILY_MS,
  })
  if (!globalOk) {
    return NextResponse.json({ error: 'Servicio temporalmente no disponible. Inténtalo mañana.' }, { status: 503 })
  }

  const allowed = await checkRateLimit(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiadas consultas. Inténtalo en unos minutos.' }, { status: 429 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const mode        = String(body?.mode      || 'maridaje') // 'maridaje' | 'wizard' | 'wine-to-food'
  const lang        = ['en','fr','de'].includes(body?.lang) ? body.lang : 'es'

  // ── Bifurcación wine-to-food — antes de la validación de consulta ─────────
  if (mode === 'wine-to-food') {
    return handleWineToFood(request, slug, ip, body, lang)
  }

  const consulta    = String(body?.consulta  || '').trim()
  const regionCCAA  = typeof body?.regionCCAA === 'string' ? body.regionCCAA.trim() : null

  if (consulta.length < 2) {
    return NextResponse.json({ error: 'Indica para qué buscas el vino' }, { status: 400 })
  }

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, ciudad, activo, subscription_status, billing_grace_until, plan, trial_used_seconds, is_demo, demo_daily_limit')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (!tienda || !isTiendaAccesible(tienda)) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  if (tienda.is_demo && tienda.demo_daily_limit) {
    const ok = await checkDemoTiendaLimit(tienda.id, tienda.demo_daily_limit)
    if (!ok) {
      return NextResponse.json({ error: 'Límite diario de consultas alcanzado para esta demo.' }, { status: 429 })
    }
  }

  const { data: vinosBrutosRaw } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, bodega, tipo, region, uva, anada, pais, precio_pvp, foto_url, notas_cata, descripcion, ubicacion_estanteria, destacado, stock, categoria')
    .eq('tienda_id', tienda.id)
    .eq('activo', true)
    .gt('stock', 0)
    .order('destacado', { ascending: false })
    .limit(200)

  // Excluir productos gourmet (categoria='otro') y filtrar por CCAA si el wizard lo pide
  const vinosBrutos = (vinosBrutosRaw || [])
    .filter(v => v.categoria !== 'otro')
    .filter(v => !regionCCAA || REGION_TO_CCAA[v.region] === regionCCAA)

  if (!vinosBrutos?.length) {
    return NextResponse.json({ error: 'No hay vinos disponibles en este momento' }, { status: 404 })
  }

  const consultaLimpia = consulta.slice(0, 400)

  // ── Bifurcación: wizard de preferencias vs. maridaje gastronómico ─────────────
  let systemPrompt
  let listaVinos

  if (mode === 'wizard') {
    // Wizard: sin capas Goldstein/Chartier — solo preferencias de estilo/ocasión
    listaVinos = vinosBrutos.slice(0, 80).map(lineaVino).join('\n')
    systemPrompt = buildSystemWizard(tienda, listaVinos) + langInstruction(lang)
  } else {
    // ── Capa 1: Goldstein — veto duro de incompatibilidades estructurales ──────
    const goldstein = analizarConGoldstein(consultaLimpia, vinosBrutos)
    const bloqueados = new Set(
      goldstein.candidatos
        .filter(c => c.bloqueado)
        .map(c => String(c.vino?.id || c.vino?.nombre))
    )
    const vinosFiltrados1 = vinosBrutos.filter(v => !bloqueados.has(String(v.id)))

    // ── Capa 2: Motor estructural — puntuar y filtrar por compatibilidad ────────
    const necesidades = necesidadesKiosko(consultaLimpia)
    const hayNecesidades = Object.keys(necesidades).length > 0

    let vinosParaClaude = vinosFiltrados1
    if (hayNecesidades) {
      const puntuados = vinosFiltrados1.map(v => ({ vino: v, score: puntuarVino(v, necesidades) }))
      const compatibles = puntuados.filter(x => x.score >= -15).map(x => x.vino)
      if (compatibles.length >= 3) vinosParaClaude = compatibles
    }

    // ── Capa 3: Grafo de Chartier — inteligencia aromática ──────────────────────
    const { resumen: resumenGrafo, idsGrafo } = await intentarGrafo(consultaLimpia, vinosParaClaude)

    if (idsGrafo.size > 0) {
      vinosParaClaude = [
        ...vinosParaClaude.filter(v => idsGrafo.has(String(v.id))),
        ...vinosParaClaude.filter(v => !idsGrafo.has(String(v.id))),
      ]
    }

    const vinosFinales = vinosParaClaude.slice(0, 80)

    // ── Criterios estructurales para el prompt ──────────────────────────────────
    let contextoCriterios = ''
    try {
      const criterios = criteriosEstructurales(consultaLimpia)
      if (criterios.rasgos.length || criterios.buscar.length) {
        const lineas = []
        if (criterios.rasgos.length)  lineas.push(`Rasgos del plato: ${criterios.rasgos.join(', ')}`)
        if (criterios.buscar.length)  lineas.push(`Buscar en el vino: ${criterios.buscar.join(', ')}`)
        if (criterios.evitar.length)  lineas.push(`Evitar: ${criterios.evitar.join(', ')}`)
        if (criterios.lectura)        lineas.push(criterios.lectura)
        contextoCriterios = lineas.join('\n')
      }
    } catch {}

    if (resumenGrafo) {
      contextoCriterios = contextoCriterios
        ? `${contextoCriterios}\n\n${resumenGrafo}`
        : resumenGrafo
    }

    listaVinos = vinosFinales.map(lineaVino).join('\n')
    systemPrompt = buildSystem(tienda, listaVinos, contextoCriterios) + langInstruction(lang)
  }

  // ── Llamada a Claude ──────────────────────────────────────────────────────────
  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1200,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: `El cliente busca: "${consultaLimpia}"` }],
    })

    const texto = response.content[0]?.text || ''

    let parsed = null
    try {
      const match = texto.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
    } catch {}

    if (!parsed?.recomendaciones?.length) {
      return NextResponse.json({ noResults: true, reason: 'sin_stock_en_rango' })
    }

    const vinosMap = Object.fromEntries(vinosBrutos.map(v => [v.id, v]))
    const recomendaciones = parsed.recomendaciones
      .filter(r => r?.id && vinosMap[r.id])
      .map(r => ({ ...vinosMap[r.id], razon: r.razon }))
      .slice(0, 5)

    if (!recomendaciones.length) {
      return NextResponse.json({ noResults: true, reason: 'sin_stock_en_rango' })
    }

    // Log de búsqueda (fire-and-forget, nunca bloquea la respuesta)
    supabaseAdmin.from('kiosko_searches').insert({
      tienda_id: tienda.id,
      consulta:  consultaLimpia,
      mode,
      vinos_ids:     recomendaciones.map(v => String(v.id)),
      vinos_nombres: recomendaciones.map(v => v.nombre),
    }).then(() => {}).catch(() => {})

    return NextResponse.json({ intro: parsed.intro || '', recomendaciones })

  } catch (err) {
    console.error('kiosko/maridaje error:', err)
    return NextResponse.json({ error: 'Error al consultar el asistente' }, { status: 500 })
  }
}
