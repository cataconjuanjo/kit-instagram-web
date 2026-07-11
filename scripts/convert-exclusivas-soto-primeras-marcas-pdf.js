const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { parseFile, parsePrimerasMarcas } = require('./reimport-exclusivas-soto')

const input = process.argv[2] || 'C:/Users/jjgar/Downloads/Tarifa PRIMERAS MARCAS Abril 2026_v03 (1).pdf'
const outputDir = process.argv[3] || path.join('output', 'catalogos')

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function norm(value) {
  return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeRegion(region) {
  const value = clean(region)
  const plain = norm(value)
  if (!value) return ''
  if (/ribera del duero/.test(plain)) return 'D.O. Ribera del Duero'
  if (/rioja|laguardia/.test(plain)) return 'D.O. Ca. Rioja'
  if (/priorat/.test(plain)) return 'D.O. Ca. Priorat'
  if (/montsant/.test(plain)) return 'D.O. Montsant'
  if (/mallorca/.test(plain)) return 'V.T. Mallorca'
  if (/menorca/.test(plain)) return 'V.T. Menorca'
  if (/alicante/.test(plain)) return 'D.O. Alicante'
  if (/navarra/.test(plain)) return 'D.O. Navarra'
  if (/bierzo/.test(plain)) return 'D.O. Bierzo'
  if (/rias baixas/.test(plain)) return 'D.O. Rias Baixas'
  if (/emporda/.test(plain)) return 'D.O. Empordà'
  if (/terra alta/.test(plain)) return 'D.O. Terra Alta'
  if (/cebreros/.test(plain)) return 'D.O.P. Cebreros'
  if (/madrid/.test(plain)) return 'D.O. Vinos de Madrid'
  if (/valencia/.test(plain)) return 'D.O. Valencia'
  if (/bizkaia|pais vasco/.test(plain)) return 'D.O. Bizkaiko Txakolina'
  if (/ribeira sacra/.test(plain)) return 'D.O. Ribeira Sacra'
  if (/champagne/.test(plain)) return 'Champagne'
  if (/bourgogne|beaujolais|cote de beaune/.test(plain)) return 'Bourgogne'
  if (/bordeaux|pomerol|pauillac|margaux|medoc|saint emilion|saint julien|sauternes/.test(plain)) return 'Bordeaux'
  if (/loire|sancerre/.test(plain)) return 'Loire'
  if (/alsace/.test(plain)) return 'Alsace'
  if (/rhone|rodano|roussillon/.test(plain)) return 'Rhône'
  if (/provence/.test(plain)) return 'Côtes de Provence'
  if (/friuli/.test(plain)) return 'Friuli'
  if (/piemonte/.test(plain)) return 'Piemonte'
  if (/brunello|toscana|chianti/.test(plain)) return 'Toscana'
  if (/etna|sicilia/.test(plain)) return 'Sicilia'
  if (/douro|porto/.test(plain)) return 'Douro'
  if (/mosel/.test(plain)) return 'Mosel'
  if (/rheingau/.test(plain)) return 'Rheingau'
  if (/california/.test(plain)) return 'California'
  if (/australia/.test(plain)) return 'Australia'
  if (/nueva zelanda/.test(plain)) return 'Nueva Zelanda'
  return value
}

function inferType(row) {
  const text = norm(`${row.tipo} ${row.region} ${row.nombre} ${row.formato}`)
  if (/rosad|rose|clarete|provence/.test(text)) return 'rosado'
  if (/dulce|sauternes|tokaj|moscatel|px|pedro ximenez|cream|mistela|late harvest/.test(text)) return 'dulce'
  if (/jerez|fino|oloroso|amontillado|palo cortado|manzanilla|porto|port|madeira|generoso/.test(text)) return 'generoso'
  if (/sidra|cidre/.test(text)) return 'sidra'
  if (/champagne|cava|brut|espum|cremant/.test(text)) return 'espumoso'
  if (/blanco|blancos|blanc|white|verdejo|godello|albari|chardonnay|sauvignon|riesling|viura|macabeo|chenin|gewurz|pinot gris|friulano/.test(text)) return 'blanco'
  if (/tinto|tintos|rouge|rosso|red|ribera del duero|rioja|priorat|montsant|mallorca|alicante|navarra|bierzo|bourgogne|bordeaux|rhone|piemonte|brunello|toscana|chianti|etna|douro|california|australia|nueva zelanda|tempranillo|garnacha|syrah|shiraz|pinot noir|cabernet|merlot|mencia|monastrell|sangiovese|nebbiolo/.test(text)) return 'tinto'
  if (/whisky|cognac|armagnac|grappa|calvados|rhum|rum|ron|gin|tequila|mezcal|brandy|vermut|orujo|licor|eaux-de-vie|eau de vie/.test(text)) return 'destilado/licor'
  return clean(row.tipo)
}

const PRODUCER_BY_PREFIX = [
  ['1820', 'CONVENTO SAN FRANCISCO'],
  ['1840', 'ABADIA DA COVA'],
  ['1850', 'ITSASMENDI'],
  ['1870', 'RAFAEL CAMBRA'],
  ['1880', 'ORTO VINS'],
  ['1890', 'BODEGAS CINCO LEGUAS'],
  ['1895', 'TELMO RODRÍGUEZ - PEGASO'],
  ['1908', 'DOMINIO DE CALOGÍA'],
  ['1910', 'BODEGA ARTADI'],
  ['1911', 'BODEGA ARTADI'],
  ['1916', 'BODEGA ARTADI'],
  ['1917', 'BODEGA ARTADI'],
  ['1915', 'VIÑA SASTRE'],
  ['1920', 'ÀNIMA NEGRA'],
  ['1921', 'ÀNIMA NEGRA'],
  ['1930', 'PUJANZA'],
  ['1948', 'LA VINYA DEL VUIT'],
  ['1950', 'TERRA REMOTA'],
  ['1951', 'TERRA REMOTA'],
  ['1970', 'LÓPEZ DE HEREDIA'],
  ['1971', 'LÓPEZ DE HEREDIA'],
  ['1979', 'LÓPEZ DE HEREDIA'],
  ['1980', 'TELMO RODRÍGUEZ'],
  ['1990', 'EDETÀRIA'],
  ['1991', 'EDETÀRIA'],
  ['2000', 'CLOS MOGADOR'],
  ['2010', 'CLOS MOGADOR'],
  ['2013', 'CLOS MOGADOR'],
  ['2014', 'CLOS MOGADOR'],
  ['2015', 'CLOS MOGADOR'],
  ['2016', 'CLOS MOGADOR'],
  ['2017', 'CLOS MOGADOR'],
  ['2018', 'CLOS MOGADOR'],
  ['2019', 'CLOS MOGADOR'],
  ['2020', 'CLOS MOGADOR'],
  ['2021', 'CLOS MOGADOR'],
  ['2022', 'CLOS MOGADOR'],
  ['2023', 'CLOS MOGADOR'],
  ['2100', 'TERROIR AL LÍMIT'],
  ['2108', 'TERROIR SENSE FRONTERES'],
  ['2200', 'BODEGA EL SEQUÉ'],
  ['2500', 'BODEGA ARTAZU'],
  ['2600', 'IZAR-LEKU'],
  ['2700', 'TORRALBA'],
  ['2800', 'DOMINIO DE LA BIENVENIDA'],
  ['4100', 'DISZNÓKÓ'],
  ['4200', 'MERRY EDWARDS'],
  ['4300', 'AMISFIELD'],
  ['5001', 'HOSPICES DE BEAUNE'],
  ['5002', 'HOSPICES DE BEAUNE'],
  ['5103', 'GAJA'],
  ['5104', 'GAJA'],
  ['5200', 'FONTODI'],
  ['5201', 'FONTODI'],
  ['5400', 'LIVIO FELLUGA'],
  ['5500', 'FEUDO MONTONI'],
  ['6100', 'QUINTA DO NOVAL'],
  ['6101', 'QUINTA DO NOVAL'],
  ['6110', 'QUINTA DO NOVAL'],
  ['6200', 'RAMOS PINTO'],
  ['6410', 'FERNANDO DE CASTILLA'],
  ['7000', 'LOUIS LATOUR'],
  ['7030', 'LOUIS LATOUR'],
  ['7031', 'LOUIS LATOUR'],
  ['7032', 'LOUIS LATOUR'],
  ['7110', 'LOUIS ROEDERER'],
  ['7111', 'LOUIS ROEDERER'],
  ['7112', 'LOUIS ROEDERER'],
  ['7120', 'DOMAINES OTT'],
  ['7121', 'DOMAINES OTT'],
  ['7200', 'ETS. JEAN PIERRE MOUEIX'],
  ['7205', 'ETS. JEAN PIERRE MOUEIX'],
  ['7206', 'ETS. JEAN PIERRE MOUEIX'],
  ['7207', 'THIENPONT'],
  ['7208', 'BORDEAUX'],
  ['7215', 'DOMINUS ESTATE'],
  ['7220', 'BORDEAUX'],
  ['7300', 'LÉON BEYER'],
  ['7302', 'LÉON BEYER'],
  ['7400', 'KÜNSTLER'],
  ['7509', 'M. CHAPOUTIER'],
  ['7505', 'M. CHAPOUTIER'],
  ['7510', 'M. CHAPOUTIER'],
  ['7530', 'BILA-HAUT'],
  ['7540', 'M. CHAPOUTIER'],
  ['7600', 'MARKUS MOLITOR'],
  ['7809', 'PÉTRUS'],
  ['7811', 'BORDEAUX SÉLECTION'],
  ['7812', 'BORDEAUX SÉLECTION'],
  ['7813', 'BORDEAUX SÉLECTION'],
  ['7814', 'BORDEAUX SÉLECTION'],
  ['7815', 'BORDEAUX SÉLECTION'],
  ['7816', 'BORDEAUX SÉLECTION'],
  ['7817', 'BORDEAUX SÉLECTION'],
  ['7818', 'BORDEAUX SÉLECTION'],
  ['7819', 'BORDEAUX SÉLECTION'],
  ['7820', 'BORDEAUX SÉLECTION'],
  ['7821', 'BORDEAUX SÉLECTION'],
  ['7822', 'BORDEAUX SÉLECTION'],
  ['7823', 'BORDEAUX SÉLECTION'],
  ['7824', 'BORDEAUX SÉLECTION'],
  ['7825', 'CHÂTEAU MARGAUX'],
  ['7826', 'CHÂTEAU PICHON BARON'],
  ['7827', 'BORDEAUX SÉLECTION'],
  ['7900', 'DE LADOUCETTE'],
  ['7902', 'RÉGNARD'],
  ['7903', 'RÉGNARD'],
  ['7910', 'DE LADOUCETTE'],
  ['7920', 'MONT LE VIEUX'],
  ['7930', 'MAISON BRÉDIF'],
  ['8000', 'PRIMERAS MARCAS'],
  ['8100', 'DELAMAIN'],
  ['8200', 'RHUM CLÉMENT'],
  ['8220', 'ADMIRAL RODNEY'],
  ['8300', 'DARTIGALONGUE'],
  ['8500', 'ROGER GROULT'],
  ['8501', 'ROGER GROULT'],
  ['8700', 'LÉON BEYER'],
  ['8800', 'GLENFARCLAS'],
  ['8805', 'HIGHLAND DREAM'],
  ['8883', 'GLENFARCLAS'],
  ['8900', 'FEFIÑANES'],
  ['9000', 'NONINO'],
  ['9100', 'MORAND'],
  ['9200', 'GAJA'],
  ['9300', 'BELLEVOYE'],
  ['9305', 'EL PASADOR DE ORO'],
  ['9400', 'DON FULANO'],
  ['9500', 'CONVITE'],
  ['9600', 'ESPERIT ROCA'],
]

function producerFromReference(reference) {
  const ref = String(reference || '')
  const hit = PRODUCER_BY_PREFIX
    .filter(([prefix]) => ref.startsWith(prefix))
    .sort((a, b) => b[0].length - a[0].length)[0]
  return hit ? hit[1] : ''
}

function producerFromName(name) {
  const value = clean(name).replace(/\b(19|20)\d{2}\b.*$/, '').trim()
  const chateau = value.match(/^(Ch\.|Château|Chateau)\s+(.+?)(?:\s+(?:G\.|Grand|Cru|C\.|Classé|Classe|Village|Villages|1º|1er)\b|$)/i)
  if (chateau) return clean(`${chateau[1]} ${chateau[2]}`)
  const proper = value.match(/^([A-ZÁÉÍÓÚÀÈÏÜÑ][\wÁÉÍÓÚÀÈÏÜÑáéíóúàèïüñ'.-]+(?:\s+(?:de|del|la|las|los|du|des|d'|[A-ZÁÉÍÓÚÀÈÏÜÑ][\wÁÉÍÓÚÀÈÏÜÑáéíóúàèïüñ'.-]+)){0,3})/)
  return proper ? clean(proper[1]) : ''
}

function isBadProducer(value) {
  const plain = norm(value)
  return !plain ||
    /denominacion de origen|periodistas del vino|triple malt|vigne au saint|perez ovejas|vinos llenos|grandes vinos|referencia|articulo/.test(plain)
}

function inferBodega(row) {
  if (!isBadProducer(row.bodega)) return clean(row.bodega)
  return producerFromReference(row.referencia) || producerFromName(row.nombre)
}

function isExcluded(row) {
  const text = norm(`${row.region} ${row.nombre} ${row.bodega}`)
  const name = clean(row.nombre)
  const reference = clean(row.referencia)
  return /aceite|vinagre|aceto|balsamico|coravin|lehmann|accesorio|copa|decanter|sacacorchos/.test(text) ||
    /^º/.test(name) ||
    /^A\*+$/i.test(name) ||
    reference.length < 5
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

  const parsed = await parseFile(input, parsePrimerasMarcas)
  const rows = parsed
    .filter(row => !isExcluded(row))
    .map(row => ({
      nombre: clean(row.nombre),
      bodega: inferBodega(row),
      tipo: inferType(row),
      region: normalizeRegion(row.region),
      uva: clean(row.uva),
      anada: clean(row.anada),
      referencia: clean(row.referencia),
      formato: clean(row.formato).replace(/\s*Â·\s*/g, ' · '),
      coste_estimado: Number(row.coste_estimado) || 0,
      pvp_recomendado: 0,
      disponibilidad: 'Primeras Marcas abril 2026',
      notas: `PRIMERAS MARCAS Abril 2026 ref ${clean(row.referencia)}`,
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

  const xlsxPath = path.join(outputDir, 'exclusivas_soto_primeras_marcas_abril_2026_revision.xlsx')
  const csvPath = path.join(outputDir, 'exclusivas_soto_primeras_marcas_abril_2026_import_app.csv')
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
