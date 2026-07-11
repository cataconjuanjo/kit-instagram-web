const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse/lib/pdf-parse.js')
const XLSX = require('xlsx')

const inputPdf = process.argv[2] || 'Catalogo_Bodegas_Mar_Malaga_2026-06-23.pdf'
const outputDir = process.argv[3] || path.join('output', 'catalogos')

const CATALOGO = 'Bodegas Mar Malaga 2026-06-23'
const PROVEEDOR = 'Bodegas Mar Malaga'
const EURO = String.fromCharCode(8364)
const BULLET = String.fromCharCode(8226)

function limpiar(texto) {
  return String(texto || '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizarKey(texto) {
  return limpiar(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function normalizarDecimal(texto) {
  return String(texto || '').replace(/\./g, '').replace(',', '.')
}

function numeroPrecio(texto) {
  const parsed = Number(normalizarDecimal(texto))
  return Number.isFinite(parsed) ? parsed : 0
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

function textoFila(fila) {
  return limpiar(fila.items.map(item => item.s).join(' '))
}

function esPrecioEnTexto(texto) {
  return new RegExp(`\\d{1,4}(?:\\.\\d{3})*,\\d{2}\\s*${EURO}`).test(texto)
}

function extraerPrecios(texto) {
  const regex = new RegExp(`(\\d{1,4}(?:\\.\\d{3})*,\\d{2})\\s*${EURO}`, 'g')
  return [...String(texto || '').matchAll(regex)].map(match => numeroPrecio(match[1]))
}

function limpiarPrecios(texto) {
  const regex = new RegExp(`\\d{1,4}(?:\\.\\d{3})*,\\d{2}\\s*${EURO}`, 'g')
  return limpiar(String(texto || '').replace(regex, ' '))
}

function extraerAnadas(texto) {
  const years = []
  const source = String(texto || '')

  for (const match of source.matchAll(/\b20(?:1|2)\d\b/g)) years.push(match[0])
  for (const match of source.matchAll(/[\u00b4\u2019'\u0301]\s*(\d{2})/g)) {
    const year = Number(match[1])
    if (Number.isFinite(year)) years.push(String(year <= 30 ? 2000 + year : 1900 + year))
  }

  return [...new Set(years)]
}

function eliminarAnadas(texto) {
  return limpiar(String(texto || '')
    .replace(/\b20(?:1|2)\d\b/g, ' ')
    .replace(/[\u00b4\u2019'\u0301]\s*\d{2}/g, ' '))
}

function formatoDesdeTexto(texto, magnumSection) {
  const key = normalizarKey(texto)
  if (magnumSection) return { formato: 'magnum 150 cl', capacidadCl: 150 }
  if (/(37[,.\s]*5|375)\s*CL/.test(key)) return { formato: 'media botella 37,5 cl', capacidadCl: 37.5 }
  if (/\(?\s*50\s*CL\s*\)?/.test(key) || /\b500\s*ML\b/.test(key)) return { formato: 'botella 50 cl', capacidadCl: 50 }
  if (/\b70\s*CL\b/.test(key)) return { formato: 'botella 70 cl', capacidadCl: 70 }
  if (/\b1[,.\s]*5\s*L\b/.test(key)) return { formato: 'magnum 150 cl', capacidadCl: 150 }
  return { formato: 'botella 75 cl', capacidadCl: 75 }
}

function eliminarFormato(texto) {
  return limpiar(String(texto || '')
    .replace(/\(?\s*37[,.\s]*5\s*CL\s*\)?/ig, ' ')
    .replace(/\(?\s*50\s*CL\s*\)?/ig, ' ')
    .replace(/\b500\s*ml\b/ig, ' ')
    .replace(/\b70\s*cl\b/ig, ' ')
    .replace(/\b1[,.\s]*5\s*l\b/ig, ' '))
}

function limpiarNombreProducto(texto) {
  return limpiar(eliminarFormato(eliminarAnadas(limpiarPrecios(texto)))
    .replace(new RegExp(`[${BULLET}|]`, 'g'), ' ')
    .replace(/\(M\)/ig, ' ')
    .replace(/[+-]?\s*\d{1,5}(?:\.\d{3})?\s*b(?:t|s|ts)?\b/ig, ' ')
    .replace(/\+\-/g, ' ')
    .replace(/\+\s*$/g, ' ')
    .replace(/\b[+-]?\d{1,3}(?:\+)?\s*RP\b/ig, ' ')
    .replace(/\bMountain Wine\b/ig, ' ')
    .replace(/\bSparkling\b/ig, ' ')
    .replace(/\bPOCAS\s+UD\b/ig, ' ')
    .replace(/\bAgotado\b/ig, ' ')
    .replace(/\bConsultar\b/ig, ' ')
    .replace(/\bEstuchado\b/ig, ' ')
    .replace(/\(vino dulce\)/ig, ' ')
    .replace(/\(sin estuche\)/ig, ' ')
    .replace(/\(\s*(blanco|rosado|tinto)\s*\)/ig, ' ')
    .replace(/\s+-\s*$/g, ' ')
    .replace(/^\s*-\s*/g, ' '))
}

function esLineaProducto(texto) {
  const limpio = limpiar(texto)
  if (!limpio) return false
  if (/^\d+$/.test(limpio)) return false
  const empiezaMagnum = new RegExp(`^\\s*\\(M\\)\\s*${BULLET}`).test(limpio)
  const empiezaBullet = new RegExp(`^\\s*${BULLET}`).test(limpio)
  const despuesMarcadores = limpiar(limpio
    .replace(/^\s*\(M\)\s*/i, '')
    .replace(new RegExp(`^\\s*${BULLET}\\s*`), ''))

  if (/^\(/.test(despuesMarcadores) && !esPrecioEnTexto(limpio) && !/agotado/i.test(limpio)) return false
  if ((esPrecioEnTexto(limpio) || /agotado/i.test(limpio)) && (!/^\(/.test(limpio) || empiezaMagnum)) return true
  return (empiezaMagnum || empiezaBullet) && !/^\(/.test(despuesMarcadores)
}

function esLineaDetalle(texto) {
  const limpio = limpiar(texto)
  if (!limpio) return false
  if (/^\(/.test(limpio)) return true
  return !esLineaProducto(limpio)
}

function esEncabezado(texto) {
  const key = normalizarKey(texto)
  if (!key || /^\d+$/.test(key)) return false
  if (esPrecioEnTexto(texto) || /AGOTADO|CONSULTAR/.test(key)) return false
  if (key.startsWith('PRECIOS IVA') || key.startsWith('FORMATOS MAGNUM')) return true
  if (/^(D\.?\s*O|DOP|A\.?O\.?C|V\.?T)\b/.test(key)) return true
  return [
    'LEON',
    'ANDALUCIA',
    'ISLAS BALEARES',
    'VINOS DE CASTILLA Y LEON',
    'VINOS DE ALICANTE',
    'CAVAS',
    'INTERNACIONAL',
    '- FRANCIA -',
    '- RODANO -',
    '- ALSACIA -',
    '- BORGONA -',
    '- ARGENTINA -',
    'PRIORATO',
    'A O V E',
    'LICOR',
    'EDICIONES LIMITADAS RON MONDERO',
    'ESPUMOSOS',
    'BLANCOS',
    'ROSADOS',
    'VERMUT',
    'TINTOS',
  ].includes(key)
}

function regionDesdeEncabezado(texto, contexto) {
  const original = limpiar(texto)
  const key = normalizarKey(original)

  if (key === 'A O V E') return { ...contexto, categoria: 'aceite' }
  if (key === 'LICOR' || key === 'EDICIONES LIMITADAS RON MONDERO') return { ...contexto, categoria: 'licor' }
  if (['ESPUMOSOS', 'BLANCOS', 'ROSADOS', 'VERMUT', 'TINTOS'].includes(key)) {
    return { ...contexto, categoria: key.toLowerCase(), region: contexto.region }
  }
  if (key.startsWith('FORMATOS MAGNUM')) return { ...contexto, magnumSection: true }
  if (key.startsWith('PRECIOS IVA')) return contexto

  return {
    ...contexto,
    region: original.replace(/\s+/g, ' '),
    categoria: '',
  }
}

function esRegionEntreParentesis(texto, contexto) {
  if (!contexto.magnumSection) return false
  const limpio = limpiar(texto)
  if (!/^\(.+\)$/.test(limpio)) return false
  const inside = limpiar(limpio.replace(/^\(|\)$/g, ''))
  if (inside.includes(',')) return false
  return inside.length <= 30
}

function tipoDesdeTexto({ nombre, uva, region, categoria, detalles }) {
  const nameKey = normalizarKey(nombre)
  const key = normalizarKey(`${categoria || ''} ${nombre || ''} ${uva || ''} ${detalles || ''} ${region || ''}`)

  if (/\b(RON|GIN|WHISKY|LICOR|PATXARAN|PATXARAN)\b/.test(nameKey)) return 'licor'
  if (/\b(VERMUT|VERMOUTH|VERMU|DOS DEUS)\b/.test(nameKey)) return 'vermut'
  if (/\bVINAGRE\b/.test(nameKey)) return 'vinagre'
  if (/\b(ACEITE|AOVE)\b/.test(key)) return 'aceite'
  if (/\b(VERMUT|VERMOUTH|VERMU|DOS DEUS)\b/.test(key) || categoria === 'vermut') return 'vermut'
  if (/\b(CHAMPAGNE|CAVAS?|BRUT|PET[- ]?NAT|ESPUMOSO|ESPUMOSOS|GRAN RESERVA|RESERVA ROSADO|RESERVE ROSE|CUVEE|MIRGIN|LAIETA|SUBLIM|EXCENT)\b/.test(key)) return 'espumoso'
  if (/\b(ROSADO|ROSE|ROSE|ROSAT)\b/.test(key) || categoria === 'rosados') return 'rosado'
  if (/\b(DULCE|SEMIDULCE|VENDIMIA TARDIA|PX|P XIMENEZ|PEDRO XIMENEZ|DOLC|CREAM)\b/.test(key)) return 'dulce'
  if (/\b(FINO|MANZANILLA|AMONTILLADO|OLOROSO|PALO CORTADO|JEREZ|XERES|SHERRY|FLORPOWER|FLOR)\b/.test(key)) return 'generoso'
  if (/\bLA BOTA\s+\d+/.test(key) && /\bANDALUCIA\b/.test(key)) return 'generoso'
  if (categoria === 'blancos') return 'blanco'
  if (categoria === 'tintos') return 'tinto'
  if (/\b(TINTO|TINTA|NEGRE|RED|GARNACHA|MENCIA|TEMPRANILLO|BOBAL|MONASTRELL|SYRAH|CABERNET|MERLOT|MALBEC|PINOT NOIR|PRIETO PICUDO|BARBERA|MANTO NEGRO|CALLET|PETIT VERDOT|WHISBA)\b/.test(key)) return 'tinto'
  if (/\b(BLANCO|BLANCA|BLANC|WHITE|ALBARINO|ABARINO|ALBARIN|GODELLO|VERDEJO|VIURA|RIESLING|CHARDONNAY|SAUVIGNONG?\s+BLANC|MOSCATEL|PALOMINO|XAREL|XAREL-LO|PARELLADA|MACABEO|MACABEU|ALBILLO|PINOT GRIS|ONDARRABI ZURI|PANS[A]? BLANCA|PANS[A]? ROSADA|VIOGNIER)\b/.test(key)) return 'blanco'
  if (categoria === 'licor') return 'licor'
  return ''
}

function grapeLike(texto) {
  const key = normalizarKey(texto)
  if (!key || key.length > 160) return false
  if (/VINO DULCE|CAVA DE COLECCION|SIN ESTUCHE|MALAGA|RIOJA|BIERZO|CATALUNA|GRANADA|RIBERA DEL DUERO|CEBREROS|PAIS VASCO/.test(key)) return false
  return /,|GARNACHA|ROME|TINTA|MENCIA|TEMPRANILLO|MONASTRELL|SYRAH|CABERNET|MERLOT|BOBAL|ALBARINO|ABARINO|ALBARIN|GODELLO|VERDEJO|VIURA|MOSCATEL|CHARDONNAY|PINOT|PALOMINO|XAREL|PARELLADA|MACAB|RIESLING|SAUVIGNON|MALBEC|BARBERA|ONDARRABI|PANS|ALBILLO|MORAVIA|PRIETO|MANTO|CALLET|TREPAT|MATARO|XINOMAVRO|PETIT|VIOGNIER/.test(key)
}

function disponibilidadDesdeTexto(texto) {
  const key = normalizarKey(texto)
  const disponibilidad = []
  if (/AGOTADO/.test(key)) disponibilidad.push('agotado')
  if (/POCAS\s+UD/.test(key)) disponibilidad.push('pocas unidades')
  if (/CONSULTAR/.test(key)) disponibilidad.push('consultar')
  if (/ESTUCHADO/.test(key)) disponibilidad.push('estuchado')
  return disponibilidad.join(', ')
}

function coincide(key, patrones) {
  return patrones.some(patron => patron.test(key))
}

function inferirBodega(fila) {
  const key = normalizarKey(`${fila.nombre || ''} ${fila.region || ''} ${fila.uva || ''} ${fila.detalles || ''}`)
  const nombre = normalizarKey(fila.nombre)

  if (coincide(nombre, [/VIDUENOS DE SEDELLA/, /LADERAS DE SEDELLA/, /^SEDELLA$/, /LAS JACINTAS/])) return 'Bodegas Sedella'
  if (coincide(nombre, [/CALVENTE/, /XATE-O/, /LOVELIA/, /ROSA-O/, /LA GUINDA/, /GUINDALERA/, /CASTILLEJOS/, /VERMU DE GARAGE/, /ALISSMA/])) return 'Bodegas Calvente'
  if (coincide(nombre, [/^RANIA/])) return 'Rania'
  if (coincide(nombre, [/PLACET/, /LA VENDIMIA/, /LA MONTESA/, /PROPIEDAD/])) return 'Palacios Remondo'
  if (coincide(nombre, [/^LOESS/, /LOESS VERDEJO/])) return 'Bodegas Loess'
  if (coincide(nombre, [/ULTREIA/, /LA VIZCAINA/, /LA DEL VIVO/, /^LA CLAVE$/, /ANFORA TINTO/, /ATALIER/, /SKETCH/])) return 'Raul Perez'
  if (coincide(nombre, [/CASTRO CANDAZ/, /FINCA EL CURVADO/, /^EL PECADO$/, /LA PENITENCIA/])) return 'Castro Candaz'
  if (coincide(nombre, [/RARA AVIS/, /ARROTOS DEL PENDON/, /PICO FERREIRA/, /EL MORISCO/, /MATA LOS PARDOS/])) return 'Bodegas Margon'
  if (coincide(nombre, [/EL TERROIR/, /^LA DAMA$/, /LA MURIA/])) return 'Domaines Lupier'
  if (coincide(nombre, [/PIEDRA CACHADA/])) return 'Vina Zorzal'
  if (coincide(nombre, [/^VIARIZ$/])) return 'Viariz'
  if (coincide(nombre, [/LA ORQUESTA/])) return 'Alfredo Maestro'
  if (coincide(nombre, [/^SARA$/])) return 'Sara'
  if (coincide(nombre, [/LA VINA DE AYER/, /NARANJAS AZULES/, /^INAT$/, /LAS VIOLETAS/, /LA CRUZ VERDE/, /ALTO DE LA ESTRELLA/, /LAS LOBERAS/, /LA MIRA/, /PANCALIENTE/])) return 'Soto Manrique'
  if (coincide(nombre, [/EVODIA/])) return 'Bodegas San Alejandro'
  if (coincide(nombre, [/LAGAR DE COSTA/, /CALABOBOS/, /^MAIO$/, /TRADICION/])) return 'Lagar de Costa'
  if (coincide(nombre, [/PARAJES DE LOS VIDRIOS/, /PICO DEL MIRLO/, /MARIUCA/])) return 'Parajes de los Vidrios'
  if (coincide(nombre, [/EPISTEM/, /^8 VENTS$/])) return 'Atlan & Artisan'
  if (coincide(nombre, [/CLAVIUS/, /SANZO/, /EL QUINTO PARAJE/, /EL CUCHILLEJO/, /LAS TIERRAS/, /LA VINA DE AMAYA/])) return 'Rodriguez Sanzo'
  if (coincide(nombre, [/BALANCINES/, /^HUNO/, /HARAGAN/, /MASTINES/])) return 'Pago Los Balancines'
  if (coincide(nombre, [/EL CANTORRAL/, /TINTORALBA/, /ALTITUD 1100/, /PIEDRAS COLORADAS/, /CERRO DEL BUEY/, /ALQUERIA DE LA GRAJA/])) return 'Bodegas Tintoralba'
  if (coincide(nombre, [/MAS DE LA MONA/, /ALBOR DE MASOS/, /VIDAL BALAGUER/])) return 'Masos'
  if (coincide(nombre, [/^COLET/])) return 'Colet / Equipo Navazos'
  if (coincide(nombre, [/NAVAZOS NIEPOORT/, /^LA BOTA/])) return 'Equipo Navazos'
  if (coincide(nombre, [/MARISMAS/, /FLOR MACHARNUDO/, /S\.P\.|STA\. PETRONILA|S\.PETRONILA/, /P\. XIMENEZ EN RAMA/])) return 'Primitivo Collantes'
  if (coincide(nombre, [/LA GOYA/, /GOYA XL/, /ZULETA/, /MONTEAGUDO/, /GOYESCO/])) return 'Delgado Zuleta'
  if (coincide(nombre, [/ETIRIS/, /PARVUS/, /PUPUT/, /CAU D/, /TALLARETA/, /^ORBUS$/, /^MERLA$/, /DOLC MATARO/, /^MIRGIN/, /LAIETA/, /^BRUANT$/, /ALTA ALELLA/])) return 'Alta Alella'
  if (coincide(nombre, [/SUBLIM/, /EXCENT/, /^CELIA/])) return 'Sublim / Excent'
  if (coincide(nombre, [/ASTOBIZA/, /^MALKOA$/, /VENDIMIA TARDIA/])) return 'Astobiza'
  if (coincide(nombre, [/^PONCE/, /^CLOS LOJEN$/, /^LA XARA$/])) return 'Bodegas Ponce'
  if (coincide(nombre, [/BILLECART/, /ELIZABETH SALMON/])) return 'Billecart-Salmon'
  if (coincide(nombre, [/HURE FRERES/])) return 'Hure Freres'
  if (coincide(nombre, [/LAHERTE FRERES/])) return 'Laherte Freres'
  if (coincide(nombre, [/^PALMER/])) return 'Palmer & Co'
  if (coincide(nombre, [/PIERRE PAILLARD/])) return 'Pierre Paillard'
  if (coincide(nombre, [/CONFURON/])) return 'Domaine Jean-Jacques Confuron'
  if (coincide(nombre, [/COMBIER/])) return 'Domaine Combier'
  if (coincide(nombre, [/SCHOFFIT/, /SHOFFIT/])) return 'Domaine Schoffit'
  if (coincide(nombre, [/CHATEAU DE BEAUREGARD/])) return 'Chateau de Beauregard'
  if (coincide(nombre, [/CHATEAU DE BERU/])) return 'Chateau de Beru'
  if (coincide(nombre, [/LA FLOR PULENTA/])) return 'Pulenta Estate'
  if (coincide(nombre, [/SAURUS/])) return 'Familia Schroeder'
  if (coincide(nombre, [/BARBERA D'ASTI/, /NIZZA RISERVA/])) return 'Barbera d Asti / Nizza'
  if (coincide(nombre, [/EL MONDERO/, /RON EN BARRICA/])) return 'El Mondero'
  if (coincide(nombre, [/DOS DEUS/])) return 'Dos Deus'
  if (coincide(nombre, [/PATXARAN GAIZKA/])) return 'Gaizka'
  if (coincide(nombre, [/FERRET BRUT/])) return 'Ferret'
  if (coincide(nombre, [/GRAMONA/])) return 'Gramona'
  if (coincide(nombre, [/^NAIA$/])) return 'Bodegas Naia'
  if (coincide(nombre, [/REMIREZ DE GANUZA/])) return 'Remirez de Ganuza'
  if (coincide(nombre, [/^EKAM$/, /^ACUSP$/])) return 'Castell d Encus'
  if (coincide(nombre, [/LA CELESTINA/, /VIRIDIANA DE ATAUTA/, /PARADA DE ATAUTA/, /DOMINIO DE ATAUTA/])) return 'Dominio de Atauta'
  if (coincide(nombre, [/VALSOTILLO/])) return 'Bodegas Ismael Arroyo'
  if (coincide(nombre, [/ALONSO DEL YERRO/])) return 'Alonso del Yerro'
  if (coincide(nombre, [/FINCA RESALSO/])) return 'Emilio Moro'
  if (coincide(nombre, [/MATULAN/])) return 'Matulan'
  if (coincide(nombre, [/RAMON BILBAO/])) return 'Ramon Bilbao'
  if (coincide(nombre, [/EL BUSCADOR/])) return 'El Buscador'
  if (coincide(nombre, [/VILLA DE CORULLON/, /LAS FONTELAS/, /PETALOS DEL BIERZO/, /MONCERBAL/, /LAS LAMAS/])) return 'Descendientes de J. Palacios'
  if (coincide(nombre, [/^UNCULIN$/])) return 'Jose Antonio Garcia'
  if (coincide(nombre, [/FERRER BOBET/])) return 'Ferrer Bobet'

  if (/CHAMPAGNE/.test(key)) return limpiar(fila.nombre).split(/\s+/).slice(0, 2).join(' ')
  return ''
}

function ajustarInferencias(producto) {
  const nombre = normalizarKey(producto.nombre)
  const bodega = normalizarKey(producto.bodega)

  if (bodega === 'ALTA ALELLA') producto.region = 'D.O. Alella'
  if (bodega === 'BODEGAS PONCE') producto.region = 'D.O. Manchuela'
  if (bodega === 'PULENTA ESTATE') producto.region = 'Mendoza, Argentina'
  if (bodega === 'FAMILIA SCHROEDER') producto.region = 'Patagonia, Argentina'

  if (coincide(nombre, [/LA FLOR PULENTA/])) producto.tipo = 'tinto'
  if (coincide(nombre, [/TINTORALBA GARNACHA BLANCA/, /BLANC DE NOIR/])) producto.tipo = 'blanco'
  if (coincide(nombre, [/OLOROSO/, /AMONTILLADO/, /FINO/, /MANZANILLA/, /PALO CORTADO/])) producto.tipo = 'generoso'
  if (bodega === 'ALTA ALELLA') {
    if (coincide(nombre, [/ETIRIS GX ROSE/])) producto.tipo = 'rosado'
    else if (coincide(nombre, [/PUPUT/])) producto.tipo = 'espumoso'
    else if (coincide(nombre, [/ETIRIS GX$/, /CAU D.*NEGRE/, /^ORBUS$/, /^MERLA$/, /PARVUS SYRAH/])) producto.tipo = 'tinto'
    else if (coincide(nombre, [/ETIRIS PB/, /PARVUS CHARDONNAY/, /CAU D/, /TALLARETA/])) producto.tipo = 'blanco'
  }
}

function debeOmitir(fila) {
  const key = normalizarKey(`${fila.nombre} ${fila.tipo} ${fila.region} ${fila.categoria}`)
  if (!fila.nombre) return 'sin_nombre'
  if (/ACEITE|AOVE|VINAGRE|QUESO|JAMON|PALETA|LOMO|CHORIZO|SALCHICHON|COPA|VASO|CRISTAL|PARTNER|CABECERO/.test(key)) return 'no_bebida_catalogo_vinos'
  return ''
}

function crearFilaProducto(texto, contexto, pageNumber, y, indice) {
  const precios = extraerPrecios(texto)
  const formato = formatoDesdeTexto(texto, contexto.magnumSection)
  const nombre = limpiarNombreProducto(texto)
  const anadas = extraerAnadas(texto)
  const disponibilidad = disponibilidadDesdeTexto(texto)
  const notas = [
    `PDF Bodegas Mar pag. ${pageNumber}`,
    contexto.magnumSection ? 'seccion formatos magnum 1,5L' : '',
    /\(M\)/i.test(texto) && !contexto.magnumSection ? 'marca M en catalogo' : '',
    precios.length > 1 ? `precios PDF: ${precios.map(item => item.toFixed(2)).join(' / ')}` : '',
    /Mountain Wine/i.test(texto) ? 'Mountain Wine' : '',
    /Sparkling/i.test(texto) ? 'Sparkling' : '',
    /Estuchado/i.test(texto) ? 'Estuchado' : '',
  ].filter(Boolean)

  return {
    catalogo: CATALOGO,
    proveedor_sugerido: PROVEEDOR,
    pageNumber,
    y: Number(y.toFixed(1)),
    indice,
    region: contexto.region || '',
    categoria: contexto.categoria || '',
    nombre,
    bodega: '',
    uva: '',
    anada: anadas.join('/'),
    formato: formato.formato,
    capacidadCl: formato.capacidadCl,
    precioRaw: precios.length ? precios.map(item => item.toFixed(2)).join(' / ') : '',
    costeEstimado: euro(precios.at(-1) || 0),
    disponibilidad,
    notasRevision: notas.join(' | '),
    rawLine: limpiar(texto),
    detalles: [],
    omitido: '',
    confianza: '',
  }
}

function aplicarDetalle(producto, texto) {
  const limpio = limpiar(texto)
  if (!producto || !limpio) return

  const precios = extraerPrecios(limpio)
  if (precios.length && !producto.costeEstimado) {
    producto.precioRaw = precios.map(item => item.toFixed(2)).join(' / ')
    producto.costeEstimado = euro(precios.at(-1) || 0)
    producto.disponibilidad = [producto.disponibilidad, disponibilidadDesdeTexto(limpio)].filter(Boolean).join(', ')
  }

  const sinPrecios = limpiarPrecios(limpio)
  const detalleBase = limpiar(sinPrecios.replace(new RegExp(`^\\s*${BULLET}\\s*`), ''))
  const contenidoParentesis = /^\((.*)\)/.test(detalleBase)
    ? limpiar(detalleBase.replace(/^\((.*)\).*$/, '$1'))
    : ''

  if (contenidoParentesis && grapeLike(contenidoParentesis)) {
    producto.uva = producto.uva
      ? [...new Set([producto.uva, contenidoParentesis])].join(' | ')
      : contenidoParentesis
  } else if (contenidoParentesis) {
    producto.detalles.push(contenidoParentesis)
  } else if (grapeLike(detalleBase) && !producto.uva) {
    producto.uva = detalleBase
  } else if (!/^\d+$/.test(sinPrecios)) {
    producto.detalles.push(detalleBase)
  }
}

function finalizarProducto(producto) {
  if (!producto) return null
  producto.detalles = producto.detalles.filter(Boolean).join(' | ')
  producto.bodega = inferirBodega(producto)
  producto.tipo = tipoDesdeTexto(producto)
  ajustarInferencias(producto)
  producto.omitido = debeOmitir(producto)

  const incidencias = []
  if (!producto.region) incidencias.push('region_no_detectada')
  if (!producto.tipo) incidencias.push('tipo_no_detectado')
  if (!producto.bodega) incidencias.push('bodega_no_detectada')
  if (!producto.uva && !['vermut', 'licor', 'generoso'].includes(producto.tipo)) incidencias.push('uva_no_detectada')
  if (!producto.costeEstimado && producto.disponibilidad !== 'agotado') incidencias.push('sin_precio')
  if (producto.omitido) incidencias.push(`omitido_${producto.omitido}`)

  producto.incidencias = incidencias.join(', ')
  producto.confianza = producto.omitido || incidencias.some(item => ['tipo_no_detectado', 'sin_precio'].includes(item))
    ? 'baja'
    : incidencias.length
      ? 'media'
      : 'alta'
  return producto
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

  const productos = []
  let contexto = { region: '', categoria: '', magnumSection: false }
  let pendiente = null
  let indice = 0

  for (const page of pages) {
    if (page.pageNumber < 4 || page.pageNumber > 26) continue
    if (page.pageNumber >= 22 && page.pageNumber <= 24) continue

    for (const fila of agruparFilas(page.items)) {
      const texto = textoFila(fila)
      if (!texto || /^\d+$/.test(texto)) continue

      if (esRegionEntreParentesis(texto, contexto)) {
        contexto = {
          ...contexto,
          region: limpiar(texto.replace(/^\(|\)$/g, '')),
        }
        continue
      }

      if (esEncabezado(texto) && !esLineaProducto(texto)) {
        const finalizado = finalizarProducto(pendiente)
        if (finalizado) productos.push(finalizado)
        pendiente = null
        contexto = regionDesdeEncabezado(texto, contexto)
        continue
      }

      if (esLineaProducto(texto)) {
        const finalizado = finalizarProducto(pendiente)
        if (finalizado) productos.push(finalizado)
        indice += 1
        pendiente = crearFilaProducto(texto, contexto, page.pageNumber, fila.y, indice)
        continue
      }

      if (pendiente && esLineaDetalle(texto)) {
        aplicarDetalle(pendiente, texto)
      }
    }
  }

  const finalizado = finalizarProducto(pendiente)
  if (finalizado) productos.push(finalizado)

  const filasRevision = productos.map(fila => ({
    catalogo: fila.catalogo,
    proveedor_sugerido: fila.proveedor_sugerido,
    pageNumber: fila.pageNumber,
    y: fila.y,
    indice: fila.indice,
    region: fila.region,
    categoria: fila.categoria,
    nombre: fila.nombre,
    bodega: fila.bodega,
    tipo: fila.tipo,
    uva: fila.uva,
    anada: fila.anada,
    formato: fila.formato,
    capacidadCl: fila.capacidadCl,
    precioRaw: fila.precioRaw,
    costeEstimado: fila.costeEstimado,
    disponibilidad: fila.disponibilidad,
    detalles: fila.detalles,
    confianza: fila.confianza,
    omitido: fila.omitido,
    incidencias: fila.incidencias,
    notasRevision: fila.notasRevision,
    rawLine: fila.rawLine,
  }))

  const vistosImport = new Set()
  let duplicadosExactos = 0
  const filasValidas = filasRevision.filter(fila => {
    if (fila.omitido) return false
    const key = [
      fila.nombre,
      fila.region,
      fila.anada,
      fila.formato,
      fila.costeEstimado,
      fila.disponibilidad,
    ].join('|').toLowerCase()
    if (vistosImport.has(key)) {
      duplicadosExactos += 1
      return false
    }
    vistosImport.add(key)
    return true
  })
  const filasApp = filasValidas.map((fila, index) => {
    const notas = [
      fila.notasRevision,
      fila.detalles ? `detalles: ${fila.detalles}` : '',
      fila.precioRaw ? 'precio sin IVA' : '',
      fila.incidencias ? `revision: ${fila.incidencias}` : '',
    ].filter(Boolean).join(' | ')

    return {
      nombre: fila.nombre,
      bodega: fila.bodega,
      tipo: fila.tipo,
      region: fila.region,
      uva: fila.uva,
      anada: fila.anada,
      referencia: `BMM-${String(index + 1).padStart(3, '0')}`,
      formato: fila.formato,
      coste_estimado: fila.costeEstimado,
      pvp_recomendado: '',
      disponibilidad: fila.disponibilidad,
      notas,
    }
  })
  const filasAppConPrecio = filasApp.filter(fila => Number(fila.coste_estimado) > 0)

  fs.mkdirSync(outputDir, { recursive: true })
  const csvApp = path.join(outputDir, 'bodegas_mar_malaga_import_app.csv')
  const xlsxApp = path.join(outputDir, 'bodegas_mar_malaga_import_app.xlsx')
  const csvAppConPrecio = path.join(outputDir, 'bodegas_mar_malaga_import_app_con_precio.csv')
  const xlsxAppConPrecio = path.join(outputDir, 'bodegas_mar_malaga_import_app_con_precio.xlsx')
  const csvRevision = path.join(outputDir, 'bodegas_mar_malaga_revision.csv')
  const xlsxRevision = path.join(outputDir, 'bodegas_mar_malaga_revision.xlsx')
  const reportPath = path.join(outputDir, 'bodegas_mar_malaga_reporte.json')

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
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(filasRevision.filter(fila => fila.omitido)), 'Omitidos')
  XLSX.writeFile(workbook, xlsxRevision)

  const resumen = {
    input,
    pages: pages.length,
    filasDetectadas: filasRevision.length,
    omitidas: filasRevision.filter(fila => fila.omitido).length,
    duplicadosExactos,
    importables: filasApp.length,
    importablesConPrecio: filasAppConPrecio.length,
    sinPrecio: filasApp.filter(fila => !Number(fila.coste_estimado)).length,
    confianza: filasRevision.reduce((acc, fila) => {
      acc[fila.confianza] = (acc[fila.confianza] || 0) + 1
      return acc
    }, {}),
    tipos: filasApp.reduce((acc, fila) => {
      const tipo = fila.tipo || 'sin_tipo'
      acc[tipo] = (acc[tipo] || 0) + 1
      return acc
    }, {}),
    disponibilidad: filasApp.reduce((acc, fila) => {
      const key = fila.disponibilidad || 'normal'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {}),
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
