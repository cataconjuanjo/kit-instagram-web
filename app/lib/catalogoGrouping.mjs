const STABLE_ID_FIELDS = [
  'vino_maestro_id',
  'producto_maestro_id',
  'master_product_id',
  'producto_id',
  'product_id',
  'wine_id',
  'ean',
  'ean13',
  'codigo_ean',
  'sku',
  'codigo_sku',
]

const UNAVAILABLE_RE = /\b(no disponible|agotad[oa]|sin stock|descatalogad[oa]|fuera de stock)\b/i
const PRODUCER_NOISE = new Set([
  'bodega', 'bodegas', 'viticultor', 'viticultores', 'vinos', 'vino',
  'winery', 'wines', 'cellers', 'cellar', 's.l', 'sl', 's.a', 'sa',
])
const PRODUCT_NAME_NOISE = new Set(['majuelo'])
const PRODUCT_STOP_WORDS = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'y', 'en'])
const FORMAT_WORDS = new Set(['botella', 'botellas', 'bottle', 'bottles', 'caja', 'cajas', 'case', 'pack', 'estuche'])

export function normalizarCatalogoTexto(value = '') {
  return String(value || '')
    .toLocaleLowerCase('es-ES')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function primerValor(obj, fields) {
  for (const field of fields) {
    const value = obj?.[field]
    if (value !== undefined && value !== null && String(value).trim()) return value
  }
  return null
}

function numero(value) {
  if (typeof value === 'string') value = value.replace(',', '.')
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function tokens(value) {
  return normalizarCatalogoTexto(value).split(' ').filter(Boolean)
}

function anadaKey(oferta = {}) {
  const fuente = [oferta.anada, oferta.ano, oferta.vintage, oferta.nombre].filter(Boolean).join(' ')
  const anadas = fuente.match(/(?:19|20)\d{2}/g)
  return anadas?.length ? [...new Set(anadas)].join('/') : ''
}

function productorKey(oferta = {}) {
  const productor = primerValor(oferta, ['productor', 'elaborador', 'producer_name', 'winery', 'bodega'])
  return tokens(productor).filter(token => !PRODUCER_NOISE.has(token)).join(' ')
}

function formatoKey(oferta = {}) {
  const ml = volumenFormatoMl(oferta.formato)
  const unidades = unidadesFormato(oferta)
  if (ml) return `${ml}:${unidades}`
  const formato = normalizarCatalogoTexto(oferta.formato)
  return formato ? `${formato}:${unidades}` : ''
}

function productoTokens(oferta = {}) {
  const nombre = primerValor(oferta, ['producto_nombre', 'nombre_producto', 'producto', 'nombre'])
  const producerTokens = new Set(productorKey(oferta).split(' ').filter(Boolean))
  const vintageTokens = new Set(anadaKey(oferta).split('/').filter(Boolean))
  const resultado = tokens(nombre)
    .filter(token => !producerTokens.has(token))
    .filter(token => !vintageTokens.has(token))
    .filter(token => !FORMAT_WORDS.has(token))
    .filter(token => !PRODUCT_STOP_WORDS.has(token))
    // "Majuelo" es un descriptor del viñedo que aparece antepuesto al nombre
    // comercial en algunos catálogos; no debe impedir reconocer el producto.
    .filter(token => !PRODUCT_NAME_NOISE.has(token))

  if (resultado.length) return resultado

  // Si el nombre era solo el productor (por ejemplo, "Aalto"), conservamos
  // el nombre completo como identidad de producto en vez de dejarla vacía.
  return tokens(nombre)
    .filter(token => !vintageTokens.has(token))
    .filter(token => !PRODUCT_STOP_WORDS.has(token))
}

function productoKey(oferta = {}) {
  return productoTokens(oferta).join(' ')
}

export function volumenFormatoMl(formato = '') {
  const text = String(formato || '').toLocaleLowerCase('es-ES').replace(',', '.')
  const match = text.match(/(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  if (match[2] === 'l') return Math.round(value * 1000)
  if (match[2] === 'cl') return Math.round(value * 10)
  return Math.round(value)
}

export function unidadesFormato(oferta = {}) {
  if (!oferta) return 1
  const explicit = numero(primerValor(oferta, ['unidades_por_caja', 'unidades', 'units_per_case']))
  if (explicit > 1) return Math.round(explicit)

  const text = String(oferta.formato || '').toLocaleLowerCase('es-ES')
  const match = text.match(/(?:caja|case|pack|estuche|estuche de)?\s*(\d+)\s*[x×]/i)
    || text.match(/(?:caja|case|pack|estuche)(?:\s+de)?\s*(\d+)\b/i)
  const units = match ? Number(match[1]) : 1
  return Number.isFinite(units) && units > 1 ? units : 1
}

export function costePorBotella(oferta = {}) {
  if (!oferta) return null
  const coste = numero(oferta.coste_estimado ?? oferta.coste_compra)
  if (coste <= 0) return null
  return coste / unidadesFormato(oferta)
}

export function ofertaDisponible(oferta = {}) {
  if (!oferta) return false
  return !UNAVAILABLE_RE.test(String(oferta.disponibilidad || ''))
}

function identidadOferta(oferta = {}, disambiguador = '') {
  const stable = primerValor(oferta, STABLE_ID_FIELDS)
  if (stable) {
    return { key: `master:${normalizarCatalogoTexto(stable)}`, confidence: 'high' }
  }

  const name = normalizarCatalogoTexto(oferta.nombre)
  const secondary = {
    productor: productorKey(oferta),
    producto: productoKey(oferta),
    anada: anadaKey(oferta),
    formato: formatoKey(oferta),
    tipo: normalizarCatalogoTexto(oferta.tipo),
  }

  // Un nombre aislado o un registro sin productor/producto/formato no es una
  // identidad suficientemente fiable para fusionar ofertas automáticamente.
  if (!name || !secondary.productor || !secondary.producto || !secondary.formato) {
    return { key: `offer:${String(oferta.id || disambiguador || 'ambiguous')}`, confidence: 'ambiguous' }
  }

  return {
    key: [secondary.productor, secondary.producto, secondary.anada, secondary.formato, secondary.tipo].join('|'),
    confidence: 'medium',
  }
}

export function claveIdentidadOferta(oferta = {}) {
  return identidadOferta(oferta).key
}

function nombreProveedor(oferta) {
  return oferta.proveedor?.nombre || oferta.proveedor_nombre || oferta.proveedor || 'Sin proveedor'
}

function claveProveedor(oferta) {
  const id = oferta.proveedor?.id || oferta.proveedor_id
  return id ? `id:${String(id)}` : `nombre:${normalizarCatalogoTexto(nombreProveedor(oferta))}`
}

function nombreGrupo(ofertas = []) {
  return [...ofertas]
    .filter(oferta => oferta?.nombre)
    .sort((a, b) => productoTokens(a).length - productoTokens(b).length || String(a.nombre).length - String(b.nombre).length)[0]
    ?.nombre || 'Vino sin nombre'
}

export function agruparOfertasCatalogo(ofertas = []) {
  const grupos = new Map()

  for (const [index, oferta] of ofertas.entries()) {
    const identidad = identidadOferta(oferta, index)
    const key = identidad.key
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        confianza: identidad.confidence,
        nombre: oferta.nombre || 'Vino sin nombre',
        bodega: oferta.bodega || '',
        tipo: oferta.tipo || '',
        region: oferta.region || oferta.zona || '',
        anada: oferta.anada || '',
        formato: oferta.formato || '',
        ofertas: [],
      })
    }
    grupos.get(key).ofertas.push(oferta)
  }

  return [...grupos.values()]
    .map(grupo => {
      const ofertas = [...grupo.ofertas].sort((a, b) => {
        const aCoste = costePorBotella(a)
        const bCoste = costePorBotella(b)
        if (aCoste === null && bCoste === null) return nombreProveedor(a).localeCompare(nombreProveedor(b), 'es')
        if (aCoste === null) return 1
        if (bCoste === null) return -1
        return aCoste - bCoste || nombreProveedor(a).localeCompare(nombreProveedor(b), 'es')
      })
      const disponibles = ofertas.filter(ofertaDisponible)
      const conPrecio = disponibles.filter(oferta => costePorBotella(oferta) !== null)
      const defaultOferta = conPrecio[0] || disponibles[0] || ofertas[0] || null
      const proveedoresPorClave = new Map()
      for (const oferta of ofertas) {
        const key = claveProveedor(oferta)
        if (!proveedoresPorClave.has(key)) proveedoresPorClave.set(key, nombreProveedor(oferta))
      }
      return {
        ...grupo,
        nombre: nombreGrupo(ofertas),
        ofertas,
        ofertaPorDefecto: defaultOferta,
        costeMinimo: conPrecio.length ? costePorBotella(conPrecio[0]) : null,
        numeroProveedores: proveedoresPorClave.size,
        proveedores: [...proveedoresPorClave.values()],
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
}

export function resumenAgrupacionCatalogo(ofertas = [], grupos = agruparOfertasCatalogo(ofertas)) {
  return {
    generadoEn: new Date().toISOString(),
    lineasOriginales: ofertas.length,
    gruposCreados: grupos.length,
    grupos: grupos.map(grupo => ({
      key: grupo.key,
      nombre: grupo.nombre,
      ofertas: grupo.ofertas.length,
      proveedoresDistintos: grupo.numeroProveedores,
      ofertaIds: grupo.ofertas.map(oferta => oferta.id),
    })),
  }
}

export function ofertaGrupo(grupo, ofertaId) {
  return grupo?.ofertas?.find(oferta => String(oferta.id) === String(ofertaId)) || null
}

export function ofertaMasBarata(grupo) {
  return grupo?.ofertas
    ?.filter(ofertaDisponible)
    ?.filter(oferta => costePorBotella(oferta) !== null)
    ?.sort((a, b) => costePorBotella(a) - costePorBotella(b))[0] || null
}
