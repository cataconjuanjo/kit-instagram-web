const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse/lib/pdf-parse.js')
const XLSX = require('xlsx')

const inputPdf = process.argv[2] || 'LISTADO VINOS.pdf'
const outputDir = process.argv[3] || path.join('output', 'catalogos')

const TIPO_MAP = {
  B: 'blanco',
  BLANCO: 'blanco',
  T: 'tinto',
  TINTO: 'tinto',
  R: 'rosado',
  ROSADO: 'rosado',
  E: 'espumoso',
  EB: 'espumoso',
  ER: 'espumoso',
  ESPUMOSO: 'espumoso',
  G: 'generoso',
  GENEROSO: 'generoso',
  D: 'dulce',
  DULCE: 'dulce',
  V: 'vermut',
  VERMUT: 'vermut',
  L: 'licor',
  LICOR: 'licor',
}

function limpiar(texto) {
  return String(texto || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim()
}

function normalizarDecimal(texto) {
  return String(texto || '').replace(/\./g, '').replace(',', '.')
}

function numeroPrecio(texto) {
  const limpio = limpiar(texto).match(/\d{1,4}(?:[.,]\d{1,2})?/)
  if (!limpio) return 0
  const numero = Number(normalizarDecimal(limpio[0]))
  return Number.isFinite(numero) ? numero : 0
}

function extraerAnada(nombre) {
  const years = [...String(nombre || '').matchAll(/\b(19|20)\d{2}\b/g)]
    .map(match => match[0])
  return [...new Set(years)].join('/')
}

function esTipoToken(texto) {
  const key = limpiar(texto).toUpperCase()
  return Boolean(TIPO_MAP[key])
}

function tipoApp(tipoOriginal) {
  return TIPO_MAP[limpiar(tipoOriginal).toUpperCase()] || limpiar(tipoOriginal).toLowerCase()
}

function inferirTipoDesdeNombre(nombre) {
  const texto = limpiar(nombre).toUpperCase()
  if (!texto) return ''
  if (/\b(TINTO\/BLANCO\/ROSADO|TINTO\/BLANCO|BLANCO\/ROSADO)\b/.test(texto)) return 'mixto'
  if (/\b(ORUJO|AGUARDIENTE|LICOR|MARC DE)\b/.test(texto)) return 'L'
  if (/\b(VERMUT|VERMOUT)\b/.test(texto)) return 'V'
  if (/\b(PET[- ]?NAT|ANCESTRAL|CAVA|CHAMPAGNE|ESPUMOSO)\b/.test(texto)) return 'E'
  if (/\b(ROSADO|ROSÉ|ROSE)\b/.test(texto)) return 'R'
  if (/\b(PX|PEDRO XIM[EÉ]NEZ|MOSCATEL|DULCE|PUTTONYOS)\b/.test(texto)) return 'D'
  if (/\b(FINO|MANZANILLA|AMONTILLADO|OLOROSO|PALO CORTADO)\b/.test(texto)) return 'G'
  if (/\b(TINTO|RED)\b/.test(texto)) return 'T'
  if (/\b(BLANCO|WHITE|ALBARI[NÑ]O|GODELLO|VERDEJO|RIESLING|CHARDONNAY)\b/.test(texto)) return 'B'
  return ''
}

function parseFormato(formatoOriginal, nombre) {
  const formato = limpiar(formatoOriginal)
  const textoCompleto = `${nombre || ''} ${formato}`.toUpperCase()
  const packFormato = formato.match(/(\d+)\s*x\s*(\d+(?:[,.]\d+)?)\s*cl/i)
  const packNombre = textoCompleto.match(/\b(?:CAJA\s*)?(\d+)\s*BOT(?:\.|S|ELLAS)?\b/)
  const capacidadMatch = formato.match(/(\d+(?:[,.]\d+)?)\s*cl/i)
  const capacidadCl = capacidadMatch ? Number(normalizarDecimal(capacidadMatch[1])) : 0
  const unidadesPack = packFormato
    ? Number(packFormato[1])
    : packNombre
      ? Number(packNombre[1])
      : 1

  let formatoNormalizado = formato
  if (capacidadCl) {
    if (unidadesPack > 1) formatoNormalizado = `botella ${String(capacidadCl).replace('.', ',')} cl (caja ${unidadesPack})`
    else if (capacidadCl === 37.5) formatoNormalizado = 'media botella 37,5 cl'
    else if (capacidadCl === 50) formatoNormalizado = 'botella 50 cl'
    else if (capacidadCl === 75) formatoNormalizado = 'botella 75 cl'
    else if (capacidadCl === 100) formatoNormalizado = 'botella 100 cl'
    else if (capacidadCl === 150) formatoNormalizado = 'magnum 150 cl'
    else if (capacidadCl === 300) formatoNormalizado = 'doble magnum 300 cl'
    else formatoNormalizado = `botella ${String(capacidadCl).replace('.', ',')} cl`
  }

  return {
    formatoOriginal: formato,
    formatoNormalizado,
    capacidadCl,
    unidadesPack: Number.isFinite(unidadesPack) && unidadesPack > 0 ? unidadesPack : 1,
  }
}

function euro(numero) {
  if (!numero) return ''
  return Number(numero.toFixed(2))
}

function csvEscape(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  if (/[",\r\n;]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`
  return texto
}

function escribirCsv(filePath, filas) {
  const headers = Object.keys(filas[0] || {})
  const contenido = [
    headers.map(csvEscape).join(';'),
    ...filas.map(fila => headers.map(header => csvEscape(fila[header])).join(';')),
  ].join('\n')
  fs.writeFileSync(filePath, `\uFEFF${contenido}`, 'utf8')
}

function agruparFilas(items) {
  const ordenados = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const filas = []

  for (const item of ordenados) {
    if (!limpiar(item.s)) continue
    let fila = filas.find(actual => Math.abs(actual.y - item.y) <= 5)
    if (!fila) {
      fila = { y: item.y, items: [] }
      filas.push(fila)
    }
    fila.items.push(item)
    fila.y = (fila.y * (fila.items.length - 1) + item.y) / fila.items.length
  }

  return filas
    .map(fila => ({ ...fila, items: fila.items.sort((a, b) => a.x - b.x) }))
    .sort((a, b) => b.y - a.y)
}

function itemKey(item) {
  return `${item.x}:${item.y}:${item.s}`
}

function parseFila(pageNumber, fila, contexto) {
  const consumidos = new Set()
  const items = fila.items

  const regionItems = items.filter(item => item.x < 75)
  regionItems.forEach(item => consumidos.add(itemKey(item)))

  const bodegaItems = items.filter(item => item.x >= 75 && item.x < 140)
  bodegaItems.forEach(item => consumidos.add(itemKey(item)))

  const tipoItems = items.filter(item => item.x >= 140 && item.x < 180 && esTipoToken(item.s))
  tipoItems.forEach(item => consumidos.add(itemKey(item)))

  const formatoItems = items.filter(item =>
    item.x >= 450 &&
    item.x < 520 &&
    /\b(\d+\s*x\s*)?\d+(?:[,.]\d+)?\s*cl\b/i.test(item.s)
  )
  formatoItems.forEach(item => consumidos.add(itemKey(item)))

  const precioItems = items.filter(item => item.x >= 520)
  precioItems.forEach(item => consumidos.add(itemKey(item)))

  const nombreItems = items.filter(item => {
    if (consumidos.has(itemKey(item))) return false
    return item.x >= 160 && item.x < 460
  })

  const rawRegion = limpiar(regionItems.map(item => item.s).join(' '))
  const rawBodega = limpiar(bodegaItems.map(item => item.s).join(' '))
  const rawTipo = limpiar(tipoItems.map(item => item.s).join(' '))
  const nombre = limpiar(nombreItems.map(item => item.s).join(' '))
  const formatoOriginal = limpiar(formatoItems.map(item => item.s).join(' '))
  const precioTexto = limpiar(precioItems.map(item => item.s).join(' '))
  const rawLine = limpiar(items.map(item => item.s).join(' | '))

  if (!nombre || !formatoOriginal) return null

  const region = rawRegion || contexto.region
  const bodega = rawBodega || contexto.bodega
  const tipoOriginal = rawTipo || inferirTipoDesdeNombre(nombre)
  const formato = parseFormato(formatoOriginal, nombre)
  const precioPdf = /agotado/i.test(precioTexto) ? 0 : numeroPrecio(precioTexto)
  const disponibilidad = /agotado/i.test(precioTexto)
    ? 'agotado'
    : precioPdf > 0
      ? ''
      : 'consultar'

  const costePorBotella = precioPdf > 0 && formato.unidadesPack > 1
    ? precioPdf / formato.unidadesPack
    : precioPdf
  const costeEquiv75 = costePorBotella > 0 && formato.capacidadCl > 0
    ? costePorBotella / formato.capacidadCl * 75
    : 0

  const incidencias = []
  if (!rawRegion) incidencias.push('region_rellenada_por_contexto')
  if (!rawBodega) incidencias.push('bodega_rellenada_por_contexto')
  if (!rawTipo && tipoOriginal) incidencias.push('tipo_inferido_por_nombre')
  if (!rawTipo && !tipoOriginal) incidencias.push('tipo_no_detectado')
  if (!precioPdf) incidencias.push(disponibilidad === 'agotado' ? 'agotado' : 'sin_precio')
  if (formato.unidadesPack > 1) incidencias.push('pack_detectado_coste_prorrateado')
  if (!formato.capacidadCl) incidencias.push('capacidad_no_detectada')
  if (tipoApp(tipoOriginal) === 'licor') incidencias.push('tipo_no_vino_licor_orujo')

  const confianza = incidencias.some(item => item === 'sin_precio' || item === 'capacidad_no_detectada')
      ? 'baja'
    : incidencias.some(item => item === 'pack_detectado_coste_prorrateado' || item.includes('contexto') || item.includes('inferido') || item.includes('tipo_no_vino'))
      ? 'media'
      : 'alta'

  return {
    pageNumber,
    y: Number(fila.y.toFixed(1)),
    rawRegion,
    rawBodega,
    rawTipo,
    region,
    bodega,
    tipoOriginal,
    tipo: tipoApp(tipoOriginal),
    nombre,
    anada: extraerAnada(nombre),
    referencia: '',
    formatoOriginal: formato.formatoOriginal,
    formato: formato.formatoNormalizado,
    capacidadCl: formato.capacidadCl || '',
    unidadesPack: formato.unidadesPack,
    precioPdf: euro(precioPdf),
    costeEstimado: euro(costePorBotella),
    costeEquiv75: euro(costeEquiv75),
    pvpRecomendado: '',
    disponibilidad,
    confianza,
    incidencias: incidencias.join(', '),
    rawLine,
  }
}

async function main() {
  const input = path.resolve(inputPdf)
  const pages = []
  let pageNumber = 0

  const options = {
    pagerender: async page => {
      pageNumber += 1
      const content = await page.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      })
      pages.push({
        pageNumber,
        items: content.items.map(item => ({
          s: item.str,
          x: Number(item.transform[4].toFixed(1)),
          y: Number(item.transform[5].toFixed(1)),
          w: Number((item.width || 0).toFixed(1)),
        })),
      })
      return ''
    },
  }

  await pdf(fs.readFileSync(input), options)

  const filasRevision = []
  const contexto = { region: '', bodega: '' }

  for (const page of pages) {
    const filas = agruparFilas(page.items)
    for (const fila of filas) {
      const parsed = parseFila(page.pageNumber, fila, contexto)
      if (!parsed) continue

      if (parsed.rawRegion) contexto.region = parsed.rawRegion
      if (parsed.rawBodega) contexto.bodega = parsed.rawBodega
      filasRevision.push(parsed)
    }
  }

  const vistos = new Set()
  const duplicados = []
  for (const fila of filasRevision) {
    const key = [fila.region, fila.bodega, fila.nombre, fila.formato, fila.costeEstimado, fila.disponibilidad].join('|').toLowerCase()
    if (vistos.has(key)) duplicados.push(fila)
    vistos.add(key)
  }

  const filasApp = filasRevision.map(fila => {
    const notas = [
      `PDF pag. ${fila.pageNumber}`,
      fila.precioPdf && fila.unidadesPack > 1 ? `precio PDF ${fila.precioPdf} EUR / caja ${fila.unidadesPack}` : '',
      fila.formatoOriginal && fila.formatoOriginal !== fila.formato ? `formato PDF: ${fila.formatoOriginal}` : '',
      fila.incidencias ? `revision: ${fila.incidencias}` : '',
    ].filter(Boolean).join(' | ')

    return {
      nombre: fila.nombre,
      bodega: fila.bodega,
      tipo: fila.tipo,
      region: fila.region,
      uva: '',
      anada: fila.anada,
      referencia: fila.referencia,
      formato: fila.formato,
      coste_estimado: fila.costeEstimado,
      pvp_recomendado: fila.pvpRecomendado,
      disponibilidad: fila.disponibilidad,
      notas,
    }
  })
  const filasAppConPrecio = filasApp.filter(fila => Number(fila.coste_estimado) > 0)

  fs.mkdirSync(outputDir, { recursive: true })
  const csvApp = path.join(outputDir, 'listado_vinos_import_app.csv')
  const xlsxApp = path.join(outputDir, 'listado_vinos_import_app.xlsx')
  const csvAppConPrecio = path.join(outputDir, 'listado_vinos_import_app_con_precio.csv')
  const xlsxAppConPrecio = path.join(outputDir, 'listado_vinos_import_app_con_precio.xlsx')
  const csvRevision = path.join(outputDir, 'listado_vinos_revision.csv')
  const xlsxRevision = path.join(outputDir, 'listado_vinos_revision.xlsx')
  const reportPath = path.join(outputDir, 'listado_vinos_reporte.json')

  escribirCsv(csvApp, filasApp)
  escribirCsv(csvAppConPrecio, filasAppConPrecio)
  escribirCsv(csvRevision, filasRevision)

  const workbookApp = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbookApp, XLSX.utils.json_to_sheet(filasApp), 'Import app')
  XLSX.writeFile(workbookApp, xlsxApp)

  const workbookAppConPrecio = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbookAppConPrecio, XLSX.utils.json_to_sheet(filasAppConPrecio), 'Import app')
  XLSX.writeFile(workbookAppConPrecio, xlsxAppConPrecio)

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(filasApp), 'Import app')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(filasRevision), 'Revision')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(duplicados), 'Duplicados')
  XLSX.writeFile(workbook, xlsxRevision)

  const resumen = {
    input,
    pages: pages.length,
    filasDetectadas: filasRevision.length,
    confianza: filasRevision.reduce((acc, fila) => {
      acc[fila.confianza] = (acc[fila.confianza] || 0) + 1
      return acc
    }, {}),
    sinPrecio: filasRevision.filter(fila => !fila.precioPdf).length,
    agotados: filasRevision.filter(fila => fila.disponibilidad === 'agotado').length,
    importablesConPrecio: filasAppConPrecio.length,
    packs: filasRevision.filter(fila => fila.unidadesPack > 1).length,
    duplicadosExactos: duplicados.length,
    tiposOriginales: [...new Set(filasRevision.map(fila => fila.tipoOriginal).filter(Boolean))].sort(),
    formatosOriginales: [...new Set(filasRevision.map(fila => fila.formatoOriginal).filter(Boolean))].sort(),
    output: {
      csvApp: path.resolve(csvApp),
      xlsxApp: path.resolve(xlsxApp),
      csvAppConPrecio: path.resolve(csvAppConPrecio),
      xlsxAppConPrecio: path.resolve(xlsxAppConPrecio),
      csvRevision: path.resolve(csvRevision),
      xlsxRevision: path.resolve(xlsxRevision),
      report: path.resolve(reportPath),
    },
  }

  fs.writeFileSync(reportPath, JSON.stringify(resumen, null, 2), 'utf8')
  console.log(JSON.stringify(resumen, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
