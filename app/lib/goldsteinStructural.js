/**
 * goldsteinStructural.js
 * Capa estructural de sumiller basada en Perfect Pairings, de Evan Goldstein.
 *
 * No sustituye ni se atribuye a Chartier. Chartier aporta afinidad aromatica;
 * Goldstein valida equilibrio, riesgos y excepciones antes de ordenar vinos.
 */

import fs from 'fs'
import path from 'path'

let _kb = null

const FOOD_TRAIT_TERMS = {
  fatty: ['grasa', 'graso', 'grasa infiltrada', 'panceta', 'bacon', 'mantequilla', 'nata', 'crema'],
  rich: ['rico', 'intenso', 'crema', 'nata', 'mantequilla', 'untuoso', 'meloso'],
  oily: ['aceitoso', 'aceite', 'fritura', 'frito', 'frita'],
  salty: ['salado', 'salada', 'sal', 'soja', 'jamon', 'anchoa', 'bacalao', 'aceituna'],
  mild_spicy: ['picante suave', 'ligeramente picante', 'especiado', 'curry suave'],
  spicy: ['picante', 'curry', 'harissa', 'guindilla', 'cayena', 'chile', 'brava'],
  hot_spicy: ['muy picante', 'picante fuerte', 'extra picante', 'cayena', 'guindilla'],
  tart: ['acido', 'acida', 'vinagreta', 'vinagre', 'limon', 'lima', 'citrico', 'citrica', 'tomate'],
  vinaigrette: ['vinagreta'],
  citrus_sauce: ['salsa citrica', 'limon', 'lima'],
  tomato: ['tomate'],
  capers: ['alcaparra', 'alcaparras'],
  slightly_sweet: ['ligeramente dulce', 'agridulce', 'chutney', 'compota', 'miel', 'pasas'],
  fruit_sauce: ['salsa de fruta', 'chutney', 'compota', 'mango', 'pasas', 'albaricoque'],
  chutney: ['chutney'],
  dried_fruit: ['pasas', 'orejones', 'fruta seca', 'higo seco', 'datil'],
  blue_cheese: ['queso azul', 'roquefort', 'stilton', 'gorgonzola'],
  dessert: ['postre', 'tarta', 'helado', 'brownie', 'chocolate', 'torrija', 'bizcocho'],
  sweet: ['dulce', 'caramelo', 'chocolate', 'miel', 'azucar'],
  protein_rich: ['carne', 'ternera', 'vaca', 'buey', 'cordero', 'cerdo', 'costilla', 'chuleton', 'entrecot'],
  red_meat: ['ternera', 'vaca', 'buey', 'cordero', 'chuleton', 'entrecot', 'solomillo'],
  bitter: ['amargo', 'amarga', 'endivia', 'rucula', 'radicchio'],
  low_protein: ['vegetariano', 'vegetariana', 'verduras', 'ensalada'],
  delicate: ['delicado', 'delicada', 'suave', 'vapor', 'pochado', 'escalfado', 'hervido'],
  delicate_vegetarian: ['ensalada', 'verduras al vapor', 'vegetales al vapor'],
  fish: ['pescado', 'lubina', 'dorada', 'merluza', 'bacalao', 'salmon', 'atun', 'rape', 'rodaballo'],
  fish_oil: ['salmon', 'atun', 'caballa', 'sardina', 'anchoa'],
  oily_fish: ['salmon', 'atun', 'caballa', 'sardina', 'anchoa'],
  aged_hard_cheese: ['queso curado', 'parmesano', 'manchego curado', 'cheddar curado', 'gouda curado'],
  pungent_cheese: ['queso pungente', 'queso fuerte', 'queso azul', 'roquefort', 'stilton'],
  goat_cheese: ['queso de cabra'],
  grilled: ['parrilla', 'brasa', 'brasas'],
  charred: ['carbonizado', 'carbonizada', 'tostado intenso'],
  blackened: ['blackened', 'ennegrecido', 'ennegrecida'],
  smoked: ['ahumado', 'ahumada'],
  toasted: ['tostado', 'tostada'],
  caramelized: ['caramelizado', 'caramelizada'],
  cream_sauce: ['salsa de crema', 'salsa cremosa', 'nata', 'crema'],
  butter_sauce: ['mantequilla', 'beurre blanc', 'beurre rouge'],
  rich_texture: ['cremoso', 'cremosa', 'untuoso', 'untuosa', 'meloso', 'melosa'],
  dominant_side_dish: ['guarnicion intensa', 'acompanamiento intenso'],
  served_very_hot: ['muy caliente', 'recien salido del horno'],
}

const SAUCE_SIGNALS = [
  'salsa', 'vinagreta', 'chutney', 'harissa', 'soja', 'crema', 'nata',
  'mantequilla', 'aioli', 'alioli', 'mayonesa', 'reduccion', 'glaseado',
]

function norm(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function incluyeAlguno(texto, terminos = []) {
  const limpio = norm(texto)
  const delimitado = ` ${limpio} `
  return terminos.some(termino => {
    const terminoLimpio = norm(termino)
    return terminoLimpio && delimitado.includes(` ${terminoLimpio} `)
  })
}

function perfilesCoincidentes(texto, perfiles = []) {
  return perfiles.filter(perfil => incluyeAlguno(texto, perfil.aliases || []))
}

function getKb() {
  if (_kb) return _kb
  try {
    const ruta = path.join(process.cwd(), 'data', 'goldstein_structural_pairing_kb.json')
    _kb = JSON.parse(fs.readFileSync(ruta, 'utf8'))
  } catch (err) {
    console.error('[goldstein] KB no cargado, usando reglas vacías:', err?.message)
    _kb = { reglas: [], ingredientes: {}, tecnicas: {} }
  }
  return _kb
}

function textoVino(vino = {}) {
  return norm([
    vino.nombre,
    vino.bodega,
    vino.tipo,
    vino.region,
    vino.uva,
    vino.notas_cata,
    vino.descripcion,
    vino.crianza,
  ].filter(Boolean).join(' '))
}

function rasgosPlato(consulta, kb) {
  const texto = norm(consulta)
  const rasgos = new Set()

  for (const [rasgo, terminos] of Object.entries(FOOD_TRAIT_TERMS)) {
    if (incluyeAlguno(texto, terminos)) rasgos.add(rasgo)
  }

  const salsas = perfilesCoincidentes(texto, kb.sauce_profiles)
  const tecnicas = perfilesCoincidentes(texto, kb.technique_profiles)
  const puentes = perfilesCoincidentes(texto, kb.bridge_ingredients)

  if (salsas.length && incluyeAlguno(texto, SAUCE_SIGNALS)) rasgos.add('dominant_sauce')
  for (const salsa of salsas) {
    for (const rasgo of salsa.dominant_traits || []) rasgos.add(rasgo)
  }
  for (const tecnica of tecnicas) {
    for (const rasgo of tecnica.adds_food_traits || []) rasgos.add(rasgo)
  }

  return { rasgos, salsas, tecnicas, puentes }
}

function rasgosVino(vino, kb) {
  const texto = textoVino(vino)
  const rasgos = new Set()
  const perfiles = perfilesCoincidentes(texto, kb.wine_style_profiles)

  for (const perfil of perfiles) {
    for (const rasgo of perfil.traits || []) rasgos.add(rasgo)
  }

  if (vino.tipo === 'espumoso') {
    rasgos.add('sparkling')
    rasgos.add('high_acidity')
    rasgos.add('low_to_moderate_alcohol')
  }
  if (vino.tipo === 'dulce') rasgos.add('sweet')
  if (vino.tipo === 'blanco' || vino.tipo === 'rosado') rasgos.add('low_tannin')
  if (vino.tipo === 'tinto') rasgos.add('red')
  if (vino.tipo === 'generoso') rasgos.add('high_alcohol')

  if (incluyeAlguno(texto, ['semidulce', 'semi dulce', 'off dry', 'off-dry'])) rasgos.add('off_dry')
  if (incluyeAlguno(texto, ['dulce', 'sauternes', 'late harvest', 'vendimia tardia', 'tokaji', 'oporto', 'porto', 'pedro ximenez', ' px '])) rasgos.add('sweet')
  if (incluyeAlguno(texto, ['brut', 'seco', 'fino', 'manzanilla'])) rasgos.add('dry')

  if (incluyeAlguno(texto, ['alta acidez', 'tenso', 'tension', 'vibrante', 'citrico', 'mineral', 'salino'])) rasgos.add('high_acidity')
  if (incluyeAlguno(texto, ['baja acidez', 'plano', 'plana'])) rasgos.add('low_acidity')

  if (incluyeAlguno(texto, ['cabernet', 'monastrell', 'priorat', 'toro', 'ribera', 'tanino potente', 'tanino firme', 'astringente'])) rasgos.add('high_tannin')
  if (incluyeAlguno(texto, ['pinot noir', 'gamay', 'tanino suave', 'tanino amable', 'sedoso'])) rasgos.add('low_tannin')

  if (incluyeAlguno(texto, ['barrica', 'roble', 'crianza', 'reserva'])) rasgos.add('medium_oak')
  if (incluyeAlguno(texto, ['mucha barrica', 'roble dominante', 'madera dominante', 'muy marcado por madera', 'gran reserva'])) rasgos.add('high_oak')
  if (incluyeAlguno(texto, ['sin barrica', 'sin madera', 'inox', 'acero inoxidable'])) rasgos.add('unoaked')

  if (incluyeAlguno(texto, ['potente', 'corporeo', 'corpulento', 'voluminoso'])) rasgos.add('full_body')
  if (incluyeAlguno(texto, ['ligero', 'ligera', 'delicado', 'delicada'])) rasgos.add('light_body')

  const alcohol = Number(String(vino.alcohol || vino.graduacion || '').replace(',', '.')) || 0
  if (alcohol >= 14.5 || incluyeAlguno(texto, ['alto alcohol', 'alta graduacion', 'alcohol elevado'])) rasgos.add('high_alcohol')
  if (alcohol && alcohol <= 13) rasgos.add('low_to_moderate_alcohol')

  return { rasgos, perfiles }
}

function interseccion(set, lista = []) {
  return lista.filter(valor => set.has(valor))
}

function pesoPlato(rasgos) {
  let peso = 2
  if (rasgos.has('rich') || rasgos.has('fatty') || rasgos.has('protein_rich')) peso += 1
  if (rasgos.has('red_meat') || rasgos.has('high_impact')) peso += 1
  if (rasgos.has('delicate')) peso -= 0.5
  return Math.max(1, Math.min(5, peso))
}

function pesoVino(rasgos) {
  let peso = 2.5
  if (rasgos.has('light_body')) peso = 1.5
  if (rasgos.has('medium_body')) peso = 3
  if (rasgos.has('medium_to_full_body')) peso = 3.5
  if (rasgos.has('full_body')) peso = 4
  if (rasgos.has('high_alcohol')) peso += 0.5
  return Math.max(1, Math.min(5, peso))
}

function reglaActivada(regla, rasgosPlatoSet, rasgosVinoSet) {
  const comida = regla.when?.food_traits || []
  const vino = regla.when?.wine_traits || []
  if (comida.length && !interseccion(rasgosPlatoSet, comida).length) return false
  if (vino.length && !interseccion(rasgosVinoSet, vino).length) return false
  return Boolean(comida.length || vino.length)
}

function detalleRegla(regla, delta, tipo) {
  return {
    id: regla.id,
    dimension: regla.dimension,
    tipo,
    delta,
    summary: regla.summary,
    sourceRefs: regla.source_refs,
  }
}

function aplicarReglas(kb, plato, candidato) {
  const fortalezas = []
  const riesgos = []
  const reglas = []
  let score = 0
  let bloqueado = false

  for (const regla of kb.general_rules) {
    if (regla.id === 'goldstein_weight_002') continue
    if (!reglaActivada(regla, plato.rasgos, candidato.rasgos)) continue

    const action = regla.action || {}
    const preferidos = interseccion(candidato.rasgos, action.prefer_wine_traits)
    const evitados = interseccion(candidato.rasgos, action.avoid_wine_traits)
    const magnitud = Math.abs(Number(action.score_delta) || 0)

    if (regla.id === 'goldstein_sweet_004') {
      if (!plato.rasgos.has('dessert')) continue
      const dulzorSuficiente = candidato.rasgos.has('sweet')
      if (dulzorSuficiente) {
        fortalezas.push('dulzor suficiente para el postre')
        reglas.push(detalleRegla(regla, 10, 'fortaleza'))
        score += 10
      } else {
        riesgos.push(regla.summary)
        reglas.push(detalleRegla(regla, -100, 'bloqueo'))
        score -= 100
        bloqueado = true
      }
      continue
    }

    if (action.effect === 'block' && evitados.length) {
      const delta = -Math.max(100, magnitud)
      score += delta
      riesgos.push(regla.summary)
      reglas.push(detalleRegla(regla, delta, 'bloqueo'))
      bloqueado = true
      continue
    }

    if (action.effect === 'penalty' && (!action.avoid_wine_traits.length || evitados.length)) {
      score -= magnitud
      riesgos.push(regla.summary)
      reglas.push(detalleRegla(regla, -magnitud, 'riesgo'))
      continue
    }

    if (action.effect === 'require') {
      if (evitados.length) {
        score -= magnitud
        riesgos.push(regla.summary)
        reglas.push(detalleRegla(regla, -magnitud, 'riesgo'))
      } else if (preferidos.length) {
        score += magnitud
        fortalezas.push(regla.summary)
        reglas.push(detalleRegla(regla, magnitud, 'fortaleza'))
      }
      continue
    }

    if (action.effect === 'boost' && preferidos.length) {
      score += magnitud
      fortalezas.push(regla.summary)
      reglas.push(detalleRegla(regla, magnitud, 'fortaleza'))
      continue
    }

    if (action.effect === 'reorder' || action.effect === 'annotate') {
      reglas.push(detalleRegla(regla, 0, 'contexto'))
    }
  }

  const diferenciaPeso = Math.abs(pesoPlato(plato.rasgos) - pesoVino(candidato.rasgos))
  if (diferenciaPeso > 1.5) {
    const delta = -Math.round((diferenciaPeso - 1) * 12)
    score += delta
    riesgos.push('El peso del vino y el plato quedan descompensados.')
    reglas.push({
      id: 'goldstein_weight_002',
      dimension: 'alcohol_weight',
      tipo: 'riesgo',
      delta,
      summary: 'La intensidad y el peso del vino deben guardar proporcion con el plato.',
    })
  }

  return {
    scoreGoldstein: Math.round(score),
    bloqueado,
    fortalezas: [...new Set(fortalezas)].slice(0, 5),
    riesgos: [...new Set(riesgos)].slice(0, 5),
    reglas: reglas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 8),
  }
}

export function analizarConGoldstein(consulta, vinosDisponibles = []) {
  const kb = getKb()
  const plato = rasgosPlato(String(consulta || ''), kb)
  const candidatos = vinosDisponibles.map(vino => {
    const candidato = rasgosVino(vino, kb)
    const evaluacion = aplicarReglas(kb, plato, candidato)
    return {
      vino,
      ...evaluacion,
      rasgosVino: [...candidato.rasgos].sort(),
      perfilesVino: candidato.perfiles.map(perfil => perfil.id),
    }
  })

  return {
    origen: 'goldstein_structural',
    rasgosPlato: [...plato.rasgos].sort(),
    salsas: plato.salsas.map(item => item.id),
    tecnicas: plato.tecnicas.map(item => item.id),
    puentes: plato.puentes.map(item => item.id),
    candidatos,
  }
}

export function resumenGoldsteinParaPrompt(analisis) {
  if (!analisis) return ''
  const lineas = ['━━ VALIDACION ESTRUCTURAL GOLDSTEIN ━━']
  if (analisis.rasgosPlato.length) lineas.push(`Rasgos del plato: ${analisis.rasgosPlato.join(', ')}`)
  if (analisis.salsas.length) lineas.push(`Salsas detectadas: ${analisis.salsas.join(', ')}`)
  if (analisis.tecnicas.length) lineas.push(`Tecnicas detectadas: ${analisis.tecnicas.join(', ')}`)
  if (analisis.puentes.length) lineas.push(`Ingredientes puente: ${analisis.puentes.join(', ')}`)
  lineas.push('No atribuir estas reglas a Chartier: son validaciones estructurales de Evan Goldstein.')
  return lineas.join('\n')
}
