/**
 * chartierGraph.js
 * Motor de traversal del grafo unificado de Chartier.
 * Fuente: chartier_unified_pairing_graph.json (1.417 nodos, 15.431 relaciones)
 * Unifica "La cocina aromática" + "Papilas y moléculas" de François Chartier.
 *
 * Arquitectura del grafo:
 * - source_entry → documenta_concepto → concept (nodo compuesto como "pulpo y calamar")
 * - concept → armoniza_con_vino → wine concept   [chartier_directo: las fichas del libro]
 * - wine concept → armoniza_con_alimento → food concept  [dirección inversa]
 * - concept → pertenece_a_familia → family → wines_by_family  [por familia aromática]
 *
 * Performance: todos los lookups son O(1) mediante Maps pre-construidos en la primera carga.
 */

import fs from 'fs'
import path from 'path'

// ── Estado del módulo ──────────────────────────────────────────────────────
let _grafo = null
let _nodeById = null      // Map<id, node>
let _edgeMap = null       // Map<`${from}|${to}`, edge[]>  — para armoniza_con_vino

// ── Carga lazy del grafo con índices O(1) ─────────────────────────────────
function getGrafo() {
  if (_grafo) return _grafo
  try {
    const ruta = path.join(process.cwd(), 'data', 'chartier_graph.json')
    const raw = JSON.parse(fs.readFileSync(ruta, 'utf8'))

    // Construir Map de nodos por id (O(1) lookup)
    _nodeById = new Map()
    for (const node of raw.nodes) {
      _nodeById.set(node.id, node)
    }

    // Construir Map de aristas por (from, to) para armoniza_con_vino
    _edgeMap = new Map()
    for (const edge of raw.edges) {
      if (edge.relation !== 'armoniza_con_vino') continue
      const key = `${edge.from}|${edge.to}`
      if (!_edgeMap.has(key)) _edgeMap.set(key, edge)
    }

    _grafo = raw
  } catch {
    _grafo = null
    _nodeById = null
    _edgeMap = null
  }
  return _grafo
}

// ── Normalización ──────────────────────────────────────────────────────────
function norm(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Extracción de términos del texto de un plato ───────────────────────────
const STOP = new Set(['con', 'del', 'de', 'la', 'el', 'y', 'a', 'en', 'por', 'para', 'al', 'las', 'los', 'un', 'una', 'sobre', 'sin', 'o', 'su', 'sus', 'que', 'muy', 'mas', 'e'])
const TECNICAS = new Set(['brasa', 'parrilla', 'plancha', 'horno', 'vapor', 'frito', 'frita', 'fritura', 'ahumado', 'ahumada', 'gratinado', 'estofado', 'guisado', 'curado', 'crudo', 'escabechado', 'confitado', 'asado'])
const BASES = new Set(['crema', 'salsa', 'caldo', 'emulsion', 'vinagreta', 'espuma', 'reduccion', 'veloute', 'pil'])

function extraerTerminos(texto) {
  const t = norm(texto)
  const words = t.split(/\s+/)
  const terminos = []
  let primerIngrediente = true

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (STOP.has(w) || w.length < 3) continue

    const rol = TECNICAS.has(w) ? 'tecnica'
      : BASES.has(w) ? 'base'
      : primerIngrediente ? 'ingrediente_principal'
      : 'secundario'

    if (rol === 'ingrediente_principal') primerIngrediente = false

    terminos.push({ texto: w, rol, posicion: i })
  }

  return terminos
}

// ── Busca conceptos del grafo que contengan el término (O(n) solo en nodes) ─
function buscarConceptosPorTermino(termino, grafo) {
  const resultados = []
  const directPairings = grafo.indexes.direct_wine_pairings_by_concept

  for (const node of grafo.nodes) {
    if (node.type !== 'concept') continue
    const label = node.normalized_label || ''
    const labelPartes = label.split(/\s+/)
    const tieneTermino = labelPartes.includes(termino) || label === termino
    if (!tieneTermino) continue

    const pairings = directPairings[node.id]
    if (pairings?.length) {
      resultados.push({ nodeId: node.id, label, matchType: label === termino ? 'exact' : 'compound', pairings })
    }
  }

  return resultados
}

// ── Obtiene wines vía armoniza_con_alimento inverso (O(k) donde k = edges entrantes) ─
function getWinesInversas(conceptId, grafo) {
  const edgeIds = grafo.indexes.edges_by_to?.[conceptId] || []
  const wines = []

  for (const eid of edgeIds) {
    // Buscar la edge por id — usamos el índice edges_by_from para no iterar todo
    // (edges_by_to guarda los ids de aristas, necesitamos buscar por id)
    // Fallback rápido: es un array pequeño comparado con el total
    const edge = grafo.edges[edgeIds.indexOf(eid)] // índice posicional directo
    // El índice edges_by_to almacena los IDs de aristas; buscar por id es costoso.
    // Alternativa: iterar solo las aristas entrantes (edgeIds es un subconjunto pequeño)
    // Pero como edges no tiene lookup por id, hacemos la búsqueda mínima posible:
    break // fallback — esta ruta inversa se desactiva para no penalizar rendimiento
  }

  // Estrategia alternativa usando edges_by_from en el grafo si está disponible
  // Por ahora retornamos array vacío para mantener rendimiento O(1)
  return wines
}

// ── Score base por rol en el plato ─────────────────────────────────────────
function scoreBase(rol, matchType) {
  const porRol = { ingrediente_principal: 40, tecnica: 25, base: 20, secundario: 15 }
  const porMatch = { exact: 1.0, compound: 0.88, partial: 0.7 }
  return (porRol[rol] || 10) * (porMatch[matchType] || 0.7)
}

// ── Matching de label del grafo a vino real de la carta ───────────────────
function matchScoreVinoLabel(labelGrafo, vino) {
  const base = norm(labelGrafo || '')
  const sinParen = base.replace(/\s*\(.*?\)\s*/g, '').trim()
  const label = sinParen || base

  const uva = norm(vino.uva || '')
  const nombre = norm(vino.nombre || '')
  const tipo = norm(vino.tipo || '')
  const region = norm(vino.region || '')
  const notas = norm(vino.notas_cata || '')
  const todo = `${nombre} ${uva} ${tipo} ${region} ${notas}`

  if (uva && (uva === label || uva.includes(label) || label.includes(uva))) return 1.0

  const TIPOS = {
    'fino': 'generoso', 'manzanilla': 'generoso', 'amontillado': 'generoso',
    'oloroso': 'generoso', 'palo cortado': 'generoso',
    'jerez': 'generoso', 'jerez fino': 'generoso', 'jerez amontillado': 'generoso',
    'cava': 'espumoso', 'champagne': 'espumoso', 'espumoso': 'espumoso',
    'rosado': 'rosado',
  }
  if (TIPOS[label] === tipo) return 0.9
  if (TIPOS[label] && todo.includes(label)) return 0.85
  if (nombre.includes(label)) return 0.85
  if (region.includes(label) && label.length > 4) return 0.65
  if (todo.includes(label) && label.length > 4) return 0.7
  return 0
}

// ── Detección de riesgos de maridaje ──────────────────────────────────────
function detectarRiesgos(terminosPlato, vino) {
  const riesgos = []
  const textos = terminosPlato.map(t => t.texto).join(' ')
  const textoVino = norm(`${vino.nombre} ${vino.tipo || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)

  const esMarino = ['pulpo', 'pescado', 'marisco', 'gamba', 'ostra', 'mejillon', 'almeja', 'lubina', 'dorada', 'merluza', 'bacalao', 'calamar', 'sepia', 'rape', 'rodaballo', 'salmon'].some(t => textos.includes(t))
  const esBrasa = ['brasa', 'parrilla', 'plancha'].some(t => textos.includes(t))
  const esPicante = ['picante', 'curry', 'guindilla', 'cayena', 'pil'].some(t => textos.includes(t))
  const esTanico = vino.tipo === 'tinto' && ['reserva', 'gran reserva', 'cabernet', 'monastrell', 'ribera', 'priorat', 'toro', 'bierzo'].some(t => textoVino.includes(t))
  const esAlcohol = ['jerez', 'oloroso', 'tawny', 'oporto', 'porto'].some(t => textoVino.includes(t))

  if (esMarino && esTanico && !esBrasa) riesgos.push('tanino potente con elemento marino: solo válido si la brasa domina el plato')
  if (esPicante && esTanico) riesgos.push('tanino duro amplifica la sensación de picante')
  if (esPicante && esAlcohol) riesgos.push('alcohol alto amplifica el picante')

  return riesgos
}

// ── Función principal ──────────────────────────────────────────────────────
export function analizarConGrafo(consulta, vinosDisponibles = []) {
  const grafo = getGrafo()
  if (!grafo || !_nodeById) return null

  const terminos = extraerTerminos(String(consulta || ''))
  if (!terminos.length) return null

  const directPairings = grafo.indexes.direct_wine_pairings_by_concept
  const familiesByConc = grafo.indexes.families_by_concept
  const winesByFamily = grafo.indexes.wines_by_family
  const labelIndex = grafo.indexes.node_by_normalized_label

  // ── Recolectar evidencia por label de vino del grafo ─────────────────
  const wineEvidence = {} // wineLabel → { score, evidencias[] }

  function addEvidence(wineLabel, score, evidencia) {
    if (!wineLabel) return
    if (!wineEvidence[wineLabel]) wineEvidence[wineLabel] = { score: 0, evidencias: [] }
    wineEvidence[wineLabel].score += score
    wineEvidence[wineLabel].evidencias.push(evidencia)
  }

  // Caché de conceptos por término para no repetir el O(n) scan
  const conceptosCache = new Map()
  function getConceptos(termino) {
    if (conceptosCache.has(termino)) return conceptosCache.get(termino)
    const cs = buscarConceptosPorTermino(termino, grafo)
    conceptosCache.set(termino, cs)
    return cs
  }

  for (const termino of terminos) {
    const base = scoreBase(termino.rol, 'exact')

    // ── 1. Maridajes directos desde concept nodes ─────────────────────
    const conceptos = getConceptos(termino.texto)
    for (const c of conceptos) {
      for (const wineNodeId of (c.pairings || [])) {
        // O(1) con el Map pre-construido
        const wineNode = _nodeById.get(wineNodeId)
        if (!wineNode) continue
        const wLabel = wineNode.normalized_label

        // O(1) con el Map de aristas
        const edge = _edgeMap.get(`${c.nodeId}|${wineNodeId}`)
        const strength = edge?.strength || 0.85
        const origin = edge?.origin || 'chartier_directo'
        const sourceRef = edge?.evidence?.[0]?.source_ref || 'La cocina aromática'

        addEvidence(wLabel, base * strength, {
          concepto: c.label,
          origen: origin,
          strength,
          fuente: sourceRef,
          relacion: 'armoniza_con_vino',
        })
      }

      // ── 2. Familias aromáticas del concepto ───────────────────────────
      const families = familiesByConc?.[c.nodeId] || []
      for (const familyId of families) {
        const familyWines = winesByFamily?.[familyId] || []
        const familyNode = _nodeById.get(familyId)
        const familyLabel = familyNode?.label || familyId

        for (const wineNodeId of familyWines) {
          const wineNode = _nodeById.get(wineNodeId)
          if (!wineNode) continue
          const wLabel = wineNode.normalized_label

          addEvidence(wLabel, base * 0.55, {
            concepto: c.label,
            familia: familyLabel,
            origen: 'chartier_inferido',
            strength: 0.55,
            fuente: `familia ${familyLabel}`,
            relacion: 'vino_candidato_por_familia',
          })
        }
      }
    }

    // ── 3. Familia desde label_index (concepto simple sin compound node) ─
    const conceptIdSimple = labelIndex?.[termino.texto]
    if (conceptIdSimple && !conceptos.length) {
      const families = familiesByConc?.[conceptIdSimple] || []
      for (const familyId of families) {
        const familyWines = winesByFamily?.[familyId] || []
        const familyNode = _nodeById.get(familyId)
        const familyLabel = familyNode?.label || familyId
        for (const wineNodeId of familyWines) {
          const wineNode = _nodeById.get(wineNodeId)
          if (!wineNode) continue
          addEvidence(wineNode.normalized_label, base * 0.5, {
            concepto: termino.texto,
            familia: familyLabel,
            origen: 'chartier_inferido',
            strength: 0.5,
            fuente: `familia ${familyLabel} (lookup simple)`,
            relacion: 'vino_por_familia_simple',
          })
        }
      }
    }
  }

  // ── Cruzar evidencia del grafo con vinos reales de la carta ──────────
  const cartaScores = []

  for (const vino of vinosDisponibles) {
    let totalScore = 0
    const evidenciasVino = []

    for (const [wLabel, data] of Object.entries(wineEvidence)) {
      const m = matchScoreVinoLabel(wLabel, vino)
      if (m < 0.55) continue

      totalScore += data.score * m
      const mejorEv = [...data.evidencias].sort((a, b) => (b.strength || 0) - (a.strength || 0))[0]
      if (mejorEv) evidenciasVino.push({ wineLabel: wLabel, matchScore: m, ...mejorEv })
    }

    if (totalScore <= 0) continue

    const riesgos = detectarRiesgos(terminos, vino)
    if (riesgos.length) totalScore -= 18 * riesgos.length

    cartaScores.push({
      vino,
      scoreGrafo: Math.round(totalScore),
      evidencias: evidenciasVino
        .sort((a, b) => (b.strength || 0) - (a.strength || 0))
        .slice(0, 5),
      riesgos,
    })
  }

  const candidatos = cartaScores.sort((a, b) => b.scoreGrafo - a.scoreGrafo).slice(0, 8)
  if (!candidatos.length) return null

  const mejorScore = candidatos[0].scoreGrafo
  const confianza = mejorScore > 55 ? 'alta' : mejorScore > 25 ? 'media' : 'baja'
  const tieneDirecto = candidatos.some(c => c.evidencias.some(e => e.origen === 'chartier_directo'))

  // Nodos resueltos usando la caché (sin repetir el O(n) scan)
  const nodosResueltos = terminos.flatMap(t => {
    const cs = getConceptos(t.texto)
    return cs.map(c => ({ label: c.label, rol: t.rol }))
  })

  return {
    terminosDetectados: terminos.map(t => t.texto),
    nodosResueltos,
    candidatos,
    confianza,
    tieneDirecto,
  }
}

// ── Genera el bloque de contexto para el prompt de Claude ─────────────────
export function resumenGrafoParaPrompt(analisis) {
  if (!analisis) return ''

  const { nodosResueltos, candidatos, confianza, tieneDirecto } = analisis

  const lineas = [
    '━━ EVIDENCIA CHARTIER (grafo unificado — 15.431 relaciones) ━━',
  ]

  if (nodosResueltos.length) {
    lineas.push(`Conceptos del plato en el grafo: ${nodosResueltos.map(n => `"${n.label}" [${n.rol}]`).join(' · ')}`)
  }

  const porConcepto = {}
  for (const c of candidatos) {
    for (const e of c.evidencias) {
      if (!porConcepto[e.concepto]) porConcepto[e.concepto] = { directas: [], inferidas: [] }
      if (e.origen === 'chartier_directo' || e.relacion === 'armoniza_con_alimento_inverso') {
        porConcepto[e.concepto].directas.push({ label: e.wineLabel, strength: e.strength })
      } else {
        porConcepto[e.concepto].inferidas.push(e.familia || e.wineLabel)
      }
    }
  }

  lineas.push('')
  for (const [concepto, evs] of Object.entries(porConcepto).slice(0, 5)) {
    const directas = [...new Map(evs.directas.map(e => [e.label, e])).values()].slice(0, 5)
    const inferidas = [...new Set(evs.inferidas)].slice(0, 3)
    if (directas.length) {
      lineas.push(`• "${concepto}" → armoniza con: ${directas.map(e => `${e.label} (f:${e.strength?.toFixed(2)})`).join(', ')} [chartier_directo]`)
    }
    if (inferidas.length) {
      lineas.push(`  Vía familia: ${inferidas.join(', ')} [chartier_inferido]`)
    }
  }

  lineas.push('')
  lineas.push('CANDIDATOS DE LA CARTA POR EVIDENCIA CHARTIER:')
  for (let i = 0; i < Math.min(candidatos.length, 7); i++) {
    const c = candidatos[i]
    const v = c.vino
    const ev = c.evidencias[0]
    const precio = v.precio_botella ? `${v.precio_botella}€/bot` : ''
    const copa = v.precio_copa ? ` · ${v.precio_copa}€/copa` : ''
    const riesgo = c.riesgos.length ? ` ⚠ ${c.riesgos[0]}` : ''
    const origin = ev ? `[${ev.origen}]` : ''
    lineas.push(`${i + 1}. ${v.nombre} — ${v.tipo || ''}, ${v.uva || ''} — ${precio}${copa} — score ${c.scoreGrafo} ${origin}${riesgo}`)
  }

  lineas.push('')
  const confLabel = confianza === 'alta' ? 'ALTA' : confianza === 'media' ? 'MEDIA' : 'BAJA — razona con cuidado'
  const directoLabel = tieneDirecto ? '' : ' — sin evidencia directa, usa familias aromáticas'
  lineas.push(`Confianza: ${confLabel}${directoLabel}`)
  lineas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return lineas.join('\n')
}
