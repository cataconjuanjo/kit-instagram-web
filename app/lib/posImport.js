export const POS_MAX_ROWS = 2500

export function texto(valor, limite = 500) {
  return String(valor ?? '').trim().slice(0, limite)
}

export function normalizarTexto(valor = '') {
  return texto(valor, 500)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(botella|copa|vino|vinos|do|doca|d o|ml|cl|75cl|75 cl)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  let s = String(valor ?? '').trim()
  if (!s) return 0
  s = s.replace(/[^\d,.-]/g, '')
  if (!s) return 0
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else {
    s = s.replace(',', '.')
  }
  return Number(s) || 0
}

export function redondear(valor, decimales = 2) {
  const factor = 10 ** decimales
  return Math.round(numero(valor) * factor) / factor
}

export function fechaISO(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10)
  if (typeof valor === 'number' && valor > 20000) {
    const date = new Date((valor - 25569) * 86400 * 1000)
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }
  const raw = texto(valor, 40)
  if (!raw) return new Date().toISOString().slice(0, 10)
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const es = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
  if (es) {
    const year = es[3].length === 2 ? `20${es[3]}` : es[3]
    return `${year}-${es[2].padStart(2, '0')}-${es[1].padStart(2, '0')}`
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10)
}

function horaDesde(valor) {
  const raw = texto(valor, 60)
  const match = raw.match(/(\d{1,2})[:h](\d{2})?/)
  if (!match) return null
  const hora = Number(match[1])
  return Number.isFinite(hora) ? hora : null
}

export function servicioTipo({ fecha, hora, servicio } = {}) {
  const servicioNormalizado = normalizarTexto(servicio)
  if (servicioNormalizado.includes('comida') || servicioNormalizado.includes('almuerzo')) return 'comida'
  if (servicioNormalizado.includes('cena') || servicioNormalizado.includes('noche')) return 'cena'
  const horaLinea = horaDesde(hora) ?? horaDesde(fecha)
  if (horaLinea == null) return 'otro'
  if (horaLinea >= 12 && horaLinea < 17) return 'comida'
  if (horaLinea >= 20 || horaLinea < 2) return 'cena'
  return 'otro'
}

const CAMPOS_POSIBLES = {
  fecha: ['fecha', 'date', 'dia', 'ticket date', 'fecha venta', 'created at'],
  hora: ['hora', 'time', 'hour', 'fecha hora', 'timestamp'],
  producto: ['producto', 'articulo', 'item', 'descripcion', 'concepto', 'nombre', 'plu name'],
  cantidad: ['cantidad', 'qty', 'unidades', 'uds', 'ud', 'quantity', 'cant'],
  importe: ['importe', 'total', 'venta', 'subtotal', 'neto', 'gross', 'amount', 'importe total'],
  precio_unitario: ['precio unitario', 'pvp', 'precio', 'unit price', 'price'],
  servicio: ['servicio', 'turno', 'service', 'meal period'],
}

export function detectarMapping(columnas = []) {
  const normalizadas = columnas.map(col => ({ original: col, normalizada: normalizarTexto(col) }))
  const mapping = {}
  Object.entries(CAMPOS_POSIBLES).forEach(([campo, opciones]) => {
    const encontrado = normalizadas.find(col => opciones.some(opcion => col.normalizada === normalizarTexto(opcion))) ||
      normalizadas.find(col => opciones.some(opcion => col.normalizada.includes(normalizarTexto(opcion))))
    if (encontrado) mapping[campo] = encontrado.original
  })
  return mapping
}

export function prepararFilas(rawRows = [], mapping = {}) {
  return rawRows.slice(0, POS_MAX_ROWS).map((row, index) => {
    const producto = texto(row[mapping.producto], 240)
    const cantidad = Math.max(1, numero(row[mapping.cantidad]) || 1)
    const importeRaw = numero(row[mapping.importe])
    const unitario = numero(row[mapping.precio_unitario])
    const importe = importeRaw || redondear(unitario * cantidad, 2)
    const fechaRaw = row[mapping.fecha] || row[mapping.hora]
    return {
      source_index: index,
      fecha: fechaISO(fechaRaw),
      servicio_tipo: servicioTipo({ fecha: fechaRaw, hora: row[mapping.hora], servicio: row[mapping.servicio] }),
      producto_original: producto,
      producto_normalizado: normalizarTexto(producto),
      cantidad,
      importe: redondear(importe, 2),
      precio_unitario: redondear(importe ? importe / cantidad : unitario, 2),
      raw: row,
    }
  }).filter(row => row.producto_original)
}

function tokens(textoNormalizado) {
  return textoNormalizado.split(' ').filter(token => token.length >= 3)
}

function similitudTokens(a, b) {
  const ta = new Set(tokens(a))
  const tb = tokens(b)
  if (!ta.size || !tb.length) return 0
  const comunes = tb.filter(token => ta.has(token)).length
  return comunes / Math.max(ta.size, tb.length)
}

function precioCercano(precioLinea, vino) {
  const precio = numero(precioLinea)
  if (!precio) return { score: 0, formato: 'desconocido' }
  const opciones = [
    { formato: 'botella', precio: numero(vino.precio_botella) },
    { formato: 'copa', precio: numero(vino.precio_copa) },
  ].filter(item => item.precio > 0)
  let mejor = { score: 0, formato: 'desconocido' }
  opciones.forEach(item => {
    const delta = Math.abs(precio - item.precio)
    const pct = item.precio ? delta / item.precio : 1
    let score = 0
    if (delta <= 0.3) score = 14
    else if (pct <= 0.08) score = 10
    else if (pct <= 0.15) score = 6
    if (score > mejor.score) mejor = { score, formato: item.formato }
  })
  return mejor
}

export function prepararAliases(aliases = []) {
  const mapa = new Map()
  aliases.filter(alias => alias.activo !== false).forEach(alias => {
    const clave = normalizarTexto(alias.alias_normalizado || alias.alias)
    if (clave && alias.vino_id) mapa.set(clave, alias.vino_id)
  })
  return mapa
}

export function buscarMatchLinea(linea, vinos = [], aliases = []) {
  const aliasMap = prepararAliases(aliases)
  const aliasVinoId = aliasMap.get(linea.producto_normalizado)
  if (aliasVinoId) {
    const vino = vinos.find(item => String(item.id) === String(aliasVinoId))
    if (vino) return { vino, confidence: 99, estado: 'match', motivo: 'alias exacto', formato_venta: formatoPorPrecio(linea, vino) }
  }

  const candidatos = vinos.map(vino => {
    const nombre = normalizarTexto(vino.nombre)
    const bodega = normalizarTexto(vino.bodega)
    const referencia = normalizarTexto(vino.referencia_proveedor)
    const combinado = normalizarTexto(`${vino.nombre || ''} ${vino.bodega || ''}`)
    const precio = precioCercano(linea.precio_unitario, vino)
    let score = 0
    let motivo = 'revision manual'

    if (referencia && referencia === linea.producto_normalizado) {
      score = 96
      motivo = 'referencia proveedor'
    } else if (nombre && nombre === linea.producto_normalizado) {
      score = 94
      motivo = 'nombre exacto'
    } else if (nombre && (linea.producto_normalizado.includes(nombre) || nombre.includes(linea.producto_normalizado))) {
      score = 84
      motivo = 'nombre incluido'
    } else if (combinado && (linea.producto_normalizado.includes(combinado) || combinado.includes(linea.producto_normalizado))) {
      score = 88
      motivo = 'nombre y bodega'
    } else {
      const similitud = Math.max(similitudTokens(linea.producto_normalizado, nombre), similitudTokens(linea.producto_normalizado, combinado))
      score = Math.round(similitud * 78)
      if (similitud >= 0.55) motivo = 'tokens coincidentes'
    }

    if (bodega && linea.producto_normalizado.includes(bodega)) score += 5
    score += precio.score

    return {
      vino,
      confidence: Math.min(98, Math.round(score)),
      motivo,
      formato_venta: precio.formato,
    }
  }).sort((a, b) => b.confidence - a.confidence)

  const mejor = candidatos[0]
  if (!mejor || mejor.confidence < 50) {
    return { vino: null, confidence: 0, estado: 'sin_match', motivo: 'sin coincidencia', formato_venta: 'desconocido' }
  }

  return {
    ...mejor,
    estado: mejor.confidence >= 85 ? 'match' : 'revision',
  }
}

function formatoPorPrecio(linea, vino) {
  return precioCercano(linea.precio_unitario, vino).formato
}

export function aplicarOverrides(lineas = [], vinos = [], overrides = {}) {
  return lineas.map(linea => {
    const override = overrides?.[linea.source_index]
    if (!override) return linea
    const vino = vinos.find(item => String(item.id) === String(override))
    if (!vino) return { ...linea, vino: null, vino_id: null, estado_match: 'sin_match', match_confidence_pct: 0, match_motivo: 'manual sin vino' }
    return {
      ...linea,
      vino,
      vino_id: vino.id,
      vino_nombre: vino.nombre,
      estado_match: 'manual',
      match_confidence_pct: 100,
      match_motivo: 'seleccion manual',
      formato_venta: formatoPorPrecio(linea, vino),
    }
  })
}

export function construirPreview(rawRows = [], mapping = {}, vinos = [], aliases = []) {
  const filas = prepararFilas(rawRows, mapping).map(linea => {
    const match = buscarMatchLinea(linea, vinos, aliases)
    return {
      ...linea,
      vino: match.vino || null,
      vino_id: match.vino?.id || null,
      vino_nombre: match.vino?.nombre || '',
      estado_match: match.estado,
      match_confidence_pct: match.confidence,
      match_motivo: match.motivo,
      formato_venta: match.formato_venta || 'desconocido',
    }
  })
  return {
    filas,
    resumen: resumenFilas(filas),
  }
}

export function resumenFilas(filas = []) {
  return filas.reduce((acc, fila) => {
    acc.filas_total += 1
    acc.importe_total += numero(fila.importe)
    if (fila.duplicada) {
      acc.filas_duplicadas += 1
      return acc
    }
    if (fila.estado_match === 'match' || fila.estado_match === 'manual') {
      acc.filas_match += 1
      acc.filas_importables += 1
    } else if (fila.estado_match === 'revision') {
      acc.filas_revision += 1
    } else {
      acc.filas_sin_match += 1
    }
    return acc
  }, { filas_total: 0, filas_match: 0, filas_revision: 0, filas_sin_match: 0, filas_duplicadas: 0, filas_importables: 0, importe_total: 0 })
}
