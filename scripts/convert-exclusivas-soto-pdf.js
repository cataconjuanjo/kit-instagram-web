const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse')
const XLSX = require('xlsx')

const input = process.argv[2] || 'C:/Users/jjgar/Downloads/TARIFA SOTO MAYO 2026 (1).pdf'
const outputDir = process.argv[3] || path.join('output', 'catalogos')

function clean(value) {
  return String(value || '')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\-–—·•\s]+|[\-–—·•\s.]+$/g, '')
    .trim()
}

function norm(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function money(value) {
  const raw = String(value || '').replace(/\s/g, '').replace(/[^\d.,]/g, '')
  if (!raw) return 0
  const decimal = raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '')
  const n = Number(decimal)
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0
}

function typeFrom(region = '', name = '') {
  const text = norm(`${region} ${name}`)
  if (/rosad|clarete|rose/.test(text)) return 'rosado'
  if (/corona|semidulce|dulce|dolce|moscatel|moscato|sauternes|vendimia tardia|cream/.test(text)) return 'dulce'
  if (/blanc|verdejo|godello|albari|sauvignon|chardonnay|viura|macabeo|xarel|riesling|malvas|treixadura|loureiro|torrontes|moscatel seco|monopole|rueda|rias baixas|ribeiro|barbanza|txakoli|pais vasco|valdeorras/.test(text)) return 'blanco'
  if (/cava|champagne|espum|spumante|brut|corpinnat|pet nat/.test(text)) return 'espumoso'
  if (/jerez|fino|oloroso|amontillado|palo cortado|manzanilla|px|pedro ximenez|montilla|generoso/.test(text)) return 'generoso'
  if (/domaines ott|provence/.test(text)) return 'rosado'
  if (/tinto|negre|roble|crianza|reserva|gran reserva|tempranillo|garnacha|mencia|syrah|shiraz|pinot|cabernet|merlot|monastrell|bobal|carinyena|pingus|flor de pingus|asua|imperial|contino|graciano|mazuelo|vina del olivo|arano|aurea|minerva|ribera del duero|ribera del guadiana|rioja|priorat|montsant|castilla y leon|emporda|valencia|sierra de malaga/.test(text)) return 'tinto'
  return ''
}

function normalizeName(name) {
  return clean(name)
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\b(?:18,7|37,5|50|75|100|150|300|600|800|1\.600|1600)\s*cl\.?\b/ig, '')
    .replace(/\b\d{2,3}\+?(?:\s*-\s*\d{2,3})?$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const FOOD_WORDS = /jam[oó]n|paleta|chorizo|salchich[oó]n|lomo|queso|anchoa|bacalao|aceite|vinagre|morc[oó]n|solomillo|presa|pluma|carrillera|foie|confit|magret|rillettes|bolsa|caja|decanter|coravin|riedel|pacharan|orujo|crema|licor|patata|salsa|chipir/i

const PRODUCER_PATTERNS = [
  [/louis roederer/i, 'LOUIS ROEDERER'],
  [/domaines ott/i, 'DOMAINES OTT'],
  [/drappier/i, 'DRAPPIER'],
  [/juv[eé]\s*&\s*camps|juv[eé] y camps/i, 'JUVÉ & CAMPS'],
  [/roger goulart/i, 'ROGER GOULART'],
  [/protos/i, 'BODEGAS PROTOS'],
  [/ant[ií]doto/i, 'BODEGAS ANTÍDOTO'],
  [/dominio de es/i, 'DOMINIO DE ES'],
  [/vi[nñ]a sastre/i, 'VIÑA SASTRE'],
  [/pingus/i, 'DOMINIO DE PINGUS'],
  [/villacreces/i, 'FINCA VILLACRECES'],
  [/la horra/i, 'BODEGAS LA HORRA'],
  [/calogia/i, 'DOMINIO DE CALOGIA'],
  [/bela/i, 'BELA'],
  [/convento san francisco/i, 'CONVENTO SAN FRANCISCO'],
  [/pagos de anguix/i, 'BODEGA PAGOS DE ANGUIX'],
  [/bodegas roda|roda/i, 'BODEGAS RODA'],
  [/c\.?v\.?n\.?e|cune|monopole|imperial|as[uú]a/i, 'C.V.N.E.'],
  [/vi[nñ]a real/i, 'VIÑA REAL'],
  [/contino/i, 'VIÑEDOS DEL CONTINO'],
  [/izadi/i, 'BODEGA IZADI'],
  [/orben/i, 'ORBEN'],
  [/ijalba/i, 'VIÑA IJALBA'],
  [/valpiedra/i, 'FINCA VALPIEDRA'],
  [/bujanda/i, 'VIÑA BUJANDA'],
  [/exopto/i, 'BODEGAS EXOPTO'],
  [/gregorio martinez|gregorio martínez/i, 'BODEGA GREGORIO MARTINEZ'],
  [/artadi/i, 'BODEGA ARTADI'],
  [/aguilares/i, 'LOS AGUILARES'],
  [/enate/i, 'ENATE'],
  [/laus/i, 'LAUS'],
  [/pegaso/i, 'BODEGA PEGASO VIÑAS VIEJAS'],
  [/pardevalles/i, 'PARDEVALLES'],
  [/cosecheros y criadores/i, 'COSECHEROS Y CRIADORES'],
  [/bodega vidas/i, 'BODEGA VIDAS'],
  [/carlos valero/i, 'BODEGAS CARLOS VALERO'],
  [/losada/i, 'LOSADA VINOS DE FINCA'],
  [/descendientes/i, 'DESCENDIENTES DE J. PALACIOS'],
  [/quinta couselo/i, 'QUINTA COUSELO'],
  [/agro de bazan|agro de bazán/i, 'AGRO DE BAZÁN'],
  [/lagar de besada/i, 'LAGAR DE BESADA'],
  [/la val/i, 'BODEGAS LA VAL'],
  [/valdesil/i, 'VALDESIL'],
  [/val do galir/i, 'VAL DO GALIR'],
  [/abadia da cova|abadía da cova/i, 'ABADIA DA COVA'],
  [/vetus/i, 'BODEGAS VETUS'],
  [/menade/i, 'BODEGA MENADE'],
  [/aliaga/i, 'VIÑA ALIAGA'],
  [/zorzal/i, 'VIÑA ZORZAL'],
  [/artazu/i, 'BODEGA ARTAZU'],
  [/izar-leku/i, 'IZAR-LEKU'],
  [/finca antigua/i, 'FINCA ANTIGUA'],
  [/sangenis|sangenís|vaque|vaqué/i, 'BODEGA SANGENÍS I VAQUÉ'],
  [/alvaro palacios|álvaro palacios/i, 'ÁLVARO PALACIOS'],
  [/terroir al limit|terroir al límit/i, 'TERROIR AL LÍMIT'],
  [/vinya del vuit/i, 'LA VINYA DEL VUIT'],
  [/edetaria/i, 'EDETARIA'],
  [/josep grau/i, 'JOSEP GRAU'],
  [/terroir sense fronteres/i, 'TERROIR SENSE FRONTERES'],
  [/terra remota/i, 'TERRA REMOTA'],
  [/an negra/i, 'ÀN NEGRA'],
  [/finca vi[nñ]oa/i, 'FINCA VIÑOA'],
  [/manuel formigo/i, 'ADEGA MANUEL FORMIGO'],
  [/fraga do corvo/i, 'FRAGA DO CORVO'],
  [/entre os rios|entre os r[ií]os/i, 'ADEGA ENTRE OS RIOS'],
  [/silice|sílice/i, 'SÍLICE VITICULTORES'],
  [/los loros/i, 'BODEGA LOS LOROS'],
  [/suertes del marques|suertes del marqu[eé]s/i, 'SUERTES DEL MARQUÉS'],
  [/mustiguillo/i, 'MUSTIGUILLO'],
  [/rafael cambra/i, 'RAFAEL CAMBRA'],
  [/fil.?loxera/i, 'BODEGA FIL.LOXERA'],
  [/el seque/i, 'BODEGA EL SEQUÉ'],
  [/santa rita/i, 'SANTA RITA'],
  [/do[nñ]a paula/i, 'DOÑA PAULA'],
  [/villa maria|villa mar[ií]a/i, 'VILLA MARIA'],
  [/niel bester/i, 'NIEL BESTER'],
  [/montelliana/i, 'CANTINA MONTELLIANA'],
  [/fernando de castilla|fdo\.? de castilla/i, 'FDO. DE CASTILLA'],
  [/faustino gonzalez|faustino gonzález/i, 'FAUSTINO GONZALEZ'],
  [/alvear/i, 'ALVEAR'],
]

function producersFromHeading(heading) {
  const found = []
  for (const [pattern, producer] of PRODUCER_PATTERNS) {
    if (pattern.test(heading) && !found.includes(producer)) found.push(producer)
  }
  return found
}

function regionFromHeading(heading) {
  const text = clean(heading)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.replace(/\s+\d+$/, '')
}

function inferProducer(name, reference, pageProducers) {
  const text = norm(name)
  for (const [pattern, producer] of PRODUCER_PATTERNS) {
    if (pattern.test(name)) return producer
  }
  if (/^12/.test(String(reference)) && /monopole|cune|imperial|asua|ribera del duero/.test(text)) return 'C.V.N.E.'
  if (/^40/.test(String(reference)) && /enate/.test(text)) return 'ENATE'
  if (/^45/.test(String(reference))) return 'BODEGA PEGASO VIÑAS VIEJAS'
  if (pageProducers.length === 1) return pageProducers[0]
  for (const producer of pageProducers) {
    const token = norm(producer).split(' ')[0]
    if (token && text.includes(token)) return producer
  }
  return pageProducers[0] || ''
}

function cleanRegionForProduct(region, name) {
  const n = norm(name)
  if (/champagne/.test(n)) return 'Champagne'
  if (/cava/.test(n)) return 'D.O. Cava'
  return region
}

function fallbackRegion(region, bodega, name) {
  if (region) return region === 'Cava' ? 'D.O. Cava' : region
  const producer = norm(bodega)
  const product = norm(name)
  if (/roger goulart|juve|camps/.test(producer)) return 'D.O. Cava'
  if (/bela|convento san francisco|pagos de anguix|dominio de es|pingus|villacreces|la horra|calogia|protos|antidoto/.test(producer)) return 'D.O. Ribera del Duero'
  if (/c\.v\.n\.e|cvne/.test(producer) && /ribera|bela|vallejo|arano|aurea|minerva/.test(product)) return 'D.O. Ribera del Duero'
  if (/c\.v\.n\.e|cvne|vina real|contino|izadi|orben|ijalba|valpiedra|bujanda|exopto|gregorio martinez|artadi/.test(producer)) return 'D.O. Ca. Rioja'
  if (/enate|laus/.test(producer)) return 'D.O. Somontano'
  if (/fdo\. de castilla|fernando de castilla|faustino gonzalez|alvear/.test(producer)) return 'D.O. Jerez'
  if (/menade|vetus/.test(producer) || /rueda|verdejo|monopole siglo xxi/.test(product)) return 'D.O. Rueda'
  return ''
}

function parseProductLine(line, page) {
  line = clean(line).replace(/^(?:\d{2,3}\+?(?:\s*-\s*\d{2,3})?\s+)+(?=\d{4,6}\b)/, '')
  const match = line.match(/^(\d{3,6})\s*(.+?)\s+((?:18,7|18,75|37,5|50|75|100|150|300|600|800|1\.600|1600)\s*cl\.?|\d+\.?\d*\s*L\.?)\s*((?:\d{1,3}(?:[.,]\d{3})*|\d{1,4})(?:[.,]\d{2}))\s*€/i)
  if (!match) return null
  const [, reference, rawName, format, price] = match
  const name = normalizeName(rawName)
  if (!name || FOOD_WORDS.test(name)) return null
  const bodega = inferProducer(name, reference, page.producers)
  if (!bodega) return null
  const region = fallbackRegion(cleanRegionForProduct(page.region, name), bodega, name)
  return {
    nombre: name,
    bodega,
    tipo: page.category ? typeFrom(page.category, name) || typeFrom(region, name) : typeFrom(region, name),
    region,
    uva: '',
    anada: (clean(rawName).match(/\b((?:19|20)\d{2})\b/) || [])[1] || '',
    referencia: clean(reference),
    formato: clean(format),
    coste_estimado: money(price),
    pvp_recomendado: 0,
    disponibilidad: 'Soto mayo 2026',
    notas: `TARIFA SOTO MAYO 2026 pagina ${page.page}`,
  }
}

function isRegionLine(line) {
  return /^(CHAMPAGNE|DOMAINES|D\.O|D\.O\.|D\.O\.P|VINOS|CHILE|ARGENTINA|ITALIA|FRANCIA|L\.G\.P|PAIS VASCO|DOP|IGP|OTRA D\.O\.)/i.test(line)
}

function isCategoryLine(line) {
  return /^(Tintos|Blancos|Blanco|Rosados|Rosado|Espumosos|Dulces|Generosos|Parcelarios|Champagne)$/i.test(line)
}

function producerFromLine(line) {
  const text = clean(line)
  if (!text || text.length > 80) return ''
  if (isRegionLine(text) || isCategoryLine(text)) return ''
  if (/^\d/.test(text) || /[€]|\.\.\.|consultar/i.test(text)) return ''
  if (/^(Empresa|Protos|La bodega|La familia|Nuevo proyecto|Más de|Cvne|El grupo|El verdejo|cosecha|encontrado|de las bodegas|para crear|tradición|por lograr|Tintos|Blancos|vi[nñ]edos asentados)/i.test(text)) return ''
  for (const [pattern, producer] of PRODUCER_PATTERNS) {
    if (pattern.test(text)) return producer
  }
  if (/^(BODEGA|BODEGAS|VIÑA|VIÑEDOS|DOMINIO|FINCA|CHÂTEAU|CHATEAU|ADEGA|DOMAINE|CASA|CANTINA)\b/.test(text)) return text
  return ''
}

function prepareProductLines(lines) {
  const prepared = []
  for (let i = 0; i < lines.length; i++) {
    let line = clean(lines[i])
    if (!line) continue
    const next = clean(lines[i + 1] || '')
    const next2 = clean(lines[i + 2] || '')
    if (/^\d{3,6}\b/.test(line) && !/€/.test(line) && /\b(?:18,7|18,75|37,5|50|75|100|150|300|600|800|1\.600|1600)\s*cl\.?\b/i.test(next) && /€/.test(next)) {
      line = `${line} ${next}`
      i++
    } else if (!/^\d{3,6}\b/.test(line) && /\b(?:18,7|18,75|37,5|50|75|100|150|300|600|800|1\.600|1600)\s*cl\.?\b/i.test(line) && /€/.test(line) && /^\d{3,6}\b/.test(next)) {
      line = `${next} ${line}`
      i++
    } else if (!/^\d{3,6}\b/.test(line) && !/€/.test(line) && /^\d{3,6}\s+(?:18,7|18,75|37,5|50|75|100|150|300|600|800|1\.600|1600)\s*cl\.?/i.test(next) && /€/.test(next)) {
      line = next.replace(/^(\d{3,6})\s+/, `$1 ${line} `)
      i++
    } else if (/^\d{3,6}\b/.test(line) && !/€/.test(line) && next && !/^\d{3,6}\b/.test(next) && !isRegionLine(next) && !producerFromLine(next) && /\b(?:18,7|18,75|37,5|50|75|100|150|300|600|800|1\.600|1600)\s*cl\.?\b/i.test(next2) && /€/.test(next2)) {
      line = `${line} ${next} ${next2}`
      i += 2
    }
    prepared.push(line)
  }
  return prepared
}

function extractHeading(lines) {
  const candidates = lines.filter(line =>
    /^(CHAMPAGNE|DOMAINES|D\.O|D\.O\.|D\.O\.P|VINOS|CHILE|ARGENTINA|ITALIA|FRANCIA|L\.G\.P|PAIS VASCO|DOP|IGP)/i.test(line)
  )
  return candidates[candidates.length - 1] || ''
}

async function extractPages(file) {
  const pages = []
  const options = {
    pagerender: async pageData => {
      const content = await pageData.getTextContent()
      const grouped = new Map()
      for (const item of content.items) {
        const text = String(item.str || '').trim()
        if (!text) continue
        const x = Math.round(item.transform[4])
        const y = Math.round(item.transform[5])
        const key = String(y)
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key).push({ x, text })
      }
      const lines = Array.from(grouped.entries())
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([, items]) => items.sort((a, b) => a.x - b.x).map(item => item.text).join(' '))
        .join('\n')
      pages.push(lines)
      return lines
    }
  }
  await pdf(fs.readFileSync(file), options)
  return pages
}

async function main() {
  if (!fs.existsSync(input)) throw new Error(`No existe ${input}`)
  fs.mkdirSync(outputDir, { recursive: true })
  const pages = await extractPages(input)
  const parsedPages = pages.map((text, index) => {
    const lines = text.split(/\r?\n/).map(clean).filter(Boolean)
    const heading = extractHeading(lines)
    return {
      page: index + 1,
      heading,
      region: regionFromHeading(heading),
      producers: producersFromHeading(heading),
      lines,
    }
  })

  const rawRows = []
  for (const page of parsedPages) {
    let currentRegion = page.region
    let currentProducer = page.producers[0] || ''
    let currentCategory = ''
    for (const line of prepareProductLines(page.lines)) {
      if (isRegionLine(line)) {
        currentRegion = regionFromHeading(line)
        const producers = producersFromHeading(line)
        if (producers.length) currentProducer = producers[0]
        currentCategory = ''
        continue
      }
      if (isCategoryLine(line)) {
        currentCategory = line
        continue
      }
      const producerLine = producerFromLine(line)
      if (producerLine) {
        currentProducer = producerLine
        currentCategory = ''
        continue
      }
      const row = parseProductLine(line, {
        ...page,
        region: currentRegion,
        producers: currentProducer ? [currentProducer] : page.producers,
        category: currentCategory,
      })
      if (row) rawRows.push(row)
    }
  }

  const deduped = new Map()
  for (const row of rawRows) {
    const key = [row.referencia, row.nombre, row.formato, row.coste_estimado].map(value => String(value).toLowerCase()).join('|')
    deduped.set(key, row)
  }
  const rows = Array.from(deduped.values()).sort((a, b) => Number(a.referencia) - Number(b.referencia))

  const review = rows.map(row => ({
    ...row,
    revisar: [
      !row.bodega ? 'sin bodega' : '',
      !row.region ? 'sin region' : '',
      !row.tipo ? 'sin tipo' : '',
      !row.coste_estimado ? 'sin precio' : '',
    ].filter(Boolean).join(' | '),
  }))

  const resumen = [
    ['archivo', path.basename(input)],
    ['paginas', pages.length],
    ['filas_detectadas', rawRows.length],
    ['filas_unicas', rows.length],
    ['sin_bodega', rows.filter(row => !row.bodega).length],
    ['sin_region', rows.filter(row => !row.region).length],
    ['sin_tipo', rows.filter(row => !row.tipo).length],
    ['sin_precio', rows.filter(row => !row.coste_estimado).length],
    ['bodegas', new Set(rows.map(row => row.bodega)).size],
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(review), 'Import app')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parsedPages.map(page => ({
    page: page.page,
    heading: page.heading,
    region: page.region,
    producers: page.producers.join(' | '),
  }))), 'Paginas')

  const xlsxPath = path.join(outputDir, 'exclusivas_soto_mayo_2026_revision.xlsx')
  const csvPath = path.join(outputDir, 'exclusivas_soto_mayo_2026_import_app.csv')
  XLSX.writeFile(wb, xlsxPath)
  fs.writeFileSync(csvPath, XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)), 'utf8')

  console.log(JSON.stringify({
    input,
    xlsx: xlsxPath,
    csv: csvPath,
    resumen: Object.fromEntries(resumen),
    topBodegas: Array.from(rows.reduce((map, row) => {
      map.set(row.bodega, (map.get(row.bodega) || 0) + 1)
      return map
    }, new Map()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 15),
    muestrasRevisar: review.filter(row => row.revisar).slice(0, 20),
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
