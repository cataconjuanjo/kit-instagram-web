import papilasKb from '../data/papilas_maridajes_final_1.json'
import cocinaAromaticaKb from '../data/cocina_aromatica_kb_compact.json'

function slugify(texto = '') {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function textoPlano(valor) {
  if (!valor) return ''
  if (typeof valor === 'string') return valor
  if (Array.isArray(valor)) return valor.map(textoPlano).join(' ')
  if (typeof valor === 'object') return Object.values(valor).map(textoPlano).join(' ')
  return ''
}

function tiposVinoDesdeTexto(texto = '') {
  const base = slugify(texto).replace(/_/g, ' ')
  const tipos = new Set()

  const reglas = [
    ['blanco', ['blanco', 'chardonnay', 'sauvignon', 'verdejo', 'albari', 'riesling', 'chenin', 'gewurztraminer', 'garnacha blanca', 'roussanne', 'moscatel', 'malvasia']],
    ['tinto', ['tinto', 'pinot noir', 'garnacha', 'syrah', 'shiraz', 'cabernet', 'merlot', 'tempranillo', 'monastrell']],
    ['rosado', ['rosado', 'rose']],
    ['espumoso', ['espumoso', 'champagne', 'cava', 'prosecco', 'cremant']],
    ['generoso', ['jerez', 'fino', 'manzanilla', 'amontillado', 'oloroso', 'palo cortado']],
    ['dulce', ['dulce', 'sauternes', 'tokaji', 'vendimia tardia', 'px', 'pedro ximenez', 'moscatel']],
  ]

  reglas.forEach(([tipo, terminos]) => {
    if (terminos.some(termino => base.includes(termino))) tipos.add(tipo)
  })

  return [...tipos]
}

function normalizarPapilas(capitulo) {
  return {
    ...capitulo,
    chartier_source: 'Papilas y Moleculas',
  }
}

function normalizarCocinaAromatica(entrada) {
  const ingrediente = entrada.ingrediente || 'Ingrediente'
  const vinos = entrada.vinos_y_bebidas || []
  const alimentos = entrada.alimentos_complementarios || []
  const recetas = entrada.recetas || []

  return {
    id: `cocina_aromatica_${slugify(ingrediente)}`,
    title: `Cocina aromatica - ${ingrediente}`,
    foods: [ingrediente, ...alimentos, ...recetas],
    wine_types_primary: tiposVinoDesdeTexto(textoPlano(vinos)),
    wine_types_acceptable: [],
    wine_types_avoid: [],
    wines_specific: vinos,
    wine_style_descriptors: [entrada.descripcion_aromatica, ...vinos].filter(Boolean),
    molecular_principle: entrada.descripcion_aromatica || '',
    avoid_reason: '',
    pairings: recetas.map(receta => ({
      dish: receta,
      wine: textoPlano(vinos),
    })),
    chartier_source: 'La cocina aromatica',
  }
}

export const chartierKb = [
  ...(Array.isArray(papilasKb) ? papilasKb.map(normalizarPapilas) : []),
  ...((cocinaAromaticaKb.ingredientes || []).map(normalizarCocinaAromatica)),
]

export function fuenteChartier(capitulo) {
  return capitulo?.chartier_source || 'Chartier'
}
