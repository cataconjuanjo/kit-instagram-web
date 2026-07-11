const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { parseFile, parseWineMerchant } = require('./reimport-exclusivas-soto')

const input = process.argv[2] || 'C:/Users/jjgar/Downloads/Wine Merchant mayo 2026 (1).pdf'
const outputDir = process.argv[3] || path.join('output', 'catalogos')

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function norm(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function inferType(row) {
  const text = norm(`${row.tipo} ${row.region} ${row.nombre} ${row.uva}`)
  if (/rosad|rose|ros[eé]|rosat|clarete/.test(text)) return 'rosado'
  if (/dulce|sauternes|tokaj|moscatel|moscato|px|pedro ximenez|cream|mistela|late harvest/.test(text)) return 'dulce'
  if (/jerez|fino|oloroso|amontillado|palo cortado|manzanilla|porto|port|madeira|generoso/.test(text)) return 'generoso'
  if (/champagne|cava|brut|espum|cremant|pet nat|blanc de blancs|blanc de noirs/.test(text)) return 'espumoso'
  if (/blanco|blanc|white|gavi|cortese|viognier|verdejo|godello|albari|chardonnay|sauvignon|riesling|viura|macabeo|chenin|gewurz|pinot gris|malvasia|palomino|treixadura|loureiro|xarel/.test(text)) return 'blanco'
  if (/tinto|negre|rouge|rosso|red|barolo|barbaresco|barbera|dolcetto|priorat|montsant|bierzo|rioja|rhone|borgona|bourgogne|bordeaux|california|austria|alemania|nebbiolo|garnacha|carinena|mencia|tempranillo|syrah|shiraz|pinot noir|cabernet|merlot|sumoll|bobal|listan negro/.test(text)) return 'tinto'
  return clean(row.tipo)
}

function normalizeRegion(region) {
  const value = clean(region)
  const plain = norm(value)
  if (!value) return ''
  if (/priorat/.test(plain)) return 'D.O. Ca. Priorat'
  if (/montsant/.test(plain)) return 'D.O. Montsant'
  if (/bierzo/.test(plain)) return 'D.O. Bierzo'
  if (/rioja/.test(plain)) return 'D.O. Ca. Rioja'
  if (/ribeira|rias baixas/.test(plain)) return value
  if (/champagne/.test(plain)) return 'Champagne'
  if (/alsacia|alsace/.test(plain)) return 'Alsace'
  if (/borgona|bourgogne/.test(plain)) return 'Bourgogne'
  if (/loira|loire/.test(plain)) return 'Loire'
  if (/rodano|rhone/.test(plain)) return 'Rhône'
  if (/sauternes/.test(plain)) return 'Sauternes'
  if (/italia/.test(plain)) return 'Italia'
  if (/austria/.test(plain)) return 'Austria'
  if (/alemania/.test(plain)) return 'Alemania'
  if (/hungria|tokaji/.test(plain)) return 'Tokaji'
  if (/california/.test(plain)) return 'California'
  return value
}

function sanitizeProducer(value) {
  const producer = clean(value)
  const plain = norm(producer)
  if (plain === 'terroir s. fronteres') return 'TERROIR SENSE FRONTERES'
  if (plain === 'vsj') return 'VSJ'
  return producer
}

const PRODUCER_PATTERNS = [
  [/^TERROIR AL L[ÍI]MIT\b/i, 'TERROIR AL LÍMIT'],
  [/^TERROIR S\.?\s*FRONTERES\b|^TERROIR SENSE FRONTERES\b/i, 'TERROIR SENSE FRONTERES'],
  [/^MICHAEL W\.?\s*SALVERDA\b/i, 'MICHAEL W. SALVERDA'],
  [/^SALVAJES DE GREDOS\b/i, 'SALVAJES DE GREDOS'],
  [/^BRI[ÓO]N\b/i, 'BRIÓN'],
  [/^DOMINIO DE ANZA\b|^ANZA\b/i, 'DOMINIO DE ANZA'],
  [/^ÁLVAR DE DIOS\b|^ALVAR DE DIOS\b/i, 'ÁLVAR DE DIOS'],
  [/^VSJ\b/i, 'VSJ'],
  [/^DAVID FERN[ÁA]NDEZ\b/i, 'DAVID FERNÁNDEZ'],
  [/^CHAMPAGNE PAUL BARA\b/i, 'CHAMPAGNE PAUL BARA'],
  [/^CHAMPAGNE CR[ÉE]T[ÉE] CHAMBERLIN\b/i, 'CHAMPAGNE CRÉTÉ CHAMBERLIN'],
  [/^MAISON PONSON\b/i, 'MAISON PONSON'],
  [/^DOMAINE JOSMEYER\b/i, 'DOMAINE JOSMEYER'],
  [/^SAMUEL BILLAUD\b/i, 'SAMUEL BILLAUD'],
  [/^DOM\.?\s*DE MONTILLE\b|^DOMAINE DE MONTILLE\b/i, 'DOMAINE DE MONTILLE'],
  [/^DOMAINE DE LA VOUGERAIE\b/i, 'DOMAINE DE LA VOUGERAIE'],
  [/^DOMAINE PIERRE GIRARDIN\b/i, 'DOMAINE PIERRE GIRARDIN'],
  [/^DOMAINE JEAN GRIVOT\b/i, 'DOMAINE JEAN GRIVOT'],
  [/^DOMAINE DE LA BUTTE\b/i, 'DOMAINE DE LA BUTTE'],
  [/^DOMAINE DE LA TAILLE AUX LOUPS\b/i, 'DOMAINE DE LA TAILLE AUX LOUPS'],
  [/^SERGE LALOUE\b/i, 'SERGE LALOUE'],
  [/^J\.?L\.?\s*CHAVE\b|^J\.?L\.?\s*CHAVE SELECTION\b/i, 'J.L. CHAVE SELECTION'],
  [/^YANN CHAVE\b/i, 'YANN CHAVE'],
  [/^DOMAINE XAVIER G[ÉE]RARD\b/i, 'DOMAINE XAVIER GÉRARD'],
  [/^DOMAINE LA BARROCHE\b/i, 'DOMAINE LA BARROCHE'],
  [/^CH[ÂA]TEAU DE FARGUES\b/i, 'CHÂTEAU DE FARGUES'],
  [/^PIO CESARE\b/i, 'PIO CESARE'],
  [/^ELIO ALTARE\b/i, 'ELIO ALTARE'],
  [/^MORIC\b/i, 'MORIC'],
  [/^EMMERICH KNOLL\b/i, 'EMMERICH KNOLL'],
  [/^EVA FRICKE\b/i, 'EVA FRICKE'],
  [/^SZEPSY\b/i, 'SZEPSY'],
  [/^RACINES\b/i, 'RACINES'],
  [/^KONGSGAARD\b/i, 'KONGSGAARD'],
  [/^MAYACAMAS\b/i, 'MAYACAMAS'],
  [/^CERITAS\b/i, 'CERITAS'],
]

function producerFromName(name) {
  const value = clean(name)
  for (const [pattern, producer] of PRODUCER_PATTERNS) {
    if (pattern.test(value)) return producer
  }
  return ''
}

function isBadProducer(value) {
  const plain = norm(value)
  return !plain ||
    /^(insolitos|esenciales|premiers crus|gutswein|gruner veltliner|gelber muskateller|riesling|pinot noir|chardonnay|barbera d.alba|piamonte|toro|bierzo|d.o. penedes|d.o. penedes - massis del garraf)$/.test(plain)
}

function inferBodega(row) {
  const fromName = producerFromName(row.nombre)
  if (fromName) return fromName
  const current = sanitizeProducer(row.bodega)
  return isBadProducer(current) ? current : current
}

function reviewReason(row) {
  return [
    !row.bodega ? 'sin bodega' : '',
    !row.region ? 'sin region' : '',
    !row.tipo ? 'sin tipo' : '',
    !row.coste_estimado ? 'sin precio' : '',
    !row.formato ? 'sin formato' : '',
  ].filter(Boolean).join(' | ')
}

async function main() {
  if (!fs.existsSync(input)) throw new Error(`No existe ${input}`)
  fs.mkdirSync(outputDir, { recursive: true })

  const parsed = await parseFile(input, parseWineMerchant)
  const rows = parsed
    .map(row => ({
      nombre: clean(row.nombre),
      bodega: inferBodega(row),
      tipo: inferType(row),
      region: normalizeRegion(row.region),
      uva: clean(row.uva),
      anada: clean(row.anada),
      referencia: clean(row.referencia),
      formato: clean(row.formato),
      coste_estimado: Number(row.coste_estimado) || 0,
      pvp_recomendado: 0,
      disponibilidad: 'Wine Merchant mayo 2026',
      notas: `Wine Merchant mayo 2026 ref ${clean(row.referencia)}`,
    }))
    .filter(row => row.nombre && row.referencia && row.coste_estimado > 0)

  const deduped = new Map()
  for (const row of rows) {
    const key = [row.referencia, row.nombre, row.anada, row.formato, row.coste_estimado]
      .map(value => String(value).toLowerCase())
      .join('|')
    deduped.set(key, row)
  }
  const finalRows = Array.from(deduped.values()).sort((a, b) => String(a.referencia).localeCompare(String(b.referencia)))
  const review = finalRows.map(row => ({ ...row, revisar: reviewReason(row) }))

  const resumen = [
    ['archivo', path.basename(input)],
    ['filas_detectadas', parsed.length],
    ['filas_unicas_importables', finalRows.length],
    ['sin_bodega', finalRows.filter(row => !row.bodega).length],
    ['sin_region', finalRows.filter(row => !row.region).length],
    ['sin_tipo', finalRows.filter(row => !row.tipo).length],
    ['sin_precio', finalRows.filter(row => !row.coste_estimado).length],
    ['sin_formato', finalRows.filter(row => !row.formato).length],
    ['bodegas', new Set(finalRows.map(row => row.bodega)).size],
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(review), 'Import app')

  const xlsxPath = path.join(outputDir, 'exclusivas_soto_wine_merchant_mayo_2026_revision.xlsx')
  const csvPath = path.join(outputDir, 'exclusivas_soto_wine_merchant_mayo_2026_import_app.csv')
  XLSX.writeFile(wb, xlsxPath)
  fs.writeFileSync(csvPath, XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(finalRows)), 'utf8')

  console.log(JSON.stringify({
    input,
    xlsx: xlsxPath,
    csv: csvPath,
    resumen: Object.fromEntries(resumen),
    topBodegas: Array.from(finalRows.reduce((map, row) => {
      map.set(row.bodega, (map.get(row.bodega) || 0) + 1)
      return map
    }, new Map()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 20),
    muestrasRevisar: review.filter(row => row.revisar).slice(0, 25),
  }, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
