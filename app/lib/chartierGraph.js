/**
 * chartierGraph.js
 * Motor de traversal del grafo unificado de Chartier.
 * Fuente: chartier_unified_pairing_graph.json (1.417 nodos, 15.431 relaciones)
 * Unifica "La cocina aromática" + "Papilas y moléculas" de François Chartier.
 *
 * En producción (Vercel) el grafo se carga desde Supabase Storage.
 * En desarrollo se intenta primero desde el filesystem local.
 *
 * Performance: todos los lookups son O(1) mediante Maps pre-construidos.
 */

import fs from 'fs'
import path from 'path'

// ── URL del grafo en Supabase Storage ─────────────────────────────────────
// Configura CHARTIER_GRAPH_URL en las variables de entorno de Vercel
// apuntando al archivo público en Supabase Storage.
// Ejemplo: https://xxx.supabase.co/storage/v1/object/public/data/chartier_graph.json
const GRAPH_URL = process.env.CHARTIER_GRAPH_URL || ''

// ── Estado del módulo ──────────────────────────────────────────────────────
let _grafoPromise = null  // Promise única para evitar descargas paralelas
let _nodeById = null      // Map<id, node>
let _edgeMap = null       // Map<`${from}|${to}`, edge>

// ── Construye índices O(1) sobre el grafo crudo ────────────────────────────
function construirIndices(raw) {
  _nodeById = new Map()
  for (const node of raw.nodes) _nodeById.set(node.id, node)

  _edgeMap = new Map()
  for (const edge of raw.edges) {
    if (edge.relation !== 'armoniza_con_vino') continue
    const key = `${edge.from}|${edge.to}`
    if (!_edgeMap.has(key)) _edgeMap.set(key, edge)
  }

  return raw
}

// ── Carga del grafo: filesystem (dev) o Supabase Storage (prod) ────────────
function getGrafoPromise() {
  if (_grafoPromise) return _grafoPromise

  _grafoPromise = (async () => {
    // 1. Intentar filesystem local (desarrollo / si el archivo existe en Vercel)
    try {
      const ruta = path.join(process.cwd(), 'data', 'chartier_graph.json')
      if (fs.existsSync(ruta)) {
        const raw = JSON.parse(fs.readFileSync(ruta, 'utf8'))
        return construirIndices(raw)
      }
    } catch {}

    // 2. Cargar desde Supabase Storage (producción)
    if (!GRAPH_URL) {
      console.warn('[chartierGraph] CHARTIER_GRAPH_URL no definida — grafo desactivado')
      return null
    }

    try {
      const res = await fetch(GRAPH_URL, { next: { revalidate: 3600 } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.json()
      return construirIndices(raw)
    } catch (err) {
      console.error('[chartierGraph] Error cargando grafo desde URL:', err?.message)
      return null
    }
  })()

  // Si falla, resetear para que el próximo intento lo reintente
  _grafoPromise.catch(() => { _grafoPromise = null })

  return _grafoPromise
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
const GENERICOS = new Set(['queso', 'pescado', 'carne', 'marisco', 'pollo', 'cerdo', 'vino', 'blanco', 'tinto', 'verde'])
const EXPANSIONES = [
  { requiere: ['queso', 'cabra'], texto: 'queso de cabra', rol: 'ingrediente_principal' },
  { requiere: ['pescado', 'brasa'], texto: 'pescado a la parrilla', rol: 'tecnica' },
  { requiere: ['pescado', 'parrilla'], texto: 'pescado a la parrilla', rol: 'tecnica' },
  { requiere: ['pescado', 'ahumado'], texto: 'pescado ahumado', rol: 'ingrediente_principal' },
  { requiere: ['salsa', 'soja'], texto: 'salsa de soja', rol: 'base' },
  { requiere: ['queso', 'azul'], texto: 'queso azul', rol: 'ingrediente_principal' },
]

function tieneMaridajeDirecto(grafo, texto) {
  const nodeId = grafo?.indexes?.node_by_normalized_label?.[texto]
  return Boolean(nodeId && grafo?.indexes?.direct_wine_pairings_by_concept?.[nodeId]?.length)
}

function rolPorPalabras(words, posicion, primerIngredienteAsignado) {
  if (words.some(w => TECNICAS.has(w))) return 'tecnica'
  if (words.some(w => BASES.has(w))) return 'base'
  return primerIngredienteAsignado ? 'secundario' : 'ingrediente_principal'
}

function extraerTerminos(texto, grafo) {
  const t = norm(texto)
  const words = t.split(/\s+/).filter(Boolean)
  const terminos = []
  const ocupadas = new Set()
  let primerIngredienteAsignado = false

  // Primero resolvemos expresiones completas existentes en el grafo:
  // "queso de cabra" pesa mas que "queso" + "cabra" por separado.
  for (let len = Math.min(5, words.length); len >= 2; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const slice = words.slice(i, i + len)
      if (STOP.has(slice[0]) || STOP.has(slice[slice.length - 1])) continue
      if (!slice.some(w => !STOP.has(w) && w.length >= 3)) continue
      const frase = slice.join(' ')
      if (!tieneMaridajeDirecto(grafo, frase)) continue
      if (slice.some((w, idx) => !STOP.has(w) && ocupadas.has(i + idx))) continue

      const rol = rolPorPalabras(slice, i, primerIngredienteAsignado)
      if (rol === 'ingrediente_principal') primerIngredienteAsignado = true
      terminos.push({
        texto: frase,
        rol,
        posicion: i,
        exactPhrase: true,
        tokenCount: len,
      })
      slice.forEach((w, idx) => {
        if (!STOP.has(w)) ocupadas.add(i + idx)
      })
    }
  }

  for (const exp of EXPANSIONES) {
    if (!exp.requiere.every(w => words.includes(w))) continue
    if (!tieneMaridajeDirecto(grafo, exp.texto)) continue
    if (terminos.some(t => t.texto === exp.texto)) continue
    terminos.push({
      texto: exp.texto,
      rol: exp.rol,
      posicion: Math.min(...exp.requiere.map(w => words.indexOf(w)).filter(i => i >= 0)),
      exactPhrase: true,
      tokenCount: exp.texto.split(/\s+/).length,
      expansion: true,
    })
    if (exp.rol === 'ingrediente_principal') primerIngredienteAsignado = true
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (STOP.has(w) || w.length < 3) continue
    if (ocupadas.has(i)) continue
    if (GENERICOS.has(w) && terminos.some(t => t.exactPhrase)) continue

    const rol = TECNICAS.has(w) ? 'tecnica'
      : BASES.has(w) ? 'base'
      : primerIngredienteAsignado ? 'secundario'
      : 'ingrediente_principal'

    if (rol === 'ingrediente_principal') primerIngredienteAsignado = true
    terminos.push({
      texto: w,
      rol,
      posicion: i,
      exactPhrase: false,
      tokenCount: 1,
      generico: GENERICOS.has(w),
    })
  }

  return terminos.sort((a, b) => a.posicion - b.posicion || b.tokenCount - a.tokenCount)
}

// ── Busca conceptos del grafo que contengan el término ─────────────────────
function buscarConceptosPorTermino(termino, grafo) {
  const texto = typeof termino === 'string' ? termino : termino.texto
  const resultados = []
  const directPairings = grafo.indexes.direct_wine_pairings_by_concept
  const exactNodeId = grafo.indexes.node_by_normalized_label?.[texto]

  if (exactNodeId && directPairings[exactNodeId]?.length) {
    const node = _nodeById?.get(exactNodeId) || grafo.nodes.find(n => n.id === exactNodeId)
    resultados.push({
      nodeId: exactNodeId,
      label: node?.normalized_label || texto,
      matchType: 'exact',
      pairings: directPairings[exactNodeId],
    })
    if (termino.exactPhrase) return resultados
  }

  for (const node of grafo.nodes) {
    if (node.type !== 'concept') continue
    const label = node.normalized_label || ''
    const labelPartes = label.split(/\s+/)
    if (node.id === exactNodeId) continue
    if (!labelPartes.includes(texto) && label !== texto) continue

    const pairings = directPairings[node.id]
    if (pairings?.length) {
      resultados.push({ nodeId: node.id, label, matchType: label === texto ? 'exact' : 'compound', pairings })
    }
  }

  return resultados.slice(0, termino.generico ? 8 : 20)
}

// ── Score base por rol ─────────────────────────────────────────────────────
function scoreBase(rol, matchType, termino = {}) {
  const porRol = { ingrediente_principal: 40, tecnica: 25, base: 20, secundario: 15 }
  const porMatch = { exact: 1.0, compound: 0.88, partial: 0.7 }
  let score = (porRol[rol] || 10) * (porMatch[matchType] || 0.7)
  if (termino.exactPhrase) score *= 1 + Math.min(termino.tokenCount - 1, 3) * 0.35
  if (termino.expansion) score *= 0.9
  if (termino.generico) score *= 0.45
  return score
}

// ── Matching label del grafo → vino real ──────────────────────────────────
function matchScoreVinoLabel(labelGrafo, vino) {
  const base = norm(labelGrafo || '')
  const label = base.replace(/\s*\(.*?\)\s*/g, '').trim() || base

  const uva = norm(vino.uva || '')
  const nombre = norm(vino.nombre || '')
  const tipo = norm(vino.tipo || '')
  const region = norm(vino.region || '')
  const notas = norm(vino.notas_cata || '')
  const todo = `${nombre} ${uva} ${tipo} ${region} ${notas}`

  if (uva && (uva === label || uva.includes(label) || label.includes(uva))) return 1.0

  const ESTILOS_GENEROSOS = ['manzanilla', 'fino', 'amontillado', 'oloroso', 'palo cortado', 'pedro ximenez', 'px']
  const estiloGeneroso = ESTILOS_GENEROSOS.find(estilo => label.includes(estilo))
  if (estiloGeneroso) {
    const coincideEstilo = todo.includes(estiloGeneroso)
      || (estiloGeneroso === 'pedro ximenez' && todo.includes('px'))
      || (estiloGeneroso === 'px' && todo.includes('pedro ximenez'))
    if (coincideEstilo) return 1.0
    if (tipo === 'generoso' && label.includes('jerez')) return 0.42
    if (tipo === 'generoso') return 0.32
    return 0
  }

  const TIPOS = {
    'jerez': 'generoso',
    'cava': 'espumoso', 'champagne': 'espumoso', 'espumoso': 'espumoso',
    'rosado': 'rosado',
  }
  if (TIPOS[label] === tipo) return label === 'jerez' ? 0.72 : 0.9
  if (TIPOS[label] && todo.includes(label)) return 0.85
  if (nombre.includes(label)) return 0.85
  if (region.includes(label) && label.length > 4) return 0.65
  if (todo.includes(label) && label.length > 4) return 0.7
  return 0
}

// ── Detección de riesgos ──────────────────────────────────────────────────
function detectarRiesgos(terminosPlato, vino) {
  const riesgos = []
  const textos = terminosPlato.map(t => t.texto).join(' ')
  const textoVino = norm(`${vino.nombre} ${vino.tipo || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)

  const esMarino = ['pulpo', 'pescado', 'marisco', 'gamba', 'ostra', 'mejillon', 'almeja', 'lubina', 'dorada', 'merluza', 'bacalao', 'calamar', 'sepia', 'rape', 'rodaballo', 'salmon'].some(t => textos.includes(t))
  const esQueso = textos.includes('queso')
  const esBrasa = ['brasa', 'parrilla', 'plancha'].some(t => textos.includes(t))
  const esPicante = ['picante', 'curry', 'guindilla', 'cayena', 'pil'].some(t => textos.includes(t))
  const esTanico = vino.tipo === 'tinto' && ['reserva', 'gran reserva', 'cabernet', 'monastrell', 'ribera', 'priorat', 'toro', 'bierzo'].some(t => textoVino.includes(t))
  const esAlcohol = ['jerez', 'oloroso', 'tawny', 'oporto', 'porto'].some(t => textoVino.includes(t))

  if (esMarino && esTanico && !esBrasa) riesgos.push('tanino potente con elemento marino: solo válido si la brasa domina el plato')
  if (esPicante && esTanico) riesgos.push('tanino duro amplifica la sensación de picante')
  if (esQueso && esTanico) riesgos.push('tinto tanico con queso: solo valido si hay puente aromatico muy claro y tanino amable')
  if (esPicante && esAlcohol) riesgos.push('alcohol alto amplifica el picante')

  return riesgos
}

// ── Función principal (async) ──────────────────────────────────────────────
export async function analizarConGrafo(consulta, vinosDisponibles = []) {
  const grafo = await getGrafoPromise()
  if (!grafo || !_nodeById) return null

  const terminos = extraerTerminos(String(consulta || ''), grafo)
  if (!terminos.length) return null

  const directPairings = grafo.indexes.direct_wine_pairings_by_concept
  const familiesByConc = grafo.indexes.families_by_concept
  const winesByFamily = grafo.indexes.wines_by_family
  const labelIndex = grafo.indexes.node_by_normalized_label

  const wineEvidence = {}
  function addEvidence(wineLabel, score, evidencia) {
    if (!wineLabel) return
    if (!wineEvidence[wineLabel]) wineEvidence[wineLabel] = { score: 0, evidencias: [] }
    wineEvidence[wineLabel].score += score
    wineEvidence[wineLabel].evidencias.push({ ...evidencia, peso: score })
  }

  const conceptosCache = new Map()
  function getConceptos(termino) {
    if (conceptosCache.has(termino)) return conceptosCache.get(termino)
    const cs = buscarConceptosPorTermino(termino, grafo)
    conceptosCache.set(termino, cs)
    return cs
  }

  for (const termino of terminos) {
    const base = scoreBase(termino.rol, 'exact', termino)
    const conceptos = getConceptos(termino)

    for (const c of conceptos) {
      for (const wineNodeId of (c.pairings || [])) {
        const wineNode = _nodeById.get(wineNodeId)
        if (!wineNode) continue
        const edge = _edgeMap.get(`${c.nodeId}|${wineNodeId}`)
        const strength = edge?.strength || 0.85
        const origin = edge?.origin || 'chartier_directo'

        addEvidence(wineNode.normalized_label, base * strength, {
          concepto: c.label, origen: origin, strength,
          fuente: edge?.evidence?.[0]?.source_ref || 'La cocina aromática',
          relacion: 'armoniza_con_vino',
        })
      }

      const families = familiesByConc?.[c.nodeId] || []
      for (const familyId of families) {
        const familyWines = winesByFamily?.[familyId] || []
        const familyNode = _nodeById.get(familyId)
        const familyLabel = familyNode?.label || familyId
        for (const wineNodeId of familyWines) {
          const wineNode = _nodeById.get(wineNodeId)
          if (!wineNode) continue
          addEvidence(wineNode.normalized_label, base * 0.55, {
            concepto: c.label, familia: familyLabel, origen: 'chartier_inferido',
            strength: 0.55, fuente: `familia ${familyLabel}`,
            relacion: 'vino_candidato_por_familia',
          })
        }
      }
    }

    // Fallback por familia cuando no hay compound node
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
            concepto: termino.texto, familia: familyLabel, origen: 'chartier_inferido',
            strength: 0.5, fuente: `familia ${familyLabel} (lookup simple)`,
            relacion: 'vino_por_familia_simple',
          })
        }
      }
    }
  }

  const cartaScores = []
  for (const vino of vinosDisponibles) {
    let totalScore = 0
    const evidenciasVino = []

    for (const [wLabel, data] of Object.entries(wineEvidence)) {
      const m = matchScoreVinoLabel(wLabel, vino)
      if (m < 0.55) continue
      totalScore += data.score * m
      const mejorEv = [...data.evidencias].sort((a, b) => (b.peso || 0) - (a.peso || 0) || (b.strength || 0) - (a.strength || 0))[0]
      if (mejorEv) evidenciasVino.push({ wineLabel: wLabel, matchScore: m, ...mejorEv })
    }

    if (totalScore <= 0) continue

    const riesgos = detectarRiesgos(terminos, vino)
    if (riesgos.length) totalScore -= 18 * riesgos.length

    cartaScores.push({
      vino,
      scoreGrafo: Math.round(totalScore),
      evidencias: evidenciasVino.sort((a, b) => (b.peso || 0) - (a.peso || 0) || (b.strength || 0) - (a.strength || 0)).slice(0, 5),
      riesgos,
    })
  }

  const candidatos = cartaScores.sort((a, b) => b.scoreGrafo - a.scoreGrafo).slice(0, 8)
  if (!candidatos.length) return null

  const mejorScore = candidatos[0].scoreGrafo
  const confianza = mejorScore > 55 ? 'alta' : mejorScore > 25 ? 'media' : 'baja'
  const tieneDirecto = candidatos.some(c => c.evidencias.some(e => e.origen === 'chartier_directo'))
  const nodosResueltos = terminos.flatMap(t => getConceptos(t).map(c => ({ label: c.label, rol: t.rol })))

  return { terminosDetectados: terminos.map(t => t.texto), nodosResueltos, candidatos, confianza, tieneDirecto }
}

// ── Resumen para el prompt de Claude ──────────────────────────────────────
export function resumenGrafoParaPrompt(analisis) {
  if (!analisis) return ''

  const { nodosResueltos, candidatos, confianza, tieneDirecto } = analisis
  const lineas = ['━━ EVIDENCIA CHARTIER (grafo unificado — 15.431 relaciones) ━━']

  if (nodosResueltos.length) {
    lineas.push(`Conceptos del plato en el grafo: ${nodosResueltos.map(n => `"${n.label}" [${n.rol}]`).join(' · ')}`)
  }

  const porConcepto = {}
  for (const c of candidatos) {
    for (const e of c.evidencias) {
      if (!porConcepto[e.concepto]) porConcepto[e.concepto] = { directas: [], inferidas: [] }
      if (e.origen === 'chartier_directo') {
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
    if (directas.length) lineas.push(`• "${concepto}" → armoniza con: ${directas.map(e => `${e.label} (f:${e.strength?.toFixed(2)})`).join(', ')} [chartier_directo]`)
    if (inferidas.length) lineas.push(`  Vía familia: ${inferidas.join(', ')} [chartier_inferido]`)
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
    lineas.push(`${i + 1}. ${v.nombre} — ${v.tipo || ''}, ${v.uva || ''} — ${precio}${copa} — score ${c.scoreGrafo} [${ev?.origen || ''}]${riesgo}`)
  }

  lineas.push('')
  const confLabel = confianza === 'alta' ? 'ALTA' : confianza === 'media' ? 'MEDIA' : 'BAJA — razona con cuidado'
  lineas.push(`Confianza: ${confLabel}${tieneDirecto ? '' : ' — sin evidencia directa, usa familias aromáticas'}`)
  lineas.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return lineas.join('\n')
}
