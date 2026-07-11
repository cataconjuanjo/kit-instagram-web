const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse/lib/pdf-parse.js')
const XLSX = require('xlsx')

const inputPdf = process.argv[2] || '2026_06_TARIFA_VA.pdf'
const outputDir = process.argv[3] || path.join('output', 'catalogos')

const REGION_BY_CODE_PREFIX = {
  1: 'PFALZ',
  2: 'RHEINHESSEN',
  3: 'RHEINGAU',
  4: 'NAHE',
  5: 'MOSEL',
  6: 'FRANKEN',
  7: 'WURTTEMBERG',
  8: 'BADEN',
  9: 'ALEMANIA',
}

function limpiar(texto) {
  return String(texto || '')
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizarDecimal(texto) {
  return String(texto || '')
    .replace(/\s/g, '')
    .replace(',-', ',00')
    .replace('.-', '.00')
    .replace(',', '.')
}

function numero(valor) {
  const match = String(valor || '').match(/\d+(?:[,.]\d+)?|-?\d+/)
  if (!match) return 0
  const parsed = Number(normalizarDecimal(match[0]))
  return Number.isFinite(parsed) ? parsed : 0
}

function precio(valor) {
  const limpio = limpiar(valor)
  if (!limpio) return 0
  const parsed = Number(normalizarDecimal(limpio.replace(/[^\d,.-]/g, '')))
  return Number.isFinite(parsed) ? parsed : 0
}

function euro(valor) {
  return valor ? Number(valor.toFixed(2)) : ''
}

function twoDigitYear(valor) {
  const parsed = Number(String(valor || '').replace(/[^\d]/g, ''))
  if (!Number.isFinite(parsed)) return ''
  if (parsed >= 1000) return String(parsed)
  if (parsed < 0 || parsed > 99) return ''
  return String(parsed <= 30 ? 2000 + parsed : 1900 + parsed)
}

function formatoDesdeLitros(valor) {
  const litros = numero(valor)
  if (!litros) return { formato: '', capacidadCl: '' }
  const cl = litros * 100
  if (Math.abs(cl - 37.5) < 0.1) return { formato: 'media botella 37,5 cl', capacidadCl: 37.5 }
  if (Math.abs(cl - 75) < 0.1) return { formato: 'botella 75 cl', capacidadCl: 75 }
  if (Math.abs(cl - 150) < 0.1) return { formato: 'magnum 150 cl', capacidadCl: 150 }
  if (Math.abs(cl - 300) < 0.1) return { formato: 'doble magnum 300 cl', capacidadCl: 300 }
  return { formato: `botella ${String(cl).replace('.', ',')} cl`, capacidadCl: cl }
}

function inferirTipo({ nombre, variedad, clasificacionEstatal }) {
  const texto = `${nombre || ''} ${variedad || ''} ${clasificacionEstatal || ''}`.toUpperCase()
  if (/\b(SEKT|PET[- ]?NAT|BRUT)\b/.test(texto)) return 'espumoso'
  if (/\b(ROS[EÉ]|ROSADO)\b/.test(texto)) return 'rosado'
  if (/\b(BA|TBA|AUSLESE|BEERENAUSLESE|TROCKENBEERENAUSLESE|GOLDKAPSEL|EISWEIN)\b/.test(texto)) return 'dulce'
  if (/\b(PINOT N|PINOT NOIR|SP[AÄ]TBURGUNDER|LEMBERGER|DORNFELDER|CABERNET|MERLOT|SYRAH|TROLLINGER)\b/.test(texto)) return 'tinto'
  return 'blanco'
}

function corregirNombreVariedad(nombre, variedad) {
  const limpioNombre = limpiar(nombre)
  const limpioVariedad = limpiar(variedad)
  if (limpioVariedad) return { nombre: limpioNombre, variedad: limpioVariedad }

  const match = limpioNombre.match(/\s(Riesling|Pinot N\.?|Pinot|Gew[üu]rzt\.?|Muskat\.?|Weissburgunder|Silvaner|Scheurebe)$/i)
  if (!match) return { nombre: limpioNombre, variedad: limpioVariedad }

  return {
    nombre: limpiar(limpioNombre.slice(0, match.index)),
    variedad: limpiar(match[1]),
  }
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
    let fila = filas.find(actual => Math.abs(actual.y - item.y) <= 3.8)
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

function unir(items) {
  return limpiar(items.map(item => item.s).join(' '))
}

function textoEnRango(items, minX, maxX) {
  return unir(items.filter(item => item.x >= minX && item.x < maxX))
}

function esCodigo(texto) {
  return /^\d\s+[A-Z0-9ÁÉÍÓÚÜÄÖÑ]{2}\b/i.test(limpiar(texto))
}

function regionDesdeTexto(texto) {
  const compacto = limpiar(texto).replace(/\s+/g, '')
  const normal = limpiar(texto).toUpperCase()
  if (/^(PFALZ|P F A L Z)$/i.test(normal) || compacto === 'PFALZ') return 'PFALZ'
  if (compacto === 'RHEINHESSEN') return 'RHEINHESSEN'
  if (compacto === 'RHEINGAU') return 'RHEINGAU'
  if (compacto === 'NAHE') return 'NAHE'
  if (compacto === 'MOSEL') return 'MOSEL'
  if (compacto === 'SAAR') return 'SAAR'
  if (compacto === 'FRANKEN') return 'FRANKEN'
  if (compacto === 'WURTTEMBERG' || compacto === 'WÜRTTEMBERG') return 'WURTTEMBERG'
  if (compacto === 'BADEN') return 'BADEN'
  return ''
}

function limpiarProductor(texto) {
  return limpiar(texto)
    .replace(/\(VDP\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseFila(pageNumber, fila, contexto) {
  const items = fila.items
  const codigo = textoEnRango(items, 0, 100)
  if (!esCodigo(codigo)) return null

  const nombreOriginal = textoEnRango(items, 100, 245)
  const variedadOriginal = textoEnRango(items, 245, 290)
  const nombreVariedad = corregirNombreVariedad(nombreOriginal, variedadOriginal)
  const nombre = nombreVariedad.nombre
  const variedad = nombreVariedad.variedad
  const clasificacionVdp = textoEnRango(items, 290, 385)
  const clasificacionEstatal = textoEnRango(items, 385, 430)
  const cosechaRaw = textoEnRango(items, 430, 455)
  const volumenRaw = textoEnRango(items, 455, 490)
  const precioRaw = textoEnRango(items, 490, 522)
  const cajasRaw = textoEnRango(items, 522, 590)

  const precioBotella = precio(precioRaw)
  const formato = formatoDesdeLitros(volumenRaw)
  const codigoPrefix = limpiar(codigo).charAt(0)
  const region = contexto.region || REGION_BY_CODE_PREFIX[codigoPrefix] || 'ALEMANIA'
  const disponibilidad = /limitado/i.test(cajasRaw) ? 'limitado' : ''
  const cajas = limpiar(cajasRaw.replace(/limitado/ig, ''))
  const anada = twoDigitYear(cosechaRaw)
  const tipo = inferirTipo({ nombre, variedad, clasificacionEstatal })

  const incidencias = []
  if (!contexto.productor) incidencias.push('productor_no_detectado')
  if (!nombre) incidencias.push('nombre_no_detectado')
  if (!variedad) incidencias.push('variedad_no_detectada')
  if (!precioBotella) incidencias.push('sin_precio')
  if (!formato.capacidadCl) incidencias.push('capacidad_no_detectada')
  if (!anada) incidencias.push('cosecha_no_detectada')
  if (disponibilidad) incidencias.push('limitado')

  const confianza = incidencias.some(item => ['productor_no_detectado', 'nombre_no_detectado', 'sin_precio', 'capacidad_no_detectada'].includes(item))
    ? 'baja'
    : incidencias.length
      ? 'media'
      : 'alta'

  return {
    catalogo: 'Vins Alemanys 2026-06',
    proveedor_sugerido: 'Vins Alemanys',
    pageNumber,
    y: Number(fila.y.toFixed(1)),
    codigo: limpiar(codigo),
    referencia: limpiar(codigo),
    productor: contexto.productor,
    region,
    nombre: limpiar(nombre),
    variedad: limpiar(variedad),
    clasificacionVdp: limpiar(clasificacionVdp),
    clasificacionEstatal: limpiar(clasificacionEstatal),
    cosechaRaw: limpiar(cosechaRaw),
    anada,
    volumenLitros: limpiar(volumenRaw),
    formato: formato.formato,
    capacidadCl: formato.capacidadCl,
    precioRaw: limpiar(precioRaw),
    costeEstimado: euro(precioBotella),
    cajas: cajas || '',
    disponibilidad,
    tipo,
    confianza,
    incidencias: incidencias.join(', '),
    rawLine: limpiar(items.map(item => item.s).join(' | ')),
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
  const contexto = { productor: '', region: '' }

  for (const page of pages) {
    const filas = agruparFilas(page.items)
    for (const fila of filas) {
      const rowText = unir(fila.items)
      const region = regionDesdeTexto(rowText)
      if (region) {
        contexto.region = region
        continue
      }

      const parsed = parseFila(page.pageNumber, fila, contexto)
      if (parsed) {
        filasRevision.push(parsed)
        continue
      }

      const leftText = textoEnRango(fila.items, 0, 240)
      const leftItem = fila.items.find(item => item.x >= 10 && item.x < 40)
      const ignorable = /^(Código Referencia|Vino\/Viñedo|T A R I F A|\(|C\/|Mail:|Web|Tel\.|Leyenda|VDP =|Monopole)/i.test(leftText)
      if (leftItem && fila.y > 80 && fila.y < 690 && leftText && !ignorable && !esCodigo(leftText) && !regionDesdeTexto(leftText)) {
        contexto.productor = limpiarProductor(leftText)
      }
    }
  }

  const filasApp = filasRevision.map(fila => {
    const notas = [
      `PDF VA pag. ${fila.pageNumber}`,
      `codigo ${fila.codigo}`,
      fila.variedad ? `variedad: ${fila.variedad}` : '',
      fila.clasificacionVdp ? `VDP: ${fila.clasificacionVdp}` : '',
      fila.clasificacionEstatal ? `clasif.: ${fila.clasificacionEstatal}` : '',
      fila.cosechaRaw ? `cosecha PDF: ${fila.cosechaRaw}` : '',
      fila.volumenLitros ? `volumen: ${fila.volumenLitros} l` : '',
      fila.cajas ? `cajas: ${fila.cajas}` : '',
      fila.disponibilidad ? fila.disponibilidad : '',
      'precio sin IVA',
      fila.incidencias ? `revision: ${fila.incidencias}` : '',
    ].filter(Boolean).join(' | ')

    return {
      nombre: fila.nombre,
      bodega: fila.productor,
      tipo: fila.tipo,
      region: fila.region ? `ALEMANIA - ${fila.region}` : 'ALEMANIA',
      uva: fila.variedad,
      anada: fila.anada,
      referencia: fila.referencia,
      formato: fila.formato,
      coste_estimado: fila.costeEstimado,
      pvp_recomendado: '',
      disponibilidad: fila.disponibilidad,
      notas,
    }
  })

  const filasAppConPrecio = filasApp.filter(fila => Number(fila.coste_estimado) > 0)

  fs.mkdirSync(outputDir, { recursive: true })
  const csvApp = path.join(outputDir, 'vins_alemanys_import_app.csv')
  const xlsxApp = path.join(outputDir, 'vins_alemanys_import_app.xlsx')
  const csvAppConPrecio = path.join(outputDir, 'vins_alemanys_import_app_con_precio.csv')
  const xlsxAppConPrecio = path.join(outputDir, 'vins_alemanys_import_app_con_precio.xlsx')
  const csvRevision = path.join(outputDir, 'vins_alemanys_revision.csv')
  const xlsxRevision = path.join(outputDir, 'vins_alemanys_revision.xlsx')
  const reportPath = path.join(outputDir, 'vins_alemanys_reporte.json')

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
  XLSX.writeFile(workbook, xlsxRevision)

  const resumen = {
    input,
    pages: pages.length,
    filasDetectadas: filasRevision.length,
    confianza: filasRevision.reduce((acc, fila) => {
      acc[fila.confianza] = (acc[fila.confianza] || 0) + 1
      return acc
    }, {}),
    sinPrecio: filasRevision.filter(fila => !fila.costeEstimado).length,
    limitados: filasRevision.filter(fila => fila.disponibilidad === 'limitado').length,
    importablesConPrecio: filasAppConPrecio.length,
    productores: [...new Set(filasRevision.map(fila => fila.productor).filter(Boolean))].length,
    regiones: [...new Set(filasRevision.map(fila => fila.region).filter(Boolean))].sort(),
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
