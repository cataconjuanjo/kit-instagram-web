const fs = require('fs')
const path = require('path')
const pdf = require('pdf-parse')

function money(value) {
  if (!value) return 0
  const raw = String(value).replace(/\s/g, '').replace(/[^\d.,]/g, '')
  if (!raw) return 0
  const decimal = raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  return Number(decimal) || 0
}

function parseCsv(text) {
  const rows = []
  let row = []
  let current = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        current += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      row.push(current)
      current = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++
      row.push(current)
      if (row.some(value => value !== '')) rows.push(row)
      row = []
      current = ''
    } else {
      current += char
    }
  }

  if (current || row.length) {
    row.push(current)
    rows.push(row)
  }

  return rows
}

function clean(value) {
  return String(value || '')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\-–—·•\s]+|[\-–—·•\s.]+$/g, '')
    .trim()
}

function parseWineMerchantCsv(file) {
  const text = fs.readFileSync(file, 'utf8')
  const rows = parseCsv(text)
  const header = rows[0] || []
  const vintageKey = header.find(column => column.toLowerCase().includes('ada')) || 'Añada'
  return rows.slice(1).map(row => Object.fromEntries(header.map((column, index) => [column, row[index] || ''])))
    .filter(row => row.Productor && row.Referencia && row.Articulo && row.Precio)
    .map(row => ({
      nombre: normalizeName(row.Articulo, row[vintageKey], row.Productor),
      bodega: sanitizeProducer(row.Productor),
      tipo: typeFrom(row.Region, row.Articulo, row.Variedad),
      region: clean(row.Region),
      uva: clean(row.Variedad),
      anada: clean(row[vintageKey]),
      referencia: clean(row.Referencia),
      formato: clean(row.Formato),
      coste_estimado: money(row.Precio),
      disponibilidad: 'Wine Merchant mayo 2026',
      activo: true,
    }))
    .filter(row => row.nombre && row.bodega && row.coste_estimado > 0)
}

function typeFrom(context, name = '', variety = '') {
  const text = `${context} ${name} ${variety}`.toLowerCase()
  if (/rosad|clarete|rose|rosé/.test(text)) return 'rosado'
  if (/blanc|chardonnay|verdejo|godello|albari|sauvignon|riesling|viura|malvas/.test(text)) return 'blanco'
  if (/cava|champagne|espum|corpinnat|pet-nat|pét-nat/.test(text)) return 'espumoso'
  if (/jerez|oloroso|amontillado|fino|manzanilla|palo cortado|generoso/.test(text)) return 'generoso'
  if (/dulce|moscatel|sauternes|tokaj|px|pedro xim/.test(text)) return 'dulce'
  if (/tinto|rouge|rosso|syrah|garnacha|tempranillo|cabernet|merlot|pinot|mencia|mencía|cariñena|monastrell/.test(text)) return 'tinto'
  return ''
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeName(name, year, producer) {
  let result = clean(name)
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\b\d{2,4}(?:[,.]\d)?\s*cl\b/ig, '')
    .replace(/\b\d+\s*u\/c\b/ig, '')
    .replace(/\bEst\.?(?:\s*Mad\.)?/ig, '')
    .replace(/\s+/g, ' ')
    .trim()
  const generic = /^(crianza|reserva|gran reserva|verdejo|sauvignon|rosado|blanco|tinto|syrah|chardonnay|roble)$/i.test(result)
  if (generic && producer && !new RegExp(`^${escapeRegExp(producer)}`, 'i').test(result)) {
    result = `${producer} ${result}`
  }
  const cleanYear = clean(year)
  if (!cleanYear || new RegExp(`\\b${escapeRegExp(cleanYear)}$`, 'i').test(result)) return result
  return `${result} ${cleanYear}`
}

function isNoiseName(name) {
  return !name || name.length < 3 || /^(tintos|blancos|rosados|referencia|articulo|artículo|precio|formato|variedad|añada|indice|bebidas|alimentacion|alimentación)$/i.test(name)
}

function isProducerLine(line) {
  return /^\p{Lu}/u.test(line) &&
    !/^(de|del|el|la|las|los|sus|para|con|por|en|y)\b/i.test(line) &&
    !/^(Vinos|Grandes|Nuevo|Nueva|Vanguardia|Bodega familiar|Descubre|Elabora|Sus|Su)\b/i.test(line) &&
    !/[.;:]/.test(line) &&
    line.length <= 70
}

function inferProducer(name, reference = '') {
  const text = name.toLowerCase()
  if (/^703\d+/.test(String(reference))) return 'Louis Latour'
  if (/^11SCH/i.test(String(reference)) || /^j\.l\. chave/i.test(name)) return 'J.L. CHAVE SELECTION'
  if (/^11YCH/i.test(String(reference)) || /^yann chave/i.test(name)) return 'YANN CHAVE'
  if (/^11T|^11D|^11L/i.test(String(reference)) || /^terroir al límit|^terroir al limit/i.test(name)) return 'TERROIR AL LÍMIT'
  if (/^terroir s\. fronteres|^terroir sense fronteres/i.test(name)) return 'TERROIR SENSE FRONTERES'
  if (/^11SG|^salvajes de gredos/i.test(name)) return 'SALVAJES DE GREDOS'
  if (/^protos\b/.test(text)) return 'BODEGAS PROTOS'
  if (/^enate\b/.test(text)) return 'ENATE'
  if (/^cune\b|^monopole\b|^viña real\b|^imperial\b|^asúa\b/i.test(name)) return 'C.V.N.E.'
  if (/^viña aliaga\b/i.test(name)) return 'VIÑA ALIAGA'
  if (/^vetus\b/i.test(name)) return 'BODEGAS VETUS'
  if (/^izadi\b/i.test(name)) return 'BODEGA IZADI'
  if (/^orube\b|^orben\b/i.test(name)) return 'ORBEN'
  if (/^ij?alba\b/i.test(name)) return 'VIÑA IJALBA'
  if (/^juvé|^milesimé|^essential\b/i.test(name)) return 'JUVÉ & CAMPS'
  if (/^roger goulart\b|^collection\b|^brut\b|^gran reserva\b/i.test(name)) return 'ROGER GOULART'
  if (/^la maldición\b/i.test(name)) return 'CINCO LEGUAS'
  if (/^mantel\b/i.test(name)) return 'C.V.N.E.'
  if (/beaujolais|chameroy|moulin a vent|moulin-à-vent|cuvée latour|cuvee latour|bourgogne gamay|les pierres dorées|macon lugny|pouilly-fuissé|côte de beaune|chassagne|meursault|puligny|chambolle|gevrey|vosne|alo[eó]xe|pommard|volnay|corton/i.test(name)) return 'Louis Latour'
  return ''
}

function sanitizeProducer(value) {
  const producer = clean(value)
  if (!producer) return ''
  const plain = producer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (plain === 'j.l. chave selection') return 'J.L. CHAVE SELECTION'
  if (plain === 'yann chave') return 'YANN CHAVE'
  if (/^champagne\s+\S+/.test(plain)) return producer
  if (/\b(tintos|blancos|rosados|espumosos|dulces|generosos|txacoli|txakoli|cava|champagne|bourgogne|rioja|ribera|priorat|montsant|rodano|loira|burdeos|alsacia|friuli|madiera|madeira|porto|port|jerez|beaujolais|sancerre|sauvignon|hermitage|crozes-hermitage|saint joseph|crianza oxidativa)\b/.test(plain)) return ''
  if (/\b(vinos llenos|grandes vinos|de gran|vanguardia|autenticidad|prestigio|calidad|region|referencia|articulo|precio|formato|variedad|anada|producciones limitadas|elaborados artesanales|consultar|crus de|ibiza y cannes|petrus y yquem|trotanoy|belair|esperit roca|vieilles reserves|reserves|selection)\b/.test(plain)) return ''
  if (/^(de|del|el|la|las|los|sus|su|para|con|por|en|y)\b/.test(plain)) return ''
  if (producer.length > 70) return ''
  if (plain === 'terroir al limit') return 'TERROIR AL LÍMIT'
  if (plain === 'c.v.n.e') return 'C.V.N.E.'
  return producer
}

function hasReliableProducer(row) {
  return Boolean(sanitizeProducer(row.bodega))
}

function splitNameVintageFormat(value) {
  const text = clean(value)
  const match = text.match(/^(.*?)(?:(?:\s*)((?:19|20)\d{2}))?\s*((?:18,7|37,5|50|75|100|150|300|600|800|1\.600|1600)\s*cl\.?)\s*(.*)$/i)
  if (!match) return null
  return {
    name: clean(match[1]),
    vintage: match[2] || '',
    format: clean(match[3]),
    extra: clean(match[4]),
  }
}

function isUpperHeading(line) {
  return /^[^\p{Ll}]{4,}$/u.test(line) && /[A-Z]/i.test(line)
}

function parseWineMerchant(lines) {
  const rows = []
  let region = ''
  let producer = ''
  for (const line of lines.map(clean)) {
    if (!line) continue
    if (isUpperHeading(line) && !/[|]|\d+\s*$/.test(line) && !/[\u20ac]|\d{4}.*cl/i.test(line)) {
      if (/^(ESPAÑA|FRANCIA|ITALIA|AUSTRIA|ALEMANIA|HUNGRÍA|TOKAJI|CALIFORNIA|PRIORAT|RÓDANO|LOIRA|BORGOÑA|ALSACIA|CHAMPAGNE|CUPOS|Referencia Art)/i.test(line)) region = line
      else producer = line
      continue
    }
    if (!/[\u20ac]/.test(line) || !/^\d{2}[A-Z]{3,4}\d{5}/.test(line)) continue
    const match = line.match(/^(\d{2}[A-Z]{3,4}\d{5})\s*(.*?)\s*((?:19|20)\d{2})\s*(\d{2,4}(?:[,.]\d)?\s*cl)\s*(.*?)\s*(\d{1,4}(?:[.,]\d{2}))\s*[\u20ac]\s*(.*)$/i)
    if (!match) continue
    const [, reference, before, vintage, format, variety, price, after] = match
    let name = clean(after && after.length > 6 ? after : before)
    if (isNoiseName(name)) name = clean(before)
    if (isNoiseName(name)) continue
    rows.push({
      nombre: normalizeName(name, vintage, ''),
      bodega: clean(inferProducer(name, reference) || sanitizeProducer(producer) || name.split(' ').slice(0, 3).join(' ')),
      tipo: typeFrom(region, name, variety),
      region,
      uva: clean(variety),
      anada: vintage,
      referencia: reference,
      formato: clean(format),
      coste_estimado: money(price),
      disponibilidad: 'Wine Merchant mayo 2026',
      activo: true,
    })
  }
  return rows
}

function parsePrimerasMarcas(lines) {
  const rows = []
  let region = ''
  let category = ''
  let producer = ''
  const productStart = /^[ⓃⒺ\s]*\d{4,6}/
  for (let i = 0; i < lines.length; i++) {
    const line = clean(lines[i])
    if (!line) continue
    if (/^(Tintos|Blancos|Rosados|Espumosos|Dulces|Generosos)$/i.test(line)) {
      category = line
      continue
    }
    if (isUpperHeading(line) && !/[\u20ac]|\d/.test(line)) {
      region = line
      continue
    }
    if (isProducerLine(line) && /^\p{Lu}?\p{Ll}[\p{L}.]*(?:\s+(?:de|del|la|las|los|y|[A-Z]\.?|\p{Lu}?\p{Ll}[\p{L}.]*)){1,5}$/u.test(line) && !productStart.test(line)) {
      producer = line
      continue
    }
    if (!productStart.test(line)) continue

    let row = line
    let guard = 0
    while (!/\d{1,4}(?:[.,]\d{2})\s*$/.test(row) && guard < 4 && i + 1 < lines.length) {
      const next = clean(lines[i + 1])
      if (productStart.test(next) || /^(Tintos|Blancos|Rosados|Espumosos|Dulces|Generosos)$/i.test(next)) break
      row += ` ${next}`
      i++
      guard++
    }

    const start = row.match(/^[ⓃⒺ\s]*(\d{4,6})(.*)$/)
    if (!start) continue
    const reference = start[1]
    let rest = clean(start[2])
    const priceMatch = rest.match(/(\d{1,4}(?:[.,]\d{2}))\s*$/)
    if (!priceMatch) continue
    const price = money(priceMatch[1])
    rest = clean(rest.slice(0, priceMatch.index))
    const parts = splitNameVintageFormat(rest)
    if (!parts) continue
    const format = parts.format
    const extra = parts.extra
    const vintage = parts.vintage
    const rawName = parts.name
    const name = normalizeName(rawName, vintage, producer)
    if (isNoiseName(name)) continue
    rows.push({
      nombre: name,
      bodega: clean(inferProducer(name, reference) || sanitizeProducer(producer)),
      tipo: typeFrom(category, name, extra),
      region,
      uva: '',
      anada: vintage,
      referencia: reference,
      formato: [format, extra].filter(Boolean).join(' · '),
      coste_estimado: price,
      disponibilidad: 'Primeras Marcas abril 2026',
      activo: true,
    })
  }
  return rows
}

function parseSoto(lines) {
  const rows = []
  let region = ''
  let producer = ''
  const foodWords = /jam[oó]n|paleta|chorizo|salchich[oó]n|lomo|queso|anchoa|bacalao|aceite|vinagre|morc[oó]n|solomillo|presa|pluma|carrillera|foie|confit|magret|rillettes|bolsa|caja|copa|decanter|coravin|riedel/i
  for (const line of lines.map(clean)) {
    if (!line) continue
    if (/^(D\.O\.|CHAMPAGNE|VINOS|CHILE|ARGENTINA|ITALIA|FRANCIA)/i.test(line)) {
      region = line.replace(/\.{2,}.*/, '')
      continue
    }
    if (/^(PACHARANES|RIEDEL|CORAVIN|JAMONES|CARNES|BACALAO|ACEITES)/i.test(line)) continue
    if (isUpperHeading(line) && !/[\u20ac]|\.{2,}/.test(line)) {
      producer = line
      continue
    }
    const match = line.match(/^(\d{3,6})(.+?)\s+(\d{2,4}(?:[,.]\d)?\s*cl\.?|\d+\.?\d*\s*L\.?)\s*(\d{1,4}(?:[.,]\d{2}))\s*[\u20ac]/i)
    if (!match) continue
    const [, reference, rawName, format, price] = match
    const name = normalizeName(rawName, '', '')
    if (foodWords.test(name)) continue
    if (isNoiseName(name)) continue
    const inferredProducer = inferProducer(name, reference)
    rows.push({
      nombre: name,
      bodega: clean(inferredProducer || sanitizeProducer(producer)),
      tipo: typeFrom('', name, ''),
      region: '',
      uva: '',
      anada: '',
      referencia: reference,
      formato: clean(format),
      coste_estimado: money(price),
      disponibilidad: 'Soto mayo 2026',
      activo: true,
    })
  }
  return rows
}

async function parseFile(file, parser) {
  const data = await pdf(fs.readFileSync(file))
  const lines = data.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return parser(lines)
}

async function parseAll() {
  const downloads = 'C:/Users/jjgar/Downloads'
  const wineMerchantCsv = path.join(downloads, 'wine_merchant_mayo2026.csv')
  const specs = [
    fs.existsSync(wineMerchantCsv)
      ? ['wine_merchant_mayo2026.csv', null]
      : ['Wine Merchant mayo 2026.pdf', parseWineMerchant],
    ['Tarifa PRIMERAS MARCAS Abril 2026_v03.pdf', parsePrimerasMarcas],
    ['TARIFA SOTO MAYO 2026.pdf', parseSoto],
  ]
  const result = []
  const byFile = {}
  for (const [name, parser] of specs) {
    const rows = parser
      ? await parseFile(path.join(downloads, name), parser)
      : parseWineMerchantCsv(path.join(downloads, name))
    byFile[name] = rows.length
    result.push(...rows)
  }
  const deduped = new Map()
  for (const row of result) {
    row.bodega = sanitizeProducer(row.bodega)
    const key = [
      row.referencia || '',
      row.nombre || '',
      row.anada || '',
      row.formato || '',
      row.coste_estimado || '',
    ].map(value => String(value).trim().toLowerCase()).join('|')
    deduped.set(key, row)
  }
  return { rows: [...deduped.values()], byFile }
}

module.exports = { parseAll }

if (require.main === module) {
  parseAll().then(({ rows, byFile }) => {
    console.log(JSON.stringify({
      byFile,
      total: rows.length,
      conPrecio: rows.filter(row => row.coste_estimado > 0).length,
      muestras: rows.slice(0, 40).map(row => ({
        nombre: row.nombre,
        bodega: row.bodega,
        region: row.region,
        formato: row.formato,
        coste: row.coste_estimado,
      })),
      sospechosos: rows.filter(row => /\d{4}\s*\d{2,4}|cl\d|u\/c\d/i.test(row.nombre)).slice(0, 30).map(row => row.nombre),
    }, null, 2))
  }).catch(error => {
    console.error(error)
    process.exit(1)
  })
}
