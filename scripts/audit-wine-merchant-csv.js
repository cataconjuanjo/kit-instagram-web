const fs = require('fs')
const { parseAll } = require('./reimport-exclusivas-soto')

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

async function main() {
  const csvPath = 'C:/Users/jjgar/Downloads/wine_merchant_mayo2026.csv'
  const text = fs.readFileSync(csvPath, 'utf8')
  const rows = parseCsv(text)
  const header = rows[0]
  const data = rows.slice(1).map(row => Object.fromEntries(header.map((column, index) => [column, row[index] || ''])))
  const vintageKey = header.find(column => column.toLowerCase().includes('ada')) || 'Añada'

  const byReference = new Map()
  for (const row of data) {
    if (!byReference.has(row.Referencia)) byReference.set(row.Referencia, [])
    byReference.get(row.Referencia).push(row)
  }

  const duplicated = [...byReference.entries()].filter(([, values]) => values.length > 1)
  const conflicts = duplicated.filter(([, values]) => {
    const signatures = values.map(row => [row.Articulo, row[vintageKey], row.Formato, row.Precio].join('|'))
    return new Set(signatures).size > 1
  })

  const missing = data.filter(row => !row.Productor || !row.Articulo || !row.Referencia || !row.Precio)

  const { rows: parsedRows } = await parseAll()
  const parsedWineMerchant = parsedRows.filter(row => row.disponibilidad === 'Wine Merchant mayo 2026')
  const parsedSignatures = new Set(parsedWineMerchant.map(row => [
    row.referencia,
    row.nombre.replace(/\s+(?:19|20)\d{2}$/, ''),
    row.anada,
    row.formato,
    String(row.coste_estimado),
  ].join('|').toLowerCase()))

  const omitted = data.filter(row => {
    const price = Number(String(row.Precio || '').replace(/[^\d.,]/g, '').replace(',', '.')) || 0
    const signature = [
      row.Referencia,
      row.Articulo,
      row[vintageKey],
      row.Formato,
      String(price),
    ].join('|').toLowerCase()
    return !parsedSignatures.has(signature)
  })

  console.log(JSON.stringify({
    file: csvPath,
    rows: data.length,
    header,
    vintageKey,
    productores: new Set(data.map(row => row.Productor).filter(Boolean)).size,
    referencias: new Set(data.map(row => row.Referencia).filter(Boolean)).size,
    referenciasDuplicadas: duplicated.length,
    referenciasConflictivas: conflicts.length,
    incompletas: missing.length,
    implementadas: parsedWineMerchant.length,
    omitidasPorParser: omitted.length,
    omitidas: omitted.slice(0, 20),
    conflictos: conflicts.slice(0, 12).map(([reference, values]) => ({
      referencia: reference,
      items: values.map(row => ({
        articulo: row.Articulo,
        anada: row[vintageKey],
        formato: row.Formato,
        precio: row.Precio,
      })),
    })),
    primerasFilas: data.slice(0, 5),
  }, null, 2))
}

main()
