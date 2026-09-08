const STABLE_ID_FIELDS = [
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
  const explicit = numero(primerValor(oferta, ['unidades_por_caja', 'unidades', 'units_per_case']))
  if (explicit > 1) return Math.round(explicit)

  const text = String(oferta.formato || '').toLocaleLowerCase('es-ES')
  const match = text.match(/(?:caja|case|pack|estuche|estuche de)?\s*(\d+)\s*[x×]/i)
    || text.match(/(?:caja|case|pack|estuche)(?:\s+de)?\s*(\d+)\b/i)
  const units = match ? Number(match[1]) : 1
  return Number.isFinite(units) && units > 1 ? units : 1
}

export function costePorBotella(oferta = {}) {
  const coste = numero(oferta.coste_estimado ?? oferta.coste_compra)
  if (coste <= 0) return null
  return coste / unidadesFormato(oferta)
}

export function ofertaDisponible(oferta = {}) {
  return !UNAVAILABLE_RE.test(String(oferta.disponibilidad || ''))
}

function identidadOferta(oferta = {}, disambiguador = '') {
  const stable = primerValor(oferta, STABLE_ID_FIELDS)
  if (stable) {
    return { key: `stable:${normalizarCatalogoTexto(stable)}`, confidence: 'high' }
  }

  const name = normalizarCatalogoTexto(oferta.nombre)
  const secondary = {
    bodega: normalizarCatalogoTexto(oferta.bodega),
    anada: normalizarCatalogoTexto(oferta.anada),
    tipo: normalizarCatalogoTexto(oferta.tipo),
    formato: `${volumenFormatoMl(oferta.formato) || ''}:${unidadesFormato(oferta)}`,
    region: normalizarCatalogoTexto(oferta.region || oferta.zona),
    uva: normalizarCatalogoTexto(oferta.uva),
  }
  const populated = Object.values(secondary).filter(Boolean)

  // Un nombre aislado no es una identidad suficientemente fiable para fusionar ofertas.
  const hasReliableSecondary = Boolean(
    secondary.bodega || secondary.formato !== ':1' || secondary.anada || secondary.region || secondary.uva
  )
  if (!name || !hasReliableSecondary) {
    return { key: `offer:${String(oferta.id || disambiguador || 'ambiguous')}`, confidence: 'ambiguous' }
  }

  return {
    key: [name, ...Object.values(secondary)].join('|'),
    confidence: populated.length >= 2 || Boolean(secondary.bodega || secondary.formato !== ':1' || secondary.anada || secondary.region)
      ? 'medium'
      : 'ambiguous',
  }
}

export function claveIdentidadOferta(oferta = {}) {
  return identidadOferta(oferta).key
}

function nombreProveedor(oferta) {
  return oferta.proveedor?.nombre || oferta.proveedor_nombre || oferta.proveedor || 'Sin proveedor'
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
      const proveedores = new Set(ofertas.map(nombreProveedor).filter(Boolean))
      return {
        ...grupo,
        ofertas,
        ofertaPorDefecto: defaultOferta,
        costeMinimo: conPrecio.length ? costePorBotella(conPrecio[0]) : null,
        numeroProveedores: proveedores.size,
        proveedores: [...proveedores],
      }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }))
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
