import papilasKb from '../data/papilas_maridajes_final_1.json'
import { buscarPlatoKb } from '../data/platos_kb'

// Estima el perfil estructural de un vino (1-5) a partir de sus datos.
// Permite matching estructural directo: taninos, acidez, cuerpo, etc.
export function estimarPerfil(vino) {
  const texto = normalizar(
    `${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.nombre || ''} ${vino.notas_cata || ''}`
  )

  const base = {
    tinto:    { taninos: 3, acidez: 3, alcohol: 3, dulzor: 1, cuerpo: 3 },
    blanco:   { taninos: 1, acidez: 4, alcohol: 3, dulzor: 2, cuerpo: 2 },
    rosado:   { taninos: 1, acidez: 3, alcohol: 3, dulzor: 2, cuerpo: 2 },
    espumoso: { taninos: 1, acidez: 5, alcohol: 2, dulzor: 2, cuerpo: 2 },
    generoso: { taninos: 1, acidez: 4, alcohol: 5, dulzor: 2, cuerpo: 3 },
    dulce:    { taninos: 1, acidez: 3, alcohol: 3, dulzor: 5, cuerpo: 3 },
    naranja:  { taninos: 3, acidez: 4, alcohol: 3, dulzor: 1, cuerpo: 3 },
  }[vino.tipo] || { taninos: 3, acidez: 3, alcohol: 3, dulzor: 2, cuerpo: 3 }

  const p = { ...base }

  // Ajustes por uva / región
  const alta_acidez = ['albarin', 'riesling', 'verdejo', 'godello', 'txakoli', 'champagne', 'cava', 'rueda', 'rias baixas', 'galicia', 'green', 'vinho']
  const alta_taninos = ['monastrell', 'petit verdot', 'cabernet', 'priorat', 'jumilla', 'toro', 'ribera', 'bierzo', 'mencia']
  const bajo_taninos = ['pinot', 'grenache', 'garnacha', 'gamay', 'beaujolais']
  const mucho_cuerpo = ['monastrell', 'cabernet', 'syrah', 'shiraz', 'malbec', 'priorat', 'toro', 'rioja reserva', 'gran reserva']
  const poco_cuerpo  = ['pinot', 'txakoli', 'fino', 'manzanilla', 'albarin', 'frizzante']
  const alcohol_alto = ['monastrell', 'grenache', 'garnacha', 'jerez', 'oloroso', 'brandy', 'oporto', 'porto', 'tawny']

  if (alta_acidez.some(g => texto.includes(g)))  p.acidez  = Math.min(5, p.acidez + 1)
  if (alta_taninos.some(g => texto.includes(g)))  p.taninos = Math.min(5, p.taninos + 1)
  if (bajo_taninos.some(g => texto.includes(g)))  p.taninos = Math.max(1, p.taninos - 1)
  if (mucho_cuerpo.some(g => texto.includes(g)))  p.cuerpo  = Math.min(5, p.cuerpo + 1)
  if (poco_cuerpo.some(g => texto.includes(g)))   p.cuerpo  = Math.max(1, p.cuerpo - 1)
  if (alcohol_alto.some(g => texto.includes(g)))  p.alcohol = Math.min(5, p.alcohol + 1)

  // Ajustes por notas de cata
  if (['alta acidez', 'muy acido', 'vivo', 'vibrante', 'tenso', 'tension'].some(t => texto.includes(t)))        p.acidez  = Math.min(5, p.acidez + 1)
  if (['tanino amable', 'tanino suave', 'tanino redondo', 'sedoso'].some(t => texto.includes(t)))                p.taninos = Math.max(1, p.taninos - 1)
  if (['tanino potente', 'tanino firme', 'tanino marcado', 'astringente'].some(t => texto.includes(t)))          p.taninos = Math.min(5, p.taninos + 1)
  if (['ligero', 'ligereza', 'delicado', 'fino y delicado'].some(t => texto.includes(t)))                       p.cuerpo  = Math.max(1, p.cuerpo - 1)
  if (['potente', 'con cuerpo', 'corpulento', 'voluminoso'].some(t => texto.includes(t)))                       p.cuerpo  = Math.min(5, p.cuerpo + 1)
  if (['salino', 'mineral', 'yodado', 'marino'].some(t => texto.includes(t)))                                   p.acidez  = Math.min(5, p.acidez + 1)
  if (['reserva', 'gran reserva', 'crianza', 'barrica', 'roble'].some(t => texto.includes(t)) && vino.tipo === 'tinto') p.taninos = Math.min(5, p.taninos + 1)
  if (['fresco', 'frescura', 'jovial', 'joven y fresco'].some(t => texto.includes(t)))                          p.dulzor  = Math.max(1, p.dulzor - 1)

  // Generosos específicos
  if (texto.includes('fino') || texto.includes('manzanilla'))               { p.taninos = 1; p.acidez = 4; p.dulzor = 1; p.alcohol = 4; p.cuerpo = 2 }
  if (texto.includes('oloroso') || texto.includes('amontillado'))           { p.taninos = 1; p.acidez = 3; p.dulzor = 2; p.alcohol = 5; p.cuerpo = 4 }
  if (texto.includes('pedro ximenez') || texto.includes(' px ') || texto.includes('px,')) { p.dulzor = 5; p.cuerpo = 5; p.alcohol = 4; p.acidez = 2 }
  if (texto.includes('tawny') || texto.includes('oporto') || texto.includes('porto'))     { p.dulzor = 4; p.cuerpo = 4; p.alcohol = 5; p.taninos = 2 }

  // Clamp 1-5
  for (const k of Object.keys(p)) p[k] = Math.max(1, Math.min(5, p[k]))

  return p
}

// Calcula las necesidades estructurales de un plato/mesa para el matching.
function necesidadesEstructurales(consulta) {
  const texto = normalizar(consulta)
  const contexto = contextoVenta(texto)
  const metodo = metodosPlato(texto)
  const n = {}

  if (contexto === 'pescado' && !metodo.brasa && !metodo.ahumado && !metodo.setasTrufa && !metodo.dulce) {
    n.taninosMax = 2; n.acidezMin = 3
  }
  if (contexto === 'fritura' || metodo.frito) {
    n.acidezMin = 4; n.taninosMax = 2; n.cuerpoMax = 3
  }
  if (contexto === 'carne') {
    // WSET L3: la grasa suaviza el tanino, la proteina se une al tanino.
    // Tanino maduro es el eje principal; acidez limpia entre bocados; cuerpo suficiente para igualar intensidad.
    n.taninosMin = 3
    n.cuerpoMin = 3
    n.acidezMin = 2
  }
  if (contexto === 'queso') {
    n.taninosMax = 2; n.acidezMin = 3
  }
  if (metodo.picante) {
    n.alcoholMax = 3; n.taninosMax = 2
  }
  if (metodo.gratinado) {
    n.acidezMin = 3
  }
  if (metodo.vegetalVerde) {
    n.taninosMax = 2; n.acidezMin = 3
  }
  if (metodo.umami || metodo.setasTrufa) {
    n.acidezMin = 3
  }
  if (contexto === 'aperitivo') {
    n.alcoholMax = 4; n.taninosMax = 2; n.cuerpoMax = 3
  }

  return n
}

export function normalizar(texto = '') {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function textoPlano(valor) {
  if (!valor) return ''
  if (typeof valor === 'string') return valor
  if (Array.isArray(valor)) return valor.map(textoPlano).join(' ')
  if (typeof valor === 'object') return Object.values(valor).map(textoPlano).join(' ')
  return ''
}

function palabrasClave(texto) {
  const stop = new Set(['con', 'del', 'para', 'por', 'una', 'uno', 'los', 'las', 'que', 'vino', 'vinos', 'tipo', 'como', 'tambien', 'sobre', 'estos', 'esta'])
  return normalizar(texto).split(/[^a-z0-9]+/).filter(p => p.length > 3 && !stop.has(p))
}

function unique(lista, limite = 8) {
  return [...new Set(lista.filter(Boolean))].slice(0, limite)
}

export function precioBotella(vino) {
  return Number(vino?.precio_botella) || 0
}

function contextoVenta(consultaNormalizada) {
  const platoKb = buscarPlatoKb(consultaNormalizada)
  if (platoKb?.contexto) return platoKb.contexto
  if (consultaNormalizada.includes('queso')) return 'queso'
  if (consultaNormalizada.includes('fritura') || consultaNormalizada.includes('frito') || consultaNormalizada.includes('croqueta') || consultaNormalizada.includes('flamenquin')) return 'fritura'
  if (consultaNormalizada.includes('aperitivo') || consultaNormalizada.includes('entrante') || consultaNormalizada.includes('compartir')) return 'aperitivo'
  if (['carne', 'rabo', 'codillo', 'cordero', 'ternera', 'iberico',
       'vaca', 'buey', 'chuleton', 'txuleton', 'chuleta', 'entrecot', 't-bone', 'tbone',
       'solomillo', 'costillar', 'costilla de', 'carrillera', 'carrillada',
       'secreto', 'presa', 'pluma iberica',
       'magret', 'pichon', 'caza', 'liebre', 'venado', 'jabali',
       'lomo de cerdo', 'lomo iberico'].some(t => consultaNormalizada.includes(t))) return 'carne'
  if (consultaNormalizada.includes('pescado') || consultaNormalizada.includes('marisco') || consultaNormalizada.includes('gamba') || consultaNormalizada.includes('lubina') || consultaNormalizada.includes('salmon') || consultaNormalizada.includes('bacalao') || consultaNormalizada.includes('chipiron')) return 'pescado'
  if (consultaNormalizada.includes('picante') || consultaNormalizada.includes('curry') || consultaNormalizada.includes('pil pil')) return 'picante'
  return 'general'
}

function metodosPlato(consultaNormalizada) {
  const platoKb = buscarPlatoKb(consultaNormalizada)
  return {
    brasa: platoKb?.metodos?.includes('brasa') || ['brasa', 'parrilla', 'plancha', 'barbacoa', 'brasas'].some(t => consultaNormalizada.includes(t)),
    frito: platoKb?.metodos?.includes('frito') || ['frito', 'frita', 'fritura', 'croqueta', 'flamenquin'].some(t => consultaNormalizada.includes(t)),
    gratinado: platoKb?.metodos?.includes('gratinado') || ['gratinado', 'gratinada', 'alioli', 'queso', 'quesos', 'parmentier', 'crema'].some(t => consultaNormalizada.includes(t)),
    ahumado: platoKb?.metodos?.includes('ahumado') || ['ahumado', 'ahumada'].some(t => consultaNormalizada.includes(t)),
    picante: platoKb?.metodos?.includes('picante') || ['picante', 'picantito', 'pil pil', 'ajillo', 'brava', 'curry'].some(t => consultaNormalizada.includes(t)),
    vegetalVerde: platoKb?.metodos?.includes('vegetal') || ['esparrago', 'esparragos', 'pimiento', 'pepino', 'menta', 'perejil', 'hinojo', 'apio'].some(t => consultaNormalizada.includes(t)),
    setasTrufa: platoKb?.metodos?.includes('setas_trufa') || ['seta', 'setas', 'boletus', 'champinon', 'champinones', 'trufa'].some(t => consultaNormalizada.includes(t)),
    dulce: platoKb?.metodos?.includes('dulce') || ['pedro ximenez', 'px', 'miel', 'pasas', 'caramelizada', 'caramelizado'].some(t => consultaNormalizada.includes(t)),
    frutosSecos: platoKb?.metodos?.includes('frutos_secos') || ['nuez', 'nueces', 'almendra', 'almendras', 'avellana'].some(t => consultaNormalizada.includes(t)),
    umami: platoKb?.metodos?.includes('umami') || ['umami', 'madurada', 'estofado', 'guiso', 'setas', 'trufa', 'queso curado'].some(t => consultaNormalizada.includes(t)),
    frio: platoKb?.metodos?.includes('frio') || ['frio', 'fria', 'salmorejo', 'mazamorra'].some(t => consultaNormalizada.includes(t)),
  }
}

export function criteriosEstructurales(consulta = '') {
  const texto = normalizar(consulta)
  const contexto = contextoVenta(texto)
  const metodo = metodosPlato(texto)
  const rasgos = []
  const buscar = []
  const evitar = []
  const apuntes = []

  if (contexto === 'queso') {
    rasgos.push('grasa lactea', 'sal', 'umami')
    buscar.push('acidez', 'salinidad', 'flor/oxidacion o dulzor si hay curacion alta')
    evitar.push('tanino marcado por defecto')
    apuntes.push('En queso el color no manda: textura, sal y curacion pesan mas que elegir tinto por costumbre.')
  }
  if (contexto === 'fritura' || metodo.frito) {
    rasgos.push('grasa', 'crujiente', 'sal')
    buscar.push('alta acidez', 'burbuja', 'generoso seco o blanco salino')
    evitar.push('tinto potente', 'dulzor oxidativo pesado')
    apuntes.push('La fritura pide limpieza: acidez, salinidad o burbuja dejan la boca preparada para otro bocado.')
  }
  if (contexto === 'pescado') {
    rasgos.push('proteina de mar')
    buscar.push('frescura', 'salinidad', 'acidez')
    evitar.push('tanino dominante')
  }
  if (contexto === 'carne') {
    rasgos.push('intensidad', metodo.brasa ? 'tostado/brasa' : 'sabor carnico')
    buscar.push('fruta suficiente', 'acidez', metodo.brasa ? 'crianza integrada' : 'estructura sin secar')
    evitar.push('vino sin cuerpo si el plato es intenso')
  }
  if (metodo.gratinado) {
    rasgos.push('grasa/cremosidad')
    buscar.push('acidez que corte grasa', 'volumen en boca')
    evitar.push('madera dominante sin frescura')
  }
  if (metodo.vegetalVerde) {
    rasgos.push('vegetal verde')
    buscar.push('perfil citrico o vegetal', 'frescura')
    evitar.push('tinto con tanino y madera')
  }
  if (metodo.picante) {
    rasgos.push('picante')
    buscar.push('alcohol moderado', 'frescura', 'ligero dulzor si procede')
    evitar.push('alcohol alto', 'tanino seco')
    apuntes.push('El picante sube la sensacion de alcohol y tanino; mejor frescura y amabilidad.')
  }
  if (metodo.umami || metodo.setasTrufa) {
    rasgos.push('umami')
    buscar.push('fruta concentrada o salinidad', 'textura')
    evitar.push('tanino austero')
    apuntes.push('El umami endurece el vino: conviene fruta, salinidad o textura para compensar.')
  }
  if (metodo.dulce) {
    rasgos.push('dulzor/reduccion')
    buscar.push('fruta madura', 'oxidacion controlada', 'acidez')
    evitar.push('vino muy seco y austero')
    apuntes.push('El dulzor del plato hace que el vino parezca mas duro y menos afrutado.')
  }
  if (metodo.frio) {
    rasgos.push('servicio frio')
    buscar.push('tension', 'aroma nitido', 'salinidad')
  }

  if (!apuntes.length) {
    apuntes.push('El criterio comun cruza Papilas con estructura WSET: dulzor, acidez, tanino, cuerpo, umami, sal, grasa, salsa y tecnica del plato.')
  }

  return {
    rasgos: unique(rasgos, 7),
    buscar: unique(buscar, 7),
    evitar: unique(evitar, 6),
    lectura: apuntes.join(' '),
  }
}

function terminosVinoDesdeCapitulo(capitulo) {
  const partes = [
    textoPlano(capitulo.wines_specific || []),
    textoPlano(capitulo.wine_style_descriptors || []),
    textoPlano((capitulo.pairings || []).map(p => p.wine)),
  ].join(' ')
  return unique(palabrasClave(partes), 40)
}

function capitulosParaConsulta(consultaNormalizada) {
  const platoKb = buscarPlatoKb(consultaNormalizada)
  const atajos = {
    aperitivo: ['fino_manzanilla_versatil', 'anisado_blanco_herbaceo', 'sabor_frio_manzana_sauvignon'],
    pescado:   ['anisado_blanco_herbaceo', 'romero_blancos_alsacianos', 'azafran_riesling_chardonnay', 'sabor_frio_manzana_sauvignon'],
    carne:     ['roble_barrica_carnes_parrilla', 'carne_estofada', 'carne_vacuno_pasto_terpenos', 'clavo_tintos_espanoles'],
    queso:     ['quesos_pasta_semidura_blancos', 'quesos_corteza_floral_chardonnay', 'quesos_azules_oporto_sauternes', 'fino_manzanilla_versatil'],
    fritura:   ['fino_manzanilla_versatil', 'sabor_frio_manzana_sauvignon'],
    fresco:    ['sabor_frio_manzana_sauvignon', 'anisado_blanco_herbaceo'],
    picante:   ['capsaicina_guindilla_vinos_amortiguadores', 'gewurztraminer_lichi_jengibre', 'jengibre_gewurztraminer_scheurebe'],
    curry:     ['sotolon_vino_jaune_curri', 'capsaicina_guindilla_vinos_amortiguadores'],
    postre:    ['jarabe_arce_dulces_licorosos', 'pina_fresa_licorosos', 'canela_pinot_noir_garnacha'],
  }
  const capitulos = papilasKb
  const idsAtajo = [
    ...(platoKb?.capitulos || []),
    ...Object.entries(atajos)
      .filter(([key]) => consultaNormalizada.includes(key) || contextoVenta(consultaNormalizada) === key)
      .flatMap(([, ids]) => ids)
  ]

  const matches = capitulos.map(capitulo => {
    const textoCapitulo = normalizar([
      capitulo.id,
      capitulo.title,
      textoPlano(capitulo.foods || []),
      textoPlano((capitulo.pairings || []).map(p => p.dish)),
    ].join(' '))
    let score = idsAtajo.includes(capitulo.id) ? 12 : 0
    palabrasClave(consultaNormalizada).forEach(palabra => {
      if (textoCapitulo.includes(palabra)) score += 4
    })
    return {
      capitulo,
      score,
      terminosVino: terminosVinoDesdeCapitulo(capitulo),
      tipos: capitulo.wine_types_primary || [],
    }
  }).filter(match => match.score > 0)

  if (matches.length) return matches.sort((a, b) => b.score - a.score).slice(0, 4)

  return capitulos
    .filter(capitulo => ['fino_manzanilla_versatil', 'anisado_blanco_herbaceo', 'sabor_frio_manzana_sauvignon'].includes(capitulo.id))
    .map(capitulo => ({
      capitulo,
      score: 2,
      terminosVino: terminosVinoDesdeCapitulo(capitulo),
      tipos: capitulo.wine_types_primary || [],
    }))
}

function compatibilidadContexto(vino, contexto, consultaNormalizada) {
  const textoVino = normalizar(`${vino.nombre} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
  const esTawnyOPorto = textoVino.includes('tawny') || textoVino.includes('porto') || textoVino.includes('oporto')
  const quesoTrucadoParaTinto = ['clavo', 'olivada', 'tomate seco', 'tomates secos'].some(t => consultaNormalizada.includes(t))
  const metodo = metodosPlato(consultaNormalizada)

  if (contexto === 'queso' && vino.tipo === 'tinto' && !quesoTrucadoParaTinto) {
    return { compatible: false, penalizacion: 80, razon: 'En quesos se priorizan blancos, finos/manzanillas, rosados, dulces u oxidativos; el tinto queda como excepcion si el acompanamiento lo justifica.' }
  }

  // Carne roja potente: el blanco no es la lectura correcta según WSET L3
  // (la grasa y la proteina de la carne interactuan con el tanino, no con la acidez del blanco)
  // Excepciones: salsas cremosas/gratinadas, servicio frio, o preparaciones muy suaves
  if (contexto === 'carne' && vino.tipo === 'blanco' && !metodo.gratinado && !metodo.frio) {
    return { compatible: false, penalizacion: 75, razon: 'Para carne roja la grasa infiltrada suaviza el tanino y la proteina se une a el; el blanco no tiene esa interaccion estructural. Excepciones: salsas cremosas o gratinados.' }
  }
  if (contexto === 'carne' && vino.tipo === 'espumoso' && !metodo.frio && !metodo.frito) {
    return { compatible: false, penalizacion: 50, razon: 'El espumoso no es la primera lectura para carne roja intensa.' }
  }
  if (contexto === 'fritura') {
    if (vino.tipo === 'tinto' || vino.tipo === 'dulce' || esTawnyOPorto) return { compatible: false, penalizacion: 90, razon: 'Para fritura conviene tension, salinidad o burbuja; tinto potente, dulce o tawny no es la primera lectura.' }
    if (!['generoso', 'espumoso', 'blanco', 'rosado'].includes(vino.tipo)) return { compatible: false, penalizacion: 50, razon: 'Para fritura se priorizan estilos frescos, salinos o con burbuja.' }
  }
  if (contexto === 'aperitivo' && (vino.tipo === 'tinto' || vino.tipo === 'dulce' || esTawnyOPorto)) {
    return { compatible: false, penalizacion: 60, razon: 'Para aperitivo se priorizan vinos frescos, salinos, blancos, generosos secos o espumosos.' }
  }
  if (contexto === 'pescado') {
    const tintoJustificado = metodo.brasa || metodo.ahumado || metodo.setasTrufa || metodo.dulce
    if (vino.tipo === 'tinto' && !tintoJustificado) return { compatible: false, penalizacion: 85, razon: 'En pescado sin brasa, ahumado, setas/trufa o reduccion intensa, se priorizan blancos, espumosos, rosados o generosos secos.' }
    if ((consultaNormalizada.includes('salmon') || consultaNormalizada.includes('bacalao')) && metodo.vegetalVerde && vino.tipo === 'tinto') return { compatible: false, penalizacion: 90, razon: 'Con pescado y verdura verde, frescor y perfil vegetal pesan mas que el tinto.' }
    if ((metodo.gratinado || metodo.frito) && (vino.tipo === 'tinto' || vino.tipo === 'dulce' || esTawnyOPorto)) return { compatible: false, penalizacion: 90, razon: 'El gratinado, alioli o fritura pide acidez, salinidad o burbuja; evita tintos potentes y vinos dulces.' }
  }
  return { compatible: true, penalizacion: 0 }
}

function rangoBotellaParaTicket(ticketComida, precioMedio) {
  if (!ticketComida) {
    return { min: Math.max(18, precioMedio * 0.65), ideal: precioMedio, max: Math.max(32, precioMedio * 1.25) }
  }
  return {
    min: Math.max(18, ticketComida * 0.35),
    ideal: Math.max(22, ticketComida * 0.55),
    max: Math.max(30, ticketComida * 0.8),
  }
}

function ticketDesdeConsultas(consultas) {
  return consultas
    .flatMap(consulta => consulta.match(/\((\d+(?:[.,]\d{1,2})?)\s*[^)]*\)/g) || [])
    .map(match => Number(match.replace(/[^\d,.]/g, '').replace(',', '.')) || 0)
    .reduce((sum, precio) => sum + precio, 0)
}

function puntuarVino(vino, consulta, precioMedio, rangoTicket) {
  const consultaNormalizada = normalizar(consulta)
  const contexto = contextoVenta(consultaNormalizada)
  const metodo = metodosPlato(consultaNormalizada)
  const matchesKb = capitulosParaConsulta(consultaNormalizada)
  const textoVino = normalizar(`${vino.nombre} ${vino.bodega || ''} ${vino.tipo || ''} ${vino.region || ''} ${vino.uva || ''} ${vino.notas_cata || ''}`)
  const compatibilidad = compatibilidadContexto(vino, contexto, consultaNormalizada)
  let score = 0
  let motivo = 'busca afinidad aromatica y estructural con el plato'
  let fuente = 'Papilas + estructura WSET'

  matchesKb.forEach(match => {
    let matchScore = match.score
    const terminosCoincidentes = match.terminosVino.filter(termino => textoVino.includes(termino))
    const coincideTipo = match.tipos.includes(vino.tipo)
    const tipoEvitado = (match.capitulo.wine_types_avoid || []).includes(vino.tipo)
    if (coincideTipo) matchScore += 8
    if (tipoEvitado) matchScore -= 20
    matchScore += Math.min(terminosCoincidentes.length, 6) * 5
    if (matchScore > score) {
      motivo = terminosCoincidentes.length
        ? `comparte referencias de estilo con ${terminosCoincidentes.slice(0, 3).join(', ')}`
        : `encaja con la familia ${match.capitulo.title}`
      fuente = match.capitulo.title
    }
    score += matchScore
  })

  if (rangoTicket) {
    const precio = precioBotella(vino)
    const dentroRango = precio >= rangoTicket.min && precio <= rangoTicket.max
    const distanciaIdeal = Math.abs(precio - rangoTicket.ideal)
    const tolerancia = Math.max(8, rangoTicket.ideal * 0.35)
    if (dentroRango) {
      score += 5
      motivo = `${motivo}; encaja con el ticket estimado de la mesa`
    } else {
      score -= Math.min(9, (distanciaIdeal / tolerancia) * 3)
    }
  }

  if (metodo.brasa && contexto === 'carne' && vino.tipo === 'tinto') score += 8
  if (metodo.frito && ['generoso', 'espumoso', 'blanco'].includes(vino.tipo)) score += 8
  if (metodo.gratinado && ['blanco', 'generoso', 'espumoso'].includes(vino.tipo)) score += 5
  if (metodo.vegetalVerde && ['blanco', 'generoso', 'espumoso'].includes(vino.tipo)) score += 5
  if (metodo.vegetalVerde && ['sauvignon', 'verdejo', 'albari', 'riesling'].some(t => textoVino.includes(t))) score += 8
  if (metodo.setasTrufa && contexto === 'pescado' && ['tinto', 'blanco'].includes(vino.tipo)) score += 4
  if (metodo.dulce && ['dulce', 'generoso'].includes(vino.tipo)) score += 4
  if (metodo.picante && ['perfil fresco', 'floral', 'dulce', 'baja graduacion'].some(t => textoVino.includes(t))) score += 5
  if (contexto === 'queso' && ['oxidativo', 'dulce', 'salino', 'floral', 'alta acidez'].some(t => textoVino.includes(t))) score += 6
  if ((contexto === 'aperitivo' || metodo.frio) && ['perfil fresco', 'alta acidez', 'salino', 'mineral', 'floral'].some(t => textoVino.includes(t))) score += 5

  // Matching estructural por perfil numérico estimado — más preciso que text-matching
  const perfil = estimarPerfil(vino)
  const necesidades = necesidadesEstructurales(consulta)
  if (necesidades.acidezMin !== undefined) {
    if (perfil.acidez >= necesidades.acidezMin) score += 6
    else score -= 4
  }
  if (necesidades.taninosMax !== undefined) {
    if (perfil.taninos <= necesidades.taninosMax) score += 4
    else score -= 5
  }
  if (necesidades.taninosMin !== undefined) {
    if (perfil.taninos >= necesidades.taninosMin) score += 4
    else score -= 3
  }
  if (necesidades.cuerpoMin !== undefined) {
    if (perfil.cuerpo >= necesidades.cuerpoMin) score += 3
    else score -= 2
  }
  if (necesidades.cuerpoMax !== undefined) {
    if (perfil.cuerpo > necesidades.cuerpoMax) score -= 4
  }
  if (necesidades.alcoholMax !== undefined) {
    if (perfil.alcohol > necesidades.alcoholMax) score -= 5
  }

  score -= compatibilidad.penalizacion
  if (!compatibilidad.compatible) {
    motivo = compatibilidad.razon
    fuente = 'Restriccion compartida del KB'
  }

  return { vino, score: score + (Math.min(precioBotella(vino), 80) / 80), motivo, fuente, compatible: compatibilidad.compatible }
}

export function analizarMaridaje(consulta, vinos = []) {
  const consultas = Array.isArray(consulta)
    ? consulta.filter(Boolean)
    : String(consulta || '').split(',').map(parte => parte.trim()).filter(Boolean)
  const disponibles = vinos.filter(vino => vino?.activo !== false && vino?.stock !== 0 && precioBotella(vino) > 0)
  const precioMedio = disponibles.length
    ? disponibles.reduce((sum, vino) => sum + precioBotella(vino), 0) / disponibles.length
    : 28
  const rangoTicket = rangoBotellaParaTicket(ticketDesdeConsultas(consultas), precioMedio)
  const lectura = lecturaMesa(consultas, precioMedio)
  const puntuados = disponibles.map(vino => {
    if (consultas.length <= 1) return { ...puntuarVino(vino, consultas[0] || '', precioMedio, rangoTicket), rangoTicket }

    const parciales = consultas.map(item => puntuarVino(vino, item, precioMedio, rangoTicket))
    const incompatibles = parciales.filter(item => !item.compatible)
    const scoreBase = parciales.reduce((sum, item) => sum + item.score, 0) / parciales.length
    const mejorParcial = [...parciales].sort((a, b) => b.score - a.score)[0]
    return {
      vino,
      score: scoreBase - (incompatibles.length * 45),
      motivo: incompatibles.length
        ? `encaja con parte de la mesa, pero tiene conflicto con ${incompatibles.length} plato${incompatibles.length > 1 ? 's' : ''}`
        : `funciona como vino puente para ${consultas.length} platos sin chocar con ninguno`,
      fuente: incompatibles.length ? mejorParcial.fuente : 'Modo mesa: compatibilidad transversal',
      compatible: incompatibles.length === 0,
      rangoTicket,
    }
  }).sort((a, b) => b.score - a.score)

  const compatibles = puntuados.filter(item => item.compatible)
  const bajo30 = compatibles.find(item => precioBotella(item.vino) <= 30)
  const sinLimite = compatibles.find(item => !bajo30 || item.vino.id !== bajo30.vino.id)

  return {
    lectura,
    candidatos: compatibles.slice(0, 10),
    recomendados: unique([bajo30, sinLimite], 2),
  }
}

export function lecturaMesa(consultas = []) {
  if (consultas.length <= 1) return lecturaConsulta(consultas[0] || '')
  const lecturas = consultas.map(lecturaConsulta).filter(Boolean)
  return {
    rasgos: unique(lecturas.flatMap(item => item.rasgos || []), 8),
    buscar: unique(lecturas.flatMap(item => item.buscar || []), 8),
    evitar: unique(lecturas.flatMap(item => item.evitar || []), 7),
    frase: `Botella puente para ${consultas.length} platos: debe limpiar los entrantes y sostener el plato mas intenso sin imponerse.`,
    lectura: 'La recomendacion se calcula por compatibilidad transversal, no por el plato que mas grita.',
  }
}

function lecturaConsulta(consulta) {
  const texto = normalizar(consulta)
  if (!texto) return null
  const platoKb = buscarPlatoKb(texto)
  const estructural = criteriosEstructurales(texto)
  if (platoKb) {
    return {
      rasgos: unique([...(platoKb.rasgos || []), ...estructural.rasgos], 8),
      buscar: unique([...(platoKb.buscar || []), ...estructural.buscar], 8),
      evitar: unique([...(platoKb.evitar || []), ...estructural.evitar], 7),
      frase: platoKb.frase,
      lectura: [platoKb.lectura, estructural.lectura].filter(Boolean).join(' '),
    }
  }
  return {
    ...estructural,
    frase: 'Busco afinidad aromatica y equilibrio estructural con el ingrediente dominante, la salsa y la tecnica.',
  }
}

export function resumenAnalisisParaPrompt(analisis) {
  const candidatos = analisis.candidatos.slice(0, 8).map((item, idx) => {
    const vino = item.vino
    return `${idx + 1}. ${vino.nombre} (${vino.tipo || 'vino'}, ${precioBotella(vino)} EUR): ${item.motivo}. Fuente: ${item.fuente}. Score interno: ${Math.round(item.score)}.`
  }).join('\n')

  return [
    'Analisis interno compartido entre carta publica y modo camarero:',
    analisis.lectura?.frase,
    analisis.lectura?.lectura,
    analisis.lectura?.rasgos?.length ? `Rasgos del plato o mesa: ${analisis.lectura.rasgos.join(', ')}.` : '',
    analisis.lectura?.buscar?.length ? `Buscar en el vino: ${analisis.lectura.buscar.join(', ')}.` : '',
    analisis.lectura?.evitar?.length ? `Evitar: ${analisis.lectura.evitar.join(', ')}.` : '',
    candidatos ? `Candidatos priorizados por Papilas/KB/WSET:\n${candidatos}` : '',
    'Usa estos candidatos como preferencia fuerte. Solo cambia si tu razonamiento estructural lo justifica, y nunca recomiendes vinos que no esten en la carta real.',
  ].filter(Boolean).join('\n')
}
