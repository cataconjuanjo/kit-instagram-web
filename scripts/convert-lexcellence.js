const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse/lib/pdf-parse.js')
const XLSX = require('xlsx')

const inputPdf = process.argv[2] || 'CATALOGO L´EXCELLENCE MAYO 2026 - PENINSULA.pdf'
const outputDir = process.argv[3] || path.join('output', 'catalogos')

const CATALOGO = "L'Excellence Mayo 2026 Peninsula"
const PROVEEDOR = "Must of Wines / L'Excellence"

function limpiar(texto) {
  return String(texto || '')
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizarKey(texto) {
  return limpiar(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function numeroPrecio(valor) {
  const match = limpiar(valor).match(/\d{1,3}(?:\.\d{3})*,\d{2}/)
  if (!match) return 0
  const numero = Number(match[0].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(numero) ? numero : 0
}

function euro(valor) {
  return valor ? Number(valor.toFixed(2)) : ''
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
  const filas = []
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (!limpiar(item.s)) continue
    let fila = filas.find(actual => Math.abs(actual.y - item.y) <= 3.2)
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

function textoFila(fila, { minX = 0, maxX = 999 } = {}) {
  return limpiar(fila.items.filter(item => item.x >= minX && item.x < maxX).map(item => item.s).join(' '))
}

function esPrecio(texto) {
  return /^\d{1,3}(?:\.\d{3})*,\d{2}\s*€?$/.test(limpiar(texto))
}

function esPaisBasico(texto) {
  return ['FRANCIA', 'ALEMANIA', 'ITALIA', 'ESPAÑA', 'ESTADOS UNIDOS'].includes(normalizarKey(texto))
}

function esPais(texto) {
  return ['FRANCIA', 'ALEMANIA', 'ITALIA', 'ESPANA', 'ESPAÑA', 'ESTADOS UNIDOS'].includes(normalizarKey(texto))
}

function esCategoria(texto) {
  const key = normalizarKey(texto)
  return [
    'CHAMPAGNE',
    'CREMANT',
    'COSTA DE PROVENZA',
    'LANGUEDOC-ROUSSILLON',
    'RODANO SUR',
    'RODANO NORTE',
    'BEAUJOLAIS',
    'COTEAUX CHAMPENOIS',
    'BORGONA',
    'JURA',
    'SIDRA DE NORMANDIA',
    'VALLE DEL LOIRA',
    'ALSACIA',
    'SUR - OESTE',
    'CAHORS',
    'BURDEOS',
    'LICORES Y AGUARDIENTES',
  ].includes(key)
}

function esSubcategoria(texto) {
  const key = normalizarKey(texto)
  return /^D\.?\s*O\b|^D O\b|^D\.?O\.?C|^D\.?O\.?Q/.test(key) ||
    [
      'PENEDES',
      'VI DE LA TERRA EIVISSA',
      'VALLE DEL RODANO',
      'VALLE DEL RÓDANO',
      'RIOJA',
      'PRIORAT',
      'TERRA DE MALLORCA',
      'RUEDA',
      'RIAS BAIXAS',
      'CONCA DE BARBERA',
      'MONTSANT',
    ].includes(key)
}

function esTextoIgnorable(texto) {
  const t = normalizarKey(texto)
  return !t ||
    /^MAYO - 2026/.test(t) ||
    /^MUST OF WINES/.test(t) ||
    /^- \d+ -$/.test(t) ||
    /^CATALOGO PROFESIONAL/.test(t) ||
    /^PENINSULA$/.test(t) ||
    /^PDF\.?$/.test(t) ||
    /^PDF$/.test(t) ||
    /^CONTACTO$/.test(t)
}

function pareceProductorBasico(texto) {
  const t = limpiar(texto)
  if (esTextoIgnorable(t) || esPais(t) || esCategoria(t) || esSubcategoria(t)) return false
  if (numeroPrecio(t)) return false
  if (t.length < 6 || t.length > 130) return false
  return /\s+[-–—]\s+/.test(t)
}

function filaTienePrecio(fila) {
  return fila.items.some(item => item.x >= 480 && esPrecio(item.s))
}

function primerX(fila) {
  const xs = (fila?.items || []).map(item => item.x).filter(x => Number.isFinite(x))
  return xs.length ? Math.min(...xs) : 999
}

function ratioMayusculas(texto) {
  const letras = limpiar(texto).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')
  if (!letras.length) return 1
  const mayusculas = letras.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '')
  return mayusculas.length / letras.length
}

function pareceProsa(texto) {
  const t = limpiar(texto)
  if (t.length < 55) return false
  if (/[.!?;:]/.test(t) && ratioMayusculas(t) < 0.45) return true
  return t.length > 85 && ratioMayusculas(t) < 0.35
}

function esDetalleFuerte(texto) {
  const key = normalizarKey(texto)
  return /^(?:\d+\s*%|BIODINAMICO|ECOLOGICO|NATURAL)\b/.test(key)
}

function esDetalleTexto(texto) {
  const key = normalizarKey(texto)
  if (!key) return false
  if (esDetalleFuerte(texto)) return true
  if (/%/.test(key)) return true
  if (/\b(BIODINAMICO|ECOLOGICO|NATURAL)\b/.test(key)) return true
  return /\b(PINOT|CHARDONNAY|MEUNIER|RIESLING|SYRAH|GRENACHE|GAMAY|CABERNET|MERLOT|CHENIN|SAUVIGNON|ALIGOTE|GARNACHA|MOURVEDRE|CARIGNAN|MACABEO|VERDEJO|MARSANNE|ROUSSANE|GEWURZTRAMINER|MELON|MUSCAT|AUXERROIS|POULSARD|TROUSSEAU|MALBEC|CINSAULT|CLAIRETTE|VIOGNIER|TEMPRANILLO|NEBBIOLO)\b/.test(key) &&
    /[,;/]|\b\d+\s*%/.test(key)
}

function limpiarDetalle(texto) {
  return limpiar(texto)
    .replace(/\bPdf\.?\b/ig, '')
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function textoSinPdf(texto) {
  return limpiar(texto)
    .replace(/\bPdf\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pareceProductor(texto, fila = null, filas = null, index = -1) {
  const t = limpiar(texto)
  if (esTextoIgnorable(t) || esPais(t) || esCategoria(t) || esSubcategoria(t)) return false
  if (numeroPrecio(t)) return false
  if (t.length < 6 || t.length > 130) return false
  if (esDetalleTexto(t) || pareceProsa(t)) return false
  if (fila && filas && index >= 0) {
    const siguiente = filas
      .slice(index + 1)
      .find(row => !esTextoIgnorable(textoFila(row, { minX: 40, maxX: 540 })))
    if (siguiente && filaTienePrecio(siguiente)) return false
  }

  const sinPdf = textoSinPdf(t)
  const key = normalizarKey(sinPdf)
  const tienePdf = /\bPDF\.?$/.test(normalizarKey(t))
  const tieneGuionSeparador = /\s+[-â€“â€”–—]\s+/.test(sinPdf)

  if (tienePdf) return primerX(fila) < 130

  if (tieneGuionSeparador) {
    const partes = sinPdf.split(/\s+[-â€“â€”–—]\s+/).map(limpiar).filter(Boolean)
    if (partes.length < 2) return false
    if (partes.some(parte => pareceProsa(parte) || parte.length > 85)) return false
    const izquierda = partes[0]
    const derecha = partes.slice(1).join(' - ')
    const izquierdaKey = normalizarKey(izquierda)
    const izquierdaPareceZona = ratioMayusculas(izquierda) >= 0.5 ||
      /\b(CRU|AOC|COTE|COTES|COTEAUX|VAL|VALLEE|DOMAINE|CHAMPAGNE|BORGOGNE|BOURGOGNE|BORDEAUX|BANDOL|BEAUJOLAIS|JURA|LOIRE|ALSACE|RHONE)\b/.test(izquierdaKey)
    return izquierdaPareceZona && ratioMayusculas(derecha) >= 0.25
  }

  if (!fila || !filas || index < 0) return false
  if (primerX(fila) > 120) return false
  if (/\b(19|20)\d{2}\b/.test(key)) return false
  if (!/\b(DOMAINE|CHATEAU|CHÂTEAU|CLOS|MAISON|MAISONS|CHAMPAGNE|BODEGA|BODEGAS|VIGNOBLE|VIGNERON|BROTHERS|FRERES|PERRIN|BRET|ANDREE|ANDRÉE)\b/.test(key) && ratioMayusculas(sinPdf) < 0.55) {
    return false
  }

  const siguientes = filas
    .slice(index + 1)
    .filter(row => !esTextoIgnorable(textoFila(row, { minX: 40, maxX: 540 })))
    .slice(0, 4)
  if (!siguientes.length || filaTienePrecio(siguientes[0])) return false
  return siguientes.some(row => filaTienePrecio(row))
}

function limpiarNombre(nombre) {
  return limpiar(nombre)
    .replace(/\(?\s*Poca disponibilidad(?:\s*y\s*Bajo(?:\s*reserva)?)?\s*\)?/ig, '')
    .replace(/\(?\s*(?:y\s*)?Bajo\s*reserva\s*\)?/ig, '')
    .replace(/\(\s*(?:y\s*)?Bajo\s*$/ig, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function limpiarProductor(texto) {
  return limpiar(texto)
    .replace(/\bPdf\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function productorDesdeHeading(heading) {
  const limpio = limpiarProductor(heading)
  const partes = limpio.split(/\s+-\s+|\s+–\s+|\s+—\s+/).map(limpiar).filter(Boolean)
  if (partes.length >= 2) {
    return {
      subregion: partes[0],
      productor: partes.slice(1).join(' - '),
    }
  }
  return {
    subregion: '',
    productor: limpio,
  }
}

function formatoDesdeNombre(nombre) {
  const texto = normalizarKey(nombre)
  if (/\bBIB\b.*\b5\s*LITROS?\b|\b5\s*LITROS?\b/.test(texto)) return { formato: 'bag-in-box 500 cl', capacidadCl: 500 }
  if (/\bJEROBOAM\b/.test(texto)) return { formato: 'jeroboam 300 cl', capacidadCl: 300 }
  if (/\bMAGNUM\b/.test(texto)) return { formato: 'magnum 150 cl', capacidadCl: 150 }
  if (/\b37,?5\s*CL\b|37,5CL/.test(texto)) return { formato: 'media botella 37,5 cl', capacidadCl: 37.5 }
  if (/\b35\s*CL\b|35CL/.test(texto)) return { formato: 'media botella 35 cl', capacidadCl: 35 }
  if (/\b50\s*CL\b|50CL/.test(texto)) return { formato: 'botella 50 cl', capacidadCl: 50 }
  if (/\b70\s*CL\b|70CL/.test(texto)) return { formato: 'botella 70 cl', capacidadCl: 70 }
  return { formato: 'botella 75 cl', capacidadCl: 75 }
}

function extraerAnada(textos) {
  const unido = textos.join(' ')
  const years = [...unido.matchAll(/\b(19|20)\d{2}\b/g)].map(match => match[0])
  return [...new Set(years)].join('/')
}

function inferirTipo({ pais, categoria, nombre, uva }) {
  const texto = normalizarKey(`${categoria} ${nombre} ${uva}`)
  if (/LICOR|AGUARDIENTE|CALVADOS|ARMAGNAC|COGNAC|MARC\b|EAU DE VIE/.test(texto)) return 'licor'
  if (/CHAMPAGNE|CREMANT|BRUT|EXTRA BRUT|PET NAT|PET-NAT|ANCESTRAL|ESPUMOSO|SEKT|GRAND CRU BRUT/.test(texto)) return 'espumoso'
  if (/ROS[EÉ]|ROSADO/.test(texto)) return 'rosado'
  if (/ORANGE/.test(texto)) return 'naranja'
  if (/SIDRA|CIDRE/.test(texto)) return 'sidra'
  if (/PINOT NOIR|SYRAH|GRENACHE|GARNACHA|MOURVEDRE|MERLOT|CABERNET|TEMPRANILLO|SANGIOVESE|NEBBIOLO|TROUSSEAU|POULSARD|GAMAY/.test(texto)) return 'tinto'
  if (/DULCE|MOELLEUX|VENDANGES TARDIVES|SAUTERNES|PX|PEDRO XIMENEZ/.test(texto)) return 'dulce'
  if (pais && normalizarKey(pais) === 'FRANCIA' && /CAHORS|BURDEOS|RODANO/.test(texto)) return 'tinto'
  return 'blanco'
}

function filaNombreCandidataBasica(fila) {
  const texto = textoFila(fila, { minX: 45, maxX: 430 })
  const key = normalizarKey(texto)
  if (!texto || esTextoIgnorable(texto) || esPais(texto) || esCategoria(texto)) return false
  if (numeroPrecio(texto)) return false
  if (/^(\d+%|BIODINAMICO|BIODINÁMICO|ECOLOGICO|ECOLÓGICO|PINOT|CHARDONNAY|MEUNIER|RIESLING|SYRAH|GRENACHE|GAMAY|CABERNET|MERLOT|CHENIN|SAUVIGNON|ALIGOTE|ALIGOTÉ|GARNACHA|GRENACHE|MOURVEDRE|CARIGNAN|MACABEO|VERDEJO)\b/i.test(texto)) return false
  if (texto.length > 170 && /[a-záéíóúñ]{3}/.test(texto)) return false
  const letras = texto.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')
  const mayusculas = letras.replace(/[^A-ZÁÉÍÓÚÜÑ]/g, '')
  const ratioMayus = letras.length ? mayusculas.length / letras.length : 1
  return ratioMayus >= 0.55 || key === texto.toUpperCase()
}

function detalleCandidatoBasico(fila) {
  const texto = textoFila(fila, { minX: 45, maxX: 430 })
  if (!texto || esTextoIgnorable(texto) || esPais(texto) || esCategoria(texto)) return ''
  if (numeroPrecio(texto)) return ''
  if (pareceProductor(texto)) return ''
  return texto
}

function filaNombreCandidata(fila) {
  const texto = textoFila(fila, { minX: 45, maxX: 430 })
  const encabezadoCentrado = (esPais(texto) || esCategoria(texto)) && primerX(fila) > 130
  if (esSubcategoria(texto)) return false
  if (!texto || esTextoIgnorable(texto) || encabezadoCentrado) return false
  if (numeroPrecio(texto)) return false
  const textoTitulo = limpiarNombre(texto)
  if (esDetalleFuerte(textoTitulo)) return false
  if (pareceProsa(textoTitulo)) return false
  if (textoTitulo.length > 150) return false
  if (primerX(fila) > 130) return false
  const ratioMayus = ratioMayusculas(textoTitulo)
  return ratioMayus >= 0.45 || /^[A-ZÁÉÍÓÚÜÑ0-9"'.&/() -]+$/.test(texto) || (texto.length <= 42 && !/[.!?;]/.test(texto))
}

function detalleCandidato(fila) {
  const texto = textoFila(fila, { minX: 45, maxX: 430 })
  if (!texto || esTextoIgnorable(texto) || esPais(texto) || esCategoria(texto) || esSubcategoria(texto)) return ''
  if (numeroPrecio(texto)) return ''
  if (pareceProductor(texto)) return ''
  if (!esDetalleTexto(texto) && filaNombreCandidata(fila)) return ''
  if (pareceProsa(texto)) return ''
  return limpiarDetalle(texto)
}

function deducirDisponibilidad(textos) {
  const texto = normalizarKey(textos.join(' '))
  if (/AGOTADO/.test(texto)) return 'agotado'
  if (/BAJO RESERVA|POCA DISPONIBILIDAD/.test(texto)) return 'limitado'
  return ''
}

function parseProducto(pageNumber, filas, index, contexto) {
  const filaPrecio = filas[index]
  const precioItems = filaPrecio.items.filter(item => item.x >= 480 && esPrecio(item.s))
  if (!precioItems.length) return null

  const precioTexto = limpiar(precioItems.map(item => item.s).join(' '))
  const coste = numeroPrecio(precioTexto)
  if (!coste) return null

  const precioY = filaPrecio.y
  const prevPriceY = filas
    .slice(0, index)
    .map(fila => filaTienePrecio(fila) ? fila.y : null)
    .filter(Boolean)
    .at(-1) || 999
  const nextPriceY = filas
    .slice(index + 1)
    .map(fila => filaTienePrecio(fila) ? fila.y : null)
    .filter(Boolean)[0] || -999

  const titleParts = []
  const leftOnPriceLine = limpiarDetalle(textoFila(filaPrecio, { minX: 45, maxX: 410 }))
  const leftIsDetail = esDetalleTexto(leftOnPriceLine)
  const leftIsYearOnly = /^(?:19|20)\d{2}\/?$/.test(leftOnPriceLine)
  let titleRow = null

  for (let i = index - 1; i >= 0; i -= 1) {
    const fila = filas[i]
    if (fila.y <= precioY + 1) continue
    if (fila.y >= Math.min(prevPriceY - 1, precioY + 36)) continue
    if (filaTienePrecio(fila)) break
    const texto = textoFila(fila, { minX: 45, maxX: 430 })
    if (!texto) continue
    const encabezadoCentrado = (esPais(texto) || esCategoria(texto)) && primerX(fila) > 130
    const siguienteDesdeCandidato = filas
      .slice(i + 1)
      .find(row => !esTextoIgnorable(textoFila(row, { minX: 40, maxX: 540 })))
    const candidatoPegadoAlPrecio = siguienteDesdeCandidato === filaPrecio ||
      filas.slice(i + 1, index + 1).some(row => fila.y > row.y && fila.y - row.y <= 18 && filaTienePrecio(row))
    if ((!candidatoPegadoAlPrecio && pareceProductor(texto, fila, filas, i)) || encabezadoCentrado || esSubcategoria(texto)) break
    if (filaNombreCandidata(fila)) {
      titleRow = { index: i, texto }
      break
    }
  }

  if (titleRow) {
    const previousTitleCandidate = filas[titleRow.index - 1]
    if (previousTitleCandidate && previousTitleCandidate.y - titleRow.y <= 13) {
      const previousText = textoFila(previousTitleCandidate, { minX: 45, maxX: 430 })
      if (filaNombreCandidata(previousTitleCandidate) && !esDetalleTexto(previousText) && !pareceProductor(previousText, previousTitleCandidate, filas, titleRow.index - 1)) {
        titleParts.push(previousText)
      }
    }
    titleParts.push(titleRow.texto)
  }

  if (!titleParts.length) {
    const previousVisible = filas
      .slice(0, index)
      .reverse()
      .find(row => !esTextoIgnorable(textoFila(row, { minX: 40, maxX: 540 })))
    const previousText = previousVisible ? textoFila(previousVisible, { minX: 45, maxX: 430 }) : ''
    if (previousVisible && primerX(previousVisible) < 130 && previousVisible.y > precioY && previousVisible.y - precioY <= 18 && previousText && !filaTienePrecio(previousVisible) && !esDetalleTexto(previousText) && !esSubcategoria(previousText) && !pareceProsa(previousText)) {
      titleParts.push(previousText)
    }
  }

  if (leftOnPriceLine && !leftIsDetail && !leftIsYearOnly) {
    titleParts.push(leftOnPriceLine)
  }

  if (!titleParts.length && leftOnPriceLine && !leftIsDetail && !leftIsYearOnly) {
    titleParts.push(leftOnPriceLine)
  }

  const detailRows = []
  if (leftIsDetail) detailRows.push(leftOnPriceLine)

  for (let i = index + 1; i < filas.length; i += 1) {
    const fila = filas[i]
    if (fila.y >= precioY - 1 || fila.y <= Math.max(nextPriceY + 1, precioY - 42)) continue
    if (filaNombreCandidata(fila) && !esDetalleTexto(textoFila(fila, { minX: 45, maxX: 430 }))) break
    const detalle = detalleCandidato(fila)
    if (detalle) detailRows.push(detalle)
  }

  const yearText = textoFila(filaPrecio, { minX: 410, maxX: 455 })
  const pdfMarker = textoFila(filaPrecio, { minX: 450, maxX: 485 })
  const nombreRaw = limpiar(titleParts.join(' '))
  const detalles = detailRows.slice(0, 4)
  const anada = extraerAnada([yearText, nombreRaw, ...detalles])
  const disponibilidad = deducirDisponibilidad([nombreRaw, ...detalles])
  const formato = formatoDesdeNombre(nombreRaw)
  const nombre = limpiarNombre(nombreRaw)
  const uva = detalles.find(detalle => /%|Pinot|Chardonnay|Meunier|Riesling|Garnacha|Grenache|Syrah|Merlot|Cabernet|Sauvignon|Chenin|Gamay|Aligot/i.test(detalle)) || ''
  const tipo = inferirTipo({ pais: contexto.pais, categoria: contexto.categoria, nombre, uva })

  const incidencias = []
  if (!nombre) incidencias.push('nombre_no_detectado')
  if (!contexto.productor) incidencias.push('productor_no_detectado')
  if (!uva) incidencias.push('uva_no_detectada')
  if (!pdfMarker && !/pdf/i.test(textoFila(filaPrecio))) incidencias.push('sin_marca_pdf')
  if (disponibilidad) incidencias.push(disponibilidad)

  const confianza = incidencias.some(item => ['nombre_no_detectado', 'productor_no_detectado'].includes(item))
    ? 'baja'
    : incidencias.length
      ? 'media'
      : 'alta'

  return {
    catalogo: CATALOGO,
    proveedor_sugerido: PROVEEDOR,
    pageNumber,
    y: Number(precioY.toFixed(1)),
    pais: contexto.pais,
    categoria: contexto.categoria,
    subregion: contexto.subregion,
    productor: contexto.productor,
    nombre,
    nombreRaw,
    tipo,
    uva,
    anada,
    formato: formato.formato,
    capacidadCl: formato.capacidadCl,
    costeEstimado: euro(coste),
    disponibilidad,
    detalles: detalles.join(' | '),
    precioPdf: precioTexto,
    confianza,
    incidencias: incidencias.join(', '),
    rawLine: limpiar([...titleParts, ...detalles, yearText, pdfMarker, precioTexto].join(' | ')),
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
  const contexto = { pais: '', categoria: '', subregion: '', productor: '' }

  for (const page of pages) {
    if (page.pageNumber <= 2) continue
    const filas = agruparFilas(page.items)

    for (let index = 0; index < filas.length; index += 1) {
      const fila = filas[index]
      const allText = textoFila(fila, { minX: 40, maxX: 540 })
      const centerText = textoFila(fila, { minX: 180, maxX: 360 })
      const leftText = textoFila(fila, { minX: 45, maxX: 430 })

      if (esPais(centerText)) {
        contexto.pais = limpiar(centerText)
        contexto.categoria = ''
      }
      if (esCategoria(centerText)) contexto.categoria = limpiar(centerText)
      if (esSubcategoria(leftText)) contexto.categoria = limpiar(leftText)

      const siguienteFila = filas
        .slice(index + 1)
        .find(row => !esTextoIgnorable(textoFila(row, { minX: 40, maxX: 540 })))
      const seguidoDePrecio = filas
        .slice(index + 1)
        .some(row => fila.y > row.y && fila.y - row.y <= 18 && filaTienePrecio(row))

      if (!seguidoDePrecio && pareceProductor(allText, fila, filas, index) && fila.y > 35) {
        const parsedHeading = productorDesdeHeading(allText)
        contexto.subregion = parsedHeading.subregion || contexto.subregion
        contexto.productor = parsedHeading.productor || contexto.productor
      }

      const tienePrecio = filaTienePrecio(fila)
      if (!tienePrecio) continue

      const producto = parseProducto(page.pageNumber, filas, index, contexto)
      if (producto) filasRevision.push(producto)
    }
  }

  const filasApp = filasRevision
    .filter(fila => fila.nombre)
    .map(fila => {
      const notas = [
        `catalogo: ${fila.catalogo}`,
        `proveedor sugerido: ${fila.proveedor_sugerido}`,
        `PDF LEX pag. ${fila.pageNumber}`,
        fila.subregion ? `subregion: ${fila.subregion}` : '',
        fila.detalles ? `detalle: ${fila.detalles}` : '',
        fila.precioPdf ? `precio PDF: ${fila.precioPdf}` : '',
        fila.incidencias ? `revision: ${fila.incidencias}` : '',
      ].filter(Boolean).join(' | ')

      return {
        nombre: fila.nombre,
        bodega: fila.productor,
        tipo: fila.tipo,
        region: [fila.pais, fila.categoria].filter(Boolean).join(' - '),
        uva: fila.uva,
        anada: fila.anada,
        referencia: '',
        formato: fila.formato,
        coste_estimado: fila.costeEstimado,
        pvp_recomendado: '',
        disponibilidad: fila.disponibilidad,
        notas,
      }
    })

  const filasAppConPrecio = filasApp.filter(fila => Number(fila.coste_estimado) > 0)

  fs.mkdirSync(outputDir, { recursive: true })
  const csvApp = path.join(outputDir, 'lexcellence_import_app.csv')
  const xlsxApp = path.join(outputDir, 'lexcellence_import_app.xlsx')
  const csvAppConPrecio = path.join(outputDir, 'lexcellence_import_app_con_precio.csv')
  const xlsxAppConPrecio = path.join(outputDir, 'lexcellence_import_app_con_precio.xlsx')
  const csvRevision = path.join(outputDir, 'lexcellence_revision.csv')
  const xlsxRevision = path.join(outputDir, 'lexcellence_revision.xlsx')
  const reportPath = path.join(outputDir, 'lexcellence_reporte.json')

  escribirCsv(csvApp, filasApp)
  escribirCsv(csvAppConPrecio, filasAppConPrecio)
  escribirCsv(csvRevision, filasRevision)

  const wbApp = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbApp, XLSX.utils.json_to_sheet(filasApp), 'Import app')
  XLSX.writeFile(wbApp, xlsxApp)

  const wbAppConPrecio = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbAppConPrecio, XLSX.utils.json_to_sheet(filasAppConPrecio), 'Import app')
  XLSX.writeFile(wbAppConPrecio, xlsxAppConPrecio)

  const wbRevision = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wbRevision, XLSX.utils.json_to_sheet(filasApp), 'Import app')
  XLSX.utils.book_append_sheet(wbRevision, XLSX.utils.json_to_sheet(filasRevision), 'Revision')
  XLSX.writeFile(wbRevision, xlsxRevision)

  const resumen = {
    input,
    pages: pages.length,
    filasDetectadas: filasRevision.length,
    filasImportApp: filasApp.length,
    importablesConPrecio: filasAppConPrecio.length,
    confianza: filasRevision.reduce((acc, fila) => {
      acc[fila.confianza] = (acc[fila.confianza] || 0) + 1
      return acc
    }, {}),
    sinProductor: filasRevision.filter(fila => !fila.productor).length,
    sinNombre: filasRevision.filter(fila => !fila.nombre).length,
    sinUva: filasRevision.filter(fila => !fila.uva).length,
    limitados: filasRevision.filter(fila => fila.disponibilidad === 'limitado').length,
    formatos: [...new Set(filasRevision.map(fila => fila.formato).filter(Boolean))].sort(),
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
