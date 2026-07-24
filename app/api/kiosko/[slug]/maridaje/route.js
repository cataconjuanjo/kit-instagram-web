import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'
import { analizarConGoldstein } from '../../../../lib/goldsteinStructural'
import { estimarPerfil, criteriosEstructurales } from '../../../../lib/maridajeEngine'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

function getIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

// ── Normalización ─────────────────────────────────────────────────────────────

function norm(texto = '') {
  return String(texto).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
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

// ── System prompt con metodología Chartier ────────────────────────────────────

function buildSystem(tienda, listaVinos, contextoCriterios) {
  return `Eres el sumiller experto de ${tienda.nombre}, una tienda especializada en vinos${tienda.ciudad ? ` en ${tienda.ciudad}` : ''}.
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

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(request, { params }) {
  const { slug } = await params
  const ip = getIP(request)

  const allowed = await checkRateLimit(ip)
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiadas consultas. Inténtalo en unos minutos.' }, { status: 429 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  const consulta = String(body?.consulta || '').trim()
  if (consulta.length < 2) {
    return NextResponse.json({ error: 'Indica para qué buscas el vino' }, { status: 400 })
  }

  const { data: tienda } = await supabaseAdmin
    .from('tiendas')
    .select('id, nombre, ciudad')
    .eq('slug', slug)
    .eq('activo', true)
    .single()

  if (!tienda) {
    return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
  }

  const { data: vinosBrutos } = await supabaseAdmin
    .from('vinos_tienda')
    .select('id, nombre, bodega, tipo, region, uva, anada, pais, precio_pvp, foto_url, notas_cata, descripcion, ubicacion_estanteria, destacado, stock')
    .eq('tienda_id', tienda.id)
    .eq('activo', true)
    .gt('stock', 0)
    .order('destacado', { ascending: false })
    .limit(200)

  if (!vinosBrutos?.length) {
    return NextResponse.json({ error: 'No hay vinos disponibles en este momento' }, { status: 404 })
  }

  // ── Capa 1: Goldstein — veto duro de incompatibilidades estructurales ────────
  const consultaLimpia = consulta.slice(0, 400)
  const goldstein = analizarConGoldstein(consultaLimpia, vinosBrutos)
  const bloqueados = new Set(
    goldstein.candidatos
      .filter(c => c.bloqueado)
      .map(c => String(c.vino?.id || c.vino?.nombre))
  )
  const vinosFiltrados1 = vinosBrutos.filter(v => !bloqueados.has(String(v.id)))

  // ── Capa 2: Motor estructural — puntuar y filtrar por compatibilidad ─────────
  const necesidades = necesidadesKiosko(consultaLimpia)
  const hayNecesidades = Object.keys(necesidades).length > 0

  let vinosParaClaude = vinosFiltrados1
  if (hayNecesidades) {
    const puntuados = vinosFiltrados1.map(v => ({ vino: v, score: puntuarVino(v, necesidades) }))
    const compatibles = puntuados.filter(x => x.score >= -15).map(x => x.vino)
    // Si quedan al menos 3, usamos solo los compatibles; si no, usamos todos (carta pequeña)
    if (compatibles.length >= 3) vinosParaClaude = compatibles
  }

  // ── Capa 3: Grafo de Chartier — inteligencia aromática ───────────────────────
  const { resumen: resumenGrafo, idsGrafo } = await intentarGrafo(consultaLimpia, vinosParaClaude)

  // Priorizar vinos que el grafo recomienda (moverlos al frente) sin excluir el resto
  if (idsGrafo.size > 0) {
    vinosParaClaude = [
      ...vinosParaClaude.filter(v => idsGrafo.has(String(v.id))),
      ...vinosParaClaude.filter(v => !idsGrafo.has(String(v.id))),
    ]
  }

  // Limitar a 80 para no saturar el contexto
  const vinosFinales = vinosParaClaude.slice(0, 80)

  // ── Criterios estructurales para el prompt ────────────────────────────────────
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

  // ── Llamada a Claude ──────────────────────────────────────────────────────────
  const listaVinos = vinosFinales.map(lineaVino).join('\n')

  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1200,
      system:     buildSystem(tienda, listaVinos, contextoCriterios),
      messages:   [{ role: 'user', content: `El cliente busca: "${consultaLimpia}"` }],
    })

    const texto = response.content[0]?.text || ''

    let parsed = null
    try {
      const match = texto.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
    } catch {}

    if (!parsed?.recomendaciones?.length) {
      return NextResponse.json({ error: 'No se pudo generar una recomendación' }, { status: 500 })
    }

    const vinosMap = Object.fromEntries(vinosBrutos.map(v => [v.id, v]))
    const recomendaciones = parsed.recomendaciones
      .filter(r => r?.id && vinosMap[r.id])
      .map(r => ({ ...vinosMap[r.id], razon: r.razon }))
      .slice(0, 5)

    if (!recomendaciones.length) {
      return NextResponse.json({ error: 'No se encontraron vinos coincidentes' }, { status: 500 })
    }

    return NextResponse.json({ intro: parsed.intro || '', recomendaciones })

  } catch (err) {
    console.error('kiosko/maridaje error:', err)
    return NextResponse.json({ error: 'Error al consultar el sumiller' }, { status: 500 })
  }
}
