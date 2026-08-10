export const WINE_PROFILE_GROUPS = [
  {
    id: 'tecnico',
    label: 'Perfil tecnico para maridaje',
    description: 'Estructura en boca: lo que mas condiciona riesgos y compatibilidad.',
  },
  {
    id: 'wset',
    label: 'Familias aromaticas WSET',
    description: 'Aromas primarios, secundarios y terciarios para afinidad y explicacion.',
  },
]

export const WINE_PROFILE_TAGS = [
  { id: 'seco', group: 'tecnico', label: 'Seco', texto: 'seco' },
  { id: 'dulce', group: 'tecnico', label: 'Dulce', texto: 'dulce semidulce' },
  { id: 'alta_acidez', group: 'tecnico', label: 'Alta acidez', texto: 'alta acidez' },
  { id: 'baja_acidez', group: 'tecnico', label: 'Baja acidez', texto: 'baja acidez' },
  { id: 'tanino_bajo', group: 'tecnico', label: 'Tanino bajo', texto: 'tanino bajo tanino suave tanino amable' },
  { id: 'tanino_medio_alto', group: 'tecnico', label: 'Tanino medio/alto', texto: 'tanino medio tanino alto tanino firme tanino marcado' },
  { id: 'cuerpo_ligero', group: 'tecnico', label: 'Cuerpo ligero', texto: 'cuerpo ligero perfil fresco ligero' },
  { id: 'con_cuerpo', group: 'tecnico', label: 'Con cuerpo', texto: 'con cuerpo cuerpo medio-alto' },
  { id: 'alcohol_bajo', group: 'tecnico', label: 'Alcohol bajo', texto: 'alcohol bajo baja graduacion' },
  { id: 'alcohol_alto', group: 'tecnico', label: 'Alcohol alto', texto: 'alcohol alto' },

  { id: 'floral', group: 'wset', label: 'Floral', texto: 'floral flores blancas violeta' },
  { id: 'fruta_verde', group: 'wset', label: 'Fruta verde', texto: 'fruta verde manzana pera membrillo' },
  { id: 'fruta_citrica', group: 'wset', label: 'Fruta citrica', texto: 'fruta citrica limon lima pomelo naranja' },
  { id: 'fruta_hueso', group: 'wset', label: 'Fruta de hueso', texto: 'fruta de hueso melocoton albaricoque nectarina' },
  { id: 'fruta_tropical', group: 'wset', label: 'Fruta tropical', texto: 'fruta tropical mango pina lichis melon' },
  { id: 'fruta_roja', group: 'wset', label: 'Fruta roja', texto: 'fruta roja fresa frambuesa cereza roja' },
  { id: 'fruta_negra', group: 'wset', label: 'Fruta negra', texto: 'fruta negra zarzamora ciruela negra cereza negra' },
  { id: 'fruta_seca_cocida', group: 'wset', label: 'Fruta seca/cocida', texto: 'fruta madura fruta seca fruta cocida fruta confitada mermelada' },
  { id: 'herbaceo', group: 'wset', label: 'Herbaceo', texto: 'herbaceo hierba pimiento verde hoja de tomate esparrago' },
  { id: 'especiado', group: 'wset', label: 'Especiado', texto: 'especiado pimienta regaliz clavo nuez moscada canela' },
  { id: 'mineral_salino', group: 'wset', label: 'Mineral/salino', texto: 'mineral salino yodado marino silex piedras mojadas' },
  { id: 'lias_autolisis', group: 'wset', label: 'Lias/autolisis', texto: 'lias autolisis brioche pan tostado levaduras pasteleria' },
  { id: 'malolactica', group: 'wset', label: 'Malolactica', texto: 'malolactica mantequilla nata queso' },
  { id: 'roble', group: 'wset', label: 'Roble', texto: 'roble madera barrica tostado cafe cacao vainilla cedro humo' },
  { id: 'oxidativo', group: 'wset', label: 'Oxidativo', texto: 'oxidativo almendra avellana nuez frutos secos toffee caramelo' },
  { id: 'evolucion_botella', group: 'wset', label: 'Evolucion en botella', texto: 'evolucion botella cuero tierra champinon tabaco petroleo miel' },
]

const TAG_BY_ID = new Map(WINE_PROFILE_TAGS.map(tag => [tag.id, tag]))
const TAG_IDS = new Set(WINE_PROFILE_TAGS.map(tag => tag.id))
const MARKER_RE = /\n?\[(perfil_maridaje|perfil_descartado):([a-z0-9_, -]*)\]\s*/gi

const LEGACY_TAG_ALIASES = {
  fresco: 'cuerpo_ligero',
  salino: 'mineral_salino',
  mineral: 'mineral_salino',
  baja_graduacion: 'alcohol_bajo',
  fruta_madura: 'fruta_seca_cocida',
  tanino_amable: 'tanino_bajo',
  madera: 'roble',
  tostado: 'roble',
}

const EXCLUSIVE_TAGS = {
  seco: ['dulce'],
  dulce: ['seco'],
  alta_acidez: ['baja_acidez'],
  baja_acidez: ['alta_acidez'],
  tanino_bajo: ['tanino_medio_alto'],
  tanino_medio_alto: ['tanino_bajo'],
  cuerpo_ligero: ['con_cuerpo'],
  con_cuerpo: ['cuerpo_ligero'],
  alcohol_bajo: ['alcohol_alto'],
  alcohol_alto: ['alcohol_bajo'],
}

function normalizar(texto = '') {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function tagIdValido(id = '') {
  const limpio = String(id || '').trim()
  return LEGACY_TAG_ALIASES[limpio] || limpio
}

function idsValidos(ids = []) {
  return [...new Set(ids
    .map(tagIdValido)
    .filter(id => TAG_IDS.has(id)))]
}

function aplicarExclusiones(ids = []) {
  const resultado = []
  idsValidos(ids).forEach(id => {
    const incompatibles = EXCLUSIVE_TAGS[id] || []
    for (let i = resultado.length - 1; i >= 0; i -= 1) {
      if (incompatibles.includes(resultado[i])) resultado.splice(i, 1)
    }
    if (!resultado.includes(id)) resultado.push(id)
  })
  return resultado
}

function leerMarcador(notas = '', tipo = 'perfil_maridaje') {
  const encontrados = []
  MARKER_RE.lastIndex = 0
  String(notas || '').replace(MARKER_RE, (match, markerType, ids) => {
    if (markerType !== tipo) return match
    encontrados.push(...String(ids || '').split(',').map(id => id.trim()))
    return match
  })
  return idsValidos(encontrados)
}

function incluyeAlguno(texto, patrones) {
  return patrones.some(patron => texto.includes(patron))
}

export function leerPerfilesVino(notas = '') {
  return leerMarcador(notas, 'perfil_maridaje')
}

export function leerPerfilesDescartados(notas = '') {
  return leerMarcador(notas, 'perfil_descartado')
}

export function limpiarMarcadorPerfiles(notas = '') {
  return String(notas || '').replace(MARKER_RE, '').trim()
}

export function inferirPerfilesVino(vino = {}) {
  const notas = typeof vino === 'string' ? vino : vino.notas_cata
  const texto = normalizar(limpiarMarcadorPerfiles(notas))
  const tipo = normalizar(typeof vino === 'string' ? '' : vino.tipo)
  const uvaRegionNombre = normalizar([
    typeof vino === 'string' ? '' : vino.uva,
    typeof vino === 'string' ? '' : vino.region,
    typeof vino === 'string' ? '' : vino.nombre,
  ].filter(Boolean).join(' '))
  const perfiles = new Set()

  if (tipo && !['dulce', 'generoso'].includes(tipo)) perfiles.add('seco')
  if (tipo === 'dulce' || incluyeAlguno(texto, ['vino dulce', 'dulzor alto', 'semidulce', 'vendimia tardia', 'pedro ximenez'])) perfiles.add('dulce')
  if (incluyeAlguno(texto, ['alta acidez', 'acidez alta', 'acidez marcada', 'tension', 'vibrante', 'frescura']) || incluyeAlguno(uvaRegionNombre, ['albarino', 'riesling', 'txakoli', 'chablis', 'champagne', 'cava'])) perfiles.add('alta_acidez')
  if (incluyeAlguno(texto, ['baja acidez', 'acidez baja', 'acidez suave'])) perfiles.add('baja_acidez')
  if (incluyeAlguno(texto, ['tanino amable', 'tanino bajo', 'tanino suave', 'tanino redondo', 'tanino pulido', 'sedoso']) || incluyeAlguno(uvaRegionNombre, ['pinot noir', 'gamay'])) perfiles.add('tanino_bajo')
  if (incluyeAlguno(texto, ['tanino alto', 'tanino firme', 'tanino marcado', 'astringente']) || incluyeAlguno(uvaRegionNombre, ['cabernet', 'monastrell', 'priorat', 'toro', 'ribera del duero'])) perfiles.add('tanino_medio_alto')
  if (incluyeAlguno(texto, ['cuerpo ligero', 'ligero', 'delicado', 'perfil fresco'])) perfiles.add('cuerpo_ligero')
  if (incluyeAlguno(texto, ['con cuerpo', 'cuerpo medio-alto', 'corpulento', 'voluminoso', 'estructura amplia'])) perfiles.add('con_cuerpo')
  if (incluyeAlguno(texto, ['baja graduacion', 'alcohol bajo', 'ligero de alcohol'])) perfiles.add('alcohol_bajo')
  if (incluyeAlguno(texto, ['alcohol alto', 'calido', 'calidez alcoholica']) || incluyeAlguno(uvaRegionNombre, ['jerez', 'porto', 'oporto', 'priorat'])) perfiles.add('alcohol_alto')

  if (incluyeAlguno(texto, ['floral', 'flores blancas', 'violeta', 'jazmin', 'rosa'])) perfiles.add('floral')
  if (incluyeAlguno(texto, ['fruta verde', 'manzana', 'pera', 'membrillo'])) perfiles.add('fruta_verde')
  if (incluyeAlguno(texto, ['fruta citrica', 'citrico', 'limon', 'lima', 'pomelo', 'naranja'])) perfiles.add('fruta_citrica')
  if (incluyeAlguno(texto, ['fruta de hueso', 'melocoton', 'albaricoque', 'nectarina'])) perfiles.add('fruta_hueso')
  if (incluyeAlguno(texto, ['fruta tropical', 'mango', 'pina', 'lichi', 'melon'])) perfiles.add('fruta_tropical')
  if (incluyeAlguno(texto, ['fruta roja', 'fresa', 'frambuesa', 'cereza roja', 'grosella roja'])) perfiles.add('fruta_roja')
  if (incluyeAlguno(texto, ['fruta negra', 'zarzamora', 'ciruela negra', 'cereza negra', 'arandano azul'])) perfiles.add('fruta_negra')
  if (incluyeAlguno(texto, ['fruta madura', 'fruta seca', 'fruta cocida', 'mermelada', 'compota', 'kirsch', 'uva pasa'])) perfiles.add('fruta_seca_cocida')
  if (incluyeAlguno(texto, ['herbaceo', 'hierba', 'pimiento verde', 'hoja de tomate', 'esparrago'])) perfiles.add('herbaceo')
  if (incluyeAlguno(texto, ['especiado', 'pimienta', 'regaliz', 'clavo', 'nuez moscada', 'canela'])) perfiles.add('especiado')
  if (incluyeAlguno(texto, ['mineral', 'salino', 'salinidad', 'yodado', 'marino', 'silex', 'piedras mojadas'])) perfiles.add('mineral_salino')
  if (incluyeAlguno(texto, ['lias', 'autolisis', 'brioche', 'pan tostado', 'levaduras', 'pasteleria'])) perfiles.add('lias_autolisis')
  if (incluyeAlguno(texto, ['malolactica', 'mantequilla', 'nata', 'lactico'])) perfiles.add('malolactica')
  if (incluyeAlguno(texto, ['roble', 'madera', 'barrica', 'vainilla', 'cedro', 'humo', 'cacao', 'cafe', 'tostado', 'crianza'])) perfiles.add('roble')
  if (incluyeAlguno(texto, ['oxidativo', 'almendra', 'avellana', 'nuez', 'frutos secos', 'toffee', 'caramelo'])) perfiles.add('oxidativo')
  if (incluyeAlguno(texto, ['evolucion en botella', 'cuero', 'tierra', 'champinon', 'tabaco', 'petroleo', 'queroseno', 'miel'])) perfiles.add('evolucion_botella')

  return idsValidos([...perfiles])
}

export function resolverPerfilesVino(vino = {}) {
  const confirmados = leerPerfilesVino(vino.notas_cata)
  const descartados = new Set(leerPerfilesDescartados(vino.notas_cata))
  const inferidos = inferirPerfilesVino(vino)
  return aplicarExclusiones([...inferidos.filter(id => !descartados.has(id)), ...confirmados])
}

export function escribirPerfilesVino(notas = '', perfiles = [], descartados = leerPerfilesDescartados(notas)) {
  const texto = limpiarMarcadorPerfiles(notas)
  const ids = aplicarExclusiones(perfiles)
  const idsDescartados = idsValidos(descartados)
  const marcador = ids.length ? `[perfil_maridaje:${ids.join(',')}]` : ''
  const descartes = idsDescartados.length ? `[perfil_descartado:${idsDescartados.join(',')}]` : ''
  return [texto, marcador, descartes].filter(Boolean).join('\n')
}

export function alternarPerfilVino(notas = '', perfilId, vino = {}) {
  const id = tagIdValido(perfilId)
  const actuales = new Set(leerPerfilesVino(notas))
  const descartados = new Set(leerPerfilesDescartados(notas))
  const inferidos = new Set(inferirPerfilesVino({ ...vino, notas_cata: notas }))
  const estaActivo = actuales.has(id) || (inferidos.has(id) && !descartados.has(id))

  if (estaActivo) {
    actuales.delete(id)
    if (inferidos.has(id)) descartados.add(id)
  } else if (TAG_IDS.has(id)) {
    ;(EXCLUSIVE_TAGS[id] || []).forEach(incompatible => {
      actuales.delete(incompatible)
      descartados.add(incompatible)
    })
    descartados.delete(id)
    actuales.add(id)
  }
  return escribirPerfilesVino(notas, [...actuales], [...descartados])
}

export function vinoTienePerfil(vino = {}, perfilId) {
  const id = tagIdValido(perfilId)
  const perfiles = Array.isArray(vino.perfiles_maridaje)
    ? idsValidos(vino.perfiles_maridaje)
    : resolverPerfilesVino(vino)
  return perfiles.includes(id)
}

export function textoPerfilesVino(vino = {}) {
  const ids = Array.isArray(vino.perfiles_maridaje)
    ? idsValidos(vino.perfiles_maridaje)
    : resolverPerfilesVino(vino)
  return WINE_PROFILE_TAGS
    .filter(tag => ids.includes(tag.id))
    .map(tag => tag.texto)
    .join(' ')
}

export function obtenerTagVino(id = '') {
  return TAG_BY_ID.get(tagIdValido(id)) || null
}

export function textoVinoParaMaridaje(vino = {}) {
  return [
    vino.nombre,
    vino.bodega,
    vino.tipo,
    vino.region,
    vino.uva,
    textoPerfilesVino(vino),
  ].filter(Boolean).join(' ')
}
