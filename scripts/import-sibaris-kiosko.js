/**
 * Importa el catálogo de Sibaris Gourmet al kiosko virtual.
 *
 * Uso:
 *   node scripts/import-sibaris-kiosko.js --slug sibaris-gourmet --dry-run "ruta/al/archivo.csv"
 *   node scripts/import-sibaris-kiosko.js --slug sibaris-gourmet "ruta/al/archivo.csv"
 *
 * El CSV debe ser el export de Square (Sibaris Gourmet) con columnas:
 *   Nombre, Precio, Categorias, Descripcion, Enlace_producto, Imagen_principal, Todas_las_imagenes
 *
 * Si la tienda con ese slug no existe, el script la crea automáticamente.
 */

const { createClient } = require('@supabase/supabase-js')
const fs   = require('fs')
const path = require('path')

try { process.loadEnvFile('.env.local') } catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ── CLI args ─────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const slugIdx = args.indexOf('--slug')
const SLUG    = slugIdx !== -1 ? args[slugIdx + 1] : 'sibaris-gourmet'
const csvPath = args.find(a => !a.startsWith('--') && a !== SLUG)

if (!csvPath) {
  console.error('Uso: node scripts/import-sibaris-kiosko.js --slug <slug> [--dry-run] <ruta-csv>')
  process.exit(1)
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const raw = text.replace(/^﻿/, '')
  const lines = raw.split(/\r?\n/)

  function parseLine(line) {
    const fields = []
    let i = 0
    while (i <= line.length) {
      if (i === line.length) { fields.push(''); break }
      if (line[i] === '"') {
        let j = i + 1, val = ''
        while (j < line.length) {
          if (line[j] === '"' && line[j + 1] === '"') { val += '"'; j += 2 }
          else if (line[j] === '"') { j++; break }
          else { val += line[j++] }
        }
        fields.push(val)
        i = j
        if (i < line.length && line[i] === ',') i++
      } else {
        let j = i
        while (j < line.length && line[j] !== ',') j++
        fields.push(line.slice(i, j))
        i = j + 1
      }
    }
    return fields
  }

  const headers = parseLine(lines[0]).map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseLine(lines[i])
    const row = {}
    headers.forEach((h, idx) => { row[h] = (vals[idx] ?? '').trim() })
    rows.push(row)
  }
  return rows
}

// ── Tipo desde prefijo del nombre Sibaris ────────────────────────────────────
function tipoDesdePrefix(nombre) {
  const p = (nombre || '').toUpperCase().substring(0, 3)
  const map = {
    VBC: 'blanco',  VBN: 'blanco',  VBI: 'blanco',
    VTC: 'tinto',   VTN: 'tinto',   VTI: 'tinto',
    VRC: 'rosado',  VRN: 'rosado',  VRI: 'rosado',
    VEC: 'espumoso',VEN: 'espumoso',
    VGN: 'generoso',
    VON: 'naranja',
    AOC: 'espumoso',
    SEN: 'dulce',
    SID: 'espumoso',
  }
  return map[p] || null
}

// ── Tipo desde categorías ─────────────────────────────────────────────────────
function tipoDesdeCategoria(cats) {
  const c = cats.toLowerCase()
  if (c.includes('champagne') || c.includes('espumoso') || c.includes('cava') || c.includes('prosecco')) return 'espumoso'
  if (c.includes('blanco'))    return 'blanco'
  if (c.includes('tinto'))     return 'tinto'
  if (c.includes('rosado'))    return 'rosado'
  if (c.includes('generoso') || c.includes('jerez') || c.includes('oporto') || c.includes('manzanilla')) return 'generoso'
  if (c.includes('dulce') || c.includes('postre')) return 'dulce'
  if (c.includes('naranja') || c.includes('orange')) return 'naranja'
  if (c.includes('sin alcohol')) return 'sin_alcohol'
  return 'tinto'
}

function paisDesdeCategoria(cats) {
  const c = cats.toLowerCase()
  if (c.includes('champagne') || c.includes('bordeaux') || c.includes('borgoña') || c.includes('bourgogne') || c.includes('alsacia')) return 'Francia'
  if (c.includes('italia') || c.includes('toscana') || c.includes('piamonte') || c.includes('barolo')) return 'Italia'
  if (c.includes('oporto') || c.includes('portugal') || c.includes('alentejo') || c.includes('douro')) return 'Portugal'
  if (c.includes('argentina') || c.includes('mendoza')) return 'Argentina'
  if (c.includes('chile')) return 'Chile'
  if (c.includes('california') || c.includes('oregon') || c.includes('washington')) return 'Estados Unidos'
  return 'España'
}

// ── Parsear campo Descripcion ─────────────────────────────────────────────────
function parseDescripcion(desc) {
  const result = {}
  const bodegaM = desc.match(/Bodega[:\s]+(.+?)(?=\n|Variedad|Nota|Maridaje|Año|$)/i)
  if (bodegaM) result.bodega = bodegaM[1].trim()

  const uvaM = desc.match(/Variedad de uva[:\s]+(.+?)(?=\n|Bodega|Nota|Maridaje|Año|$)/i)
  if (uvaM) result.uva = uvaM[1].trim()

  const notaM = desc.match(/Nota(?:s)? de cata[:\s]+(.+?)(?=\n|Bodega|Variedad|Maridaje|Año|$)/i)
  if (notaM) result.notas_cata = notaM[1].trim()

  const anadaM = desc.match(/(?:Año|Añada|Cosecha)[:\s]+(\d{4})/i)
  if (anadaM) result.anada = anadaM[1]

  return result
}

// ── Parsear nombre estilo Sibaris ─────────────────────────────────────────────
// Formato estándar: "PREFIX WineName I Grape I Bodega BodegaName I DO/Region"
// Formato AOC:      "AOC Champagne I WineName I Grape I Bodega Name I Country"
function parseNombre(texto, categorias) {
  const partes = texto.split(' I ').map(s => s.trim())
  const result = {}

  if (partes.length < 2) {
    result.nombre = texto.trim()
    return result
  }

  const primero = partes[0]

  if (primero.toLowerCase().startsWith('aoc ') || primero.toLowerCase().startsWith('igt ') ||
      primero.toLowerCase().startsWith('doc ') || primero.toLowerCase().startsWith('vdp ')) {
    // Formato AOC: parte[0]=denominacion, parte[1]=nombre, parte[2]=uva, parte[3]=bodega, parte[4]=pais
    result.nombre  = partes[1] || texto
    result.uva     = partes[2] || null
    result.bodega  = partes[3]?.replace(/^Bodega\s+/i, '').trim() || null
    result.region  = primero
    result.pais    = partes[4] || paisDesdeCategoria(categorias)
  } else {
    // Formato estándar: parte[0]="PREFIX nombreVino", parte[1]=uva, parte[2]="Bodega X", parte[3]=DO
    const nombreSinPrefijo = primero.replace(/^[A-Z]{2,4}\s+/, '').trim()
    result.nombre  = nombreSinPrefijo || primero
    result.uva     = partes[1] || null
    result.bodega  = partes[2]?.replace(/^Bodega\s+/i, '').trim() || null
    const region   = partes[3] || null
    result.region  = region
    // Extraer país de "Región (País)" → e.g. "Rheingau (Alemania)" → "Alemania"
    const paisMatch = region?.match(/\(([^)]+)\)\s*$/)
    result.pais    = partes[4] || paisMatch?.[1] || paisDesdeCategoria(categorias)
  }

  return result
}

// ── Precio ────────────────────────────────────────────────────────────────────
function parsePrecio(p) {
  const match = String(p).replace(',', '.').match(/[\d.]+/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) && n > 0 ? n : null
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const csvAbsoluto = path.resolve(csvPath)
  if (!fs.existsSync(csvAbsoluto)) {
    console.error(`Archivo no encontrado: ${csvAbsoluto}`)
    process.exit(1)
  }

  let texto = fs.readFileSync(csvAbsoluto, 'utf-8')
  if (texto.includes('Ã') || texto.includes('Â ')) {
    texto = Buffer.from(texto, 'latin1').toString('utf-8')
    console.log('✓ Codificación corregida (mojibake → UTF-8)')
  }
  const filas = parseCSV(texto)
  console.log(`✓ ${filas.length} filas leídas del CSV`)

  // Obtener o crear tienda
  let { data: tienda } = await supabase.from('tiendas').select('id, nombre').eq('slug', SLUG).single()
  if (!tienda) {
    console.log(`⚠ Tienda "${SLUG}" no encontrada. Creándola...`)
    if (!DRY_RUN) {
      const { data: nueva, error } = await supabase.from('tiendas').insert({
        nombre: 'Sibaris Gourmet',
        slug:   SLUG,
        ciudad: 'Málaga',
        descripcion: 'Tienda gourmet especializada en vinos y productos selectos.',
        color_primario: '#1a1a2e',
        color_acento:   '#c9a96e',
      }).select().single()
      if (error) { console.error('Error al crear tienda:', error.message); process.exit(1) }
      tienda = nueva
    } else {
      tienda = { id: 'DRY_RUN', nombre: 'Sibaris Gourmet (simulado)' }
    }
    console.log(`  → Tienda creada: ${tienda.nombre}`)
  } else {
    console.log(`✓ Tienda encontrada: "${tienda.nombre}" (${tienda.id})`)
  }

  // Convertir filas al esquema de vinos_tienda
  const vinos = []
  const omitidos = []

  for (const fila of filas) {
    const nombreRaw = fila['Nombre'] || fila['nombre'] || ''
    if (!nombreRaw.trim()) continue

    const categorias = fila['Categorias'] || fila['categorias'] || ''
    const descRaw    = fila['Descripcion'] || fila['descripcion'] || ''

    const datosNombre = parseNombre(nombreRaw, categorias)
    const datosDesc   = parseDescripcion(descRaw)

    const nombre = datosNombre.nombre
    if (!nombre) { omitidos.push(nombreRaw); continue }

    const esNaranja = /\borange\b/i.test(nombreRaw) || /(?:naranja|orange wine|skin.contact)/i.test(descRaw)
    const tipo = esNaranja ? 'naranja' : (tipoDesdePrefix(nombreRaw) || tipoDesdeCategoria(categorias))

    const vino = {
      tienda_id: tienda.id,
      nombre,
      bodega:    datosNombre.bodega || datosDesc.bodega || null,
      tipo,
      uva:       datosNombre.uva   || datosDesc.uva    || null,
      anada:     datosNombre.anada || datosDesc.anada  || null,
      region:    datosNombre.region || null,
      pais:      datosNombre.pais  || 'España',
      precio_pvp: parsePrecio(fila['Precio'] || fila['precio']),
      foto_url:   (fila['Imagen_principal'] || fila['imagen_principal'] || '').trim() || null,
      notas_cata: datosDesc.notas_cata || null,
      descripcion: descRaw.trim() || null,
      stock:      0,
      destacado:  false,
      activo:     true,
    }

    vinos.push(vino)
  }

  console.log(`\n→ ${vinos.length} vinos válidos, ${omitidos.length} omitidos`)
  if (omitidos.length > 0) console.log('  Omitidos:', omitidos.slice(0, 5).join('; '))

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Muestra de los primeros 5 vinos:')
    vinos.slice(0, 5).forEach((v, i) => {
      console.log(`  ${i + 1}. "${v.nombre}"`)
      console.log(`      tipo=${v.tipo} | bodega=${v.bodega} | pvp=${v.precio_pvp}€ | pais=${v.pais}`)
      console.log(`      foto=${v.foto_url ? '✓ ' + v.foto_url.substring(0, 60) + '…' : '✗ sin foto'}`)
    })
    const conFoto = vinos.filter(v => v.foto_url).length
    console.log(`\n→ ${conFoto}/${vinos.length} vinos tienen foto`)
    console.log('\nEjecuta sin --dry-run para importar.')
    return
  }

  // Borrar vinos existentes de esta tienda antes de importar
  const { error: delErr } = await supabase.from('vinos_tienda').delete().eq('tienda_id', tienda.id)
  if (delErr) { console.error('Error al limpiar vinos existentes:', delErr.message); process.exit(1) }
  console.log('✓ Vinos anteriores eliminados')

  // Insertar en lotes
  const LOTE = 100
  let insertados = 0
  for (let i = 0; i < vinos.length; i += LOTE) {
    const lote = vinos.slice(i, i + LOTE)
    const { error: insErr } = await supabase.from('vinos_tienda').insert(lote)
    if (insErr) {
      console.error(`  Error en lote ${Math.floor(i / LOTE) + 1}:`, insErr.message)
    } else {
      insertados += lote.length
      process.stdout.write(`  Insertando... ${insertados}/${vinos.length}\r`)
    }
  }

  console.log(`\n✓ ${insertados} vinos importados correctamente en la tienda "${tienda.nombre}"`)
  console.log(`  Kiosko: /kiosko/${SLUG}`)
  console.log(`  Admin:  /kiosko-admin/${SLUG}`)
}

main().catch(err => { console.error(err); process.exit(1) })
