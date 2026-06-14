import flavorKnowledge from '../../data/flavor_knowledge.json'

const DIMENSIONES = [
  'intensidad',
  'grasa',
  'dulzor',
  'acidez',
  'salinidad',
  'amargor',
  'umami',
  'picante',
  'ahumado',
  'tostado',
  'terroso',
  'herbal',
  'floral',
  'yodado_marino',
]

const TECNICAS = [
  'crudo',
  'plancha',
  'brasa',
  'guiso',
  'horno',
  'frito',
  'escabeche',
  'fermentado',
  'confitado',
  'curado',
  'ahumado',
  'tostado',
]

function normalizar(texto = '') {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function incluyeTermino(texto, termino) {
  const limpio = ` ${normalizar(texto)} `
  const t = normalizar(termino)
  return t.length >= 3 && limpio.includes(` ${t} `)
}

function aliasIngrediente(item) {
  const notas = item.notas_para_app || {}
  return [
    item.ingrediente,
    item.nombre_visible,
    String(item.ingrediente || '').replace(/_/g, ' '),
    ...(notas.sinonimos || []),
    ...(notas.palabras_clave || []),
  ].filter(Boolean)
}

function detectarTecnicas(texto, ingredientes) {
  const detectadas = new Set()
  for (const tecnica of TECNICAS) {
    if (incluyeTermino(texto, tecnica)) detectadas.add(tecnica)
  }
  if (incluyeTermino(texto, 'a feira') || incluyeTermino(texto, 'a la gallega')) detectadas.add('guiso')
  if (incluyeTermino(texto, 'tataki') || incluyeTermino(texto, 'tartar')) detectadas.add('crudo')
  if (incluyeTermino(texto, 'parrilla') || incluyeTermino(texto, 'brasas')) detectadas.add('brasa')

  for (const item of ingredientes) {
    for (const tecnica of Object.keys(item.modificadores_por_tecnica || {})) {
      if (incluyeTermino(texto, tecnica)) detectadas.add(tecnica)
    }
  }
  return [...detectadas]
}

function mezclarPerfil(ingredientes, tecnicas) {
  const perfil = Object.fromEntries(DIMENSIONES.map(dimension => [dimension, 0]))
  for (const item of ingredientes) {
    const base = item.perfil_sensorial || {}
    for (const dimension of DIMENSIONES) {
      perfil[dimension] = Math.max(perfil[dimension], Number(base[dimension]) || 0)
    }
    for (const tecnica of tecnicas) {
      const mod = item.modificadores_por_tecnica?.[tecnica]
      if (!mod) continue
      for (const [dimension, valor] of Object.entries(mod)) {
        if (!DIMENSIONES.includes(dimension) || typeof valor !== 'number') continue
        perfil[dimension] = Math.max(0, Math.min(5, Math.max(perfil[dimension], valor)))
      }
    }
  }
  return perfil
}

function afinidadesPrincipales(ingredientes) {
  const vistas = new Set()
  return ingredientes
    .flatMap(item => [
      ...(item.afinidades_fuertes || []).map(afinidad => ({ ...afinidad, fuerza: 'fuerte' })),
      ...(item.afinidades_medias || []).map(afinidad => ({ ...afinidad, fuerza: 'media' })),
    ])
    .filter(afinidad => {
      const key = afinidad.ingrediente
      if (!key || vistas.has(key)) return false
      vistas.add(key)
      return true
    })
    .slice(0, 8)
}

export function analizarFlavor(consulta = '') {
  const texto = normalizar(consulta)
  const ingredientes = (flavorKnowledge.ingredients || [])
    .map(item => ({
      item,
      alias: aliasIngrediente(item).filter(alias => incluyeTermino(texto, alias)),
    }))
    .filter(match => match.alias.length)
    .map(match => match.item)
    .slice(0, 10)

  const tecnicas = detectarTecnicas(texto, ingredientes)
  const perfil = mezclarPerfil(ingredientes, tecnicas)
  const rasgosAltos = Object.entries(perfil)
    .filter(([, valor]) => valor >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([dimension, valor]) => ({ dimension, valor }))
  const afinidades = afinidadesPrincipales(ingredientes)
  const alertas = [...new Set(ingredientes.flatMap(item => item.notas_para_app?.alertas || []))].slice(0, 5)

  return {
    ingredientes: ingredientes.map(item => ({
      id: item.ingrediente,
      nombre: item.nombre_visible,
      familia: item.familia,
    })),
    tecnicas,
    perfil,
    rasgosAltos,
    afinidades,
    alertas,
  }
}

export function consultaEnriquecidaFlavor(consulta = '', analisis = analizarFlavor(consulta)) {
  if (!analisis.ingredientes.length && !analisis.rasgosAltos.length) return String(consulta || '')
  const ingredientes = analisis.ingredientes.map(item => item.nombre || item.id).join(' · ')
  const tecnicas = analisis.tecnicas.join(' · ')
  const rasgos = analisis.rasgosAltos.map(item => `${item.dimension} ${item.valor}/5`).join(' · ')
  const afinidades = analisis.afinidades.map(item => item.ingrediente).join(' · ')

  return [
    String(consulta || ''),
    '',
    'Lectura culinaria experimental Flavor Bible para laboratorio interno:',
    ingredientes ? `Ingredientes detectados: ${ingredientes}.` : '',
    tecnicas ? `Tecnicas detectadas: ${tecnicas}.` : '',
    rasgos ? `Rasgos sensoriales altos: ${rasgos}.` : '',
    afinidades ? `Afinidades culinarias del plato: ${afinidades}.` : '',
    'Usar esta lectura solo como contexto culinario; no atribuirla a Chartier ni tratarla como maridaje de vino directo.',
  ].filter(Boolean).join('\n')
}

