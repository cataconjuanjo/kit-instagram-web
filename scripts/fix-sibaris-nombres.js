/**
 * Reparsea los vinos de sibaris-gourmet que quedaron mal importados.
 * El importador genérico metió la cadena completa en `nombre`.
 * Este script la divide y extrae nombre, bodega, uva, region, pais, notas_cata.
 *
 * Uso:
 *   node scripts/fix-sibaris-nombres.js --dry-run
 *   node scripts/fix-sibaris-nombres.js
 */

const { createClient } = require('@supabase/supabase-js')
try { process.loadEnvFile('.env.local') } catch {}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const SLUG    = 'sibaris-gourmet'
const DRY_RUN = process.argv.includes('--dry-run')

// ── Parsear nombre compuesto estilo Sibaris ───────────────────────────────────
// Formatos detectados:
//   "VBC NombreVino I Uva I Bodega X I DO Región"
//   "AOC Champagne I NombreVino I Uva I Bodega X I País"
//   "NombreVino I Uva I Bodega X I Región"         (sin prefijo)
function parseNombre(raw) {
  const partes = raw.split(' I ').map(s => s.trim()).filter(Boolean)
  if (partes.length === 0) return { nombre: raw }

  const primero = partes[0]

  // Formato AOC / IGT / DOC (denominación al inicio)
  if (/^(AOC|IGT|DOC|AOP|VdP|VDP)\b/i.test(primero)) {
    return {
      nombre:  partes[1] || primero,
      uva:     partes[2] || null,
      bodega:  partes[3]?.replace(/^Bodega\s+/i, '').trim() || null,
      region:  primero,
      pais:    partes[4] || paisDesdePrefijo(primero),
    }
  }

  // Formato estándar con prefijo corto (VBC, VBT, VBR…) o sin prefijo
  const tienePrefijo = /^[A-Z]{2,4}\s/.test(primero)
  const nombreLimpio = tienePrefijo
    ? primero.replace(/^[A-Z]{2,4}\s+/, '').trim()
    : primero

  if (partes.length === 1) return { nombre: nombreLimpio }

  // partes[1] puede ser uva O "Bodega X" — detectamos cuál es
  const esBodega = (s) => /^Bodega\s+/i.test(s)

  if (partes.length === 2) {
    return {
      nombre: nombreLimpio,
      bodega: esBodega(partes[1]) ? partes[1].replace(/^Bodega\s+/i, '').trim() : null,
      uva:    !esBodega(partes[1]) ? partes[1] : null,
    }
  }

  return {
    nombre: nombreLimpio,
    uva:    !esBodega(partes[1]) ? partes[1] : null,
    bodega: esBodega(partes[2]) ? partes[2].replace(/^Bodega\s+/i, '').trim()
          : esBodega(partes[1]) ? partes[1].replace(/^Bodega\s+/i, '').trim()
          : null,
    region: partes[3] || partes[2] || null,
    pais:   partes[4] || null,
  }
}

function paisDesdePrefijo(prefijo) {
  const p = prefijo.toLowerCase()
  if (p.includes('champagne') || p.includes('bordeaux') || p.includes('bourgogne') || p.includes('alsace') || p.includes('loire')) return 'Francia'
  if (p.includes('barolo') || p.includes('chianti') || p.includes('toscana') || p.includes('piemonte') || p.includes('prosecco')) return 'Italia'
  if (p.includes('douro') || p.includes('alentejo') || p.includes('vinho')) return 'Portugal'
  if (p.includes('rioja') && p.includes('aoc')) return 'Francia'
  return null
}

// ── Parsear descripcion estructurada ─────────────────────────────────────────
function parseDescripcion(desc) {
  if (!desc) return {}
  const result = {}

  const bodegaM = desc.match(/Bodega[:\s]+(.+?)(?=\n|Variedad|Nota|Maridaje|Año|$)/i)
  if (bodegaM) result.bodega = bodegaM[1].trim()

  const uvaM = desc.match(/Variedad de uva[:\s]+(.+?)(?=\n|Bodega|Nota|Maridaje|Año|$)/i)
  if (uvaM) result.uva = uvaM[1].trim()

  const notaM = desc.match(/Nota(?:s)? de cata[:\s]+(.+?)(?=\n|Bodega|Variedad|Maridaje|Año|$)/is)
  if (notaM) result.notas_cata = notaM[1].trim().slice(0, 800)

  const anadaM = desc.match(/(?:Año|Añada|Cosecha)[:\s]+(\d{4})/i)
  if (anadaM) result.anada = anadaM[1]

  return result
}

// ── Inferir tipo desde region/uva/notas ──────────────────────────────────────
function inferirTipo(datos) {
  const texto = [datos.region, datos.uva, datos.notas_cata, datos.bodega]
    .filter(Boolean).join(' ').toLowerCase()

  if (/champagne|cava|prosecco|espumoso|cremant|crémant|pétillant|sparkling/.test(texto)) return 'espumoso'
  if (/jerez|sherry|oporto|port|oloroso|amontillado|manzanilla|generoso|fino\b/.test(texto)) return 'generoso'
  if (/moscatel|pedro\s*ximénez|sauternes|dulce|vendimia\s*tard/.test(texto)) return 'dulce'
  if (/naranja|orange\s*wine|skin.contact/.test(texto)) return 'naranja'

  if (/rias\s*baixas|albariño|verdejo|godello|txakoli|rueda|soave|pinot\s*gri[so]|chardonnay|sauvignon\s*blanc|gewürz|riesling|viura|macabeo|parellada|garganega/.test(texto)) return 'blanco'
  if (/rosado|rosé|clarete/.test(texto)) return 'rosado'

  // Regiones típicamente tintas
  if (/ribera\s*del\s*duero|rioja|priorat|toro\b|bierzo|montsant|jumilla|yecla|penedès|somontano|campo\s*de\s*borja|calatayud|valdepeñas|la\s*mancha|barolo|amarone|brunello|chianti|malbec|cabernet|merlot|syrah|garnacha\s*tinta|tempranillo|monastrell|mencía|bobal/.test(texto)) return 'tinto'

  return null
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { data: tienda } = await supabase.from('tiendas').select('id, nombre').eq('slug', SLUG).single()
  if (!tienda) { console.error(`Tienda "${SLUG}" no encontrada.`); process.exit(1) }
  console.log(`Tienda: ${tienda.nombre} (${tienda.id})`)

  const { data: vinos, error } = await supabase
    .from('vinos_tienda')
    .select('id, nombre, descripcion, tipo, bodega, uva, region, pais, anada, notas_cata')
    .eq('tienda_id', tienda.id)
    .order('nombre')

  if (error) { console.error('Error al leer vinos:', error.message); process.exit(1) }
  console.log(`${vinos.length} vinos encontrados\n`)

  let actualizados = 0
  let sinCambios   = 0
  let errores      = 0

  for (const vino of vinos) {
    const desdeNombre = parseNombre(vino.nombre)
    const desdeDesc   = parseDescripcion(vino.descripcion)

    const cambios = {
      nombre:     desdeNombre.nombre || vino.nombre,
      bodega:     vino.bodega || desdeNombre.bodega || desdeDesc.bodega || null,
      uva:        vino.uva   || desdeNombre.uva    || desdeDesc.uva    || null,
      region:     vino.region || desdeNombre.region || null,
      pais:       desdeNombre.pais || vino.pais || 'España',
      anada:      vino.anada  || desdeDesc.anada    || null,
      notas_cata: vino.notas_cata || desdeDesc.notas_cata || null,
    }

    if (!vino.tipo) {
      cambios.tipo = inferirTipo({ ...cambios, notas_cata: cambios.notas_cata })
    }

    const sinModificar =
      cambios.nombre     === vino.nombre &&
      cambios.bodega     === vino.bodega &&
      cambios.uva        === vino.uva    &&
      cambios.region     === vino.region &&
      cambios.pais       === vino.pais   &&
      cambios.anada      === vino.anada  &&
      cambios.notas_cata === vino.notas_cata &&
      (!cambios.tipo || cambios.tipo === vino.tipo)

    if (sinModificar) { sinCambios++; continue }

    if (DRY_RUN) {
      console.log(`[DRY] "${vino.nombre.slice(0, 60)}"`)
      console.log(`  → nombre:  ${cambios.nombre}`)
      console.log(`  → bodega:  ${cambios.bodega}`)
      console.log(`  → uva:     ${cambios.uva}`)
      console.log(`  → region:  ${cambios.region}`)
      console.log(`  → pais:    ${cambios.pais}`)
      cambios.tipo && console.log(`  → tipo:    ${cambios.tipo}`)
      cambios.anada && console.log(`  → anada:   ${cambios.anada}`)
      console.log()
      actualizados++
      continue
    }

    const { error: updErr } = await supabase
      .from('vinos_tienda')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', vino.id)

    if (updErr) {
      console.error(`  Error en "${vino.nombre.slice(0, 40)}": ${updErr.message}`)
      errores++
    } else {
      process.stdout.write(`  Actualizado: ${cambios.nombre.slice(0, 50)}\n`)
      actualizados++
    }
  }

  console.log(`\n── Resumen ──────────────────────`)
  console.log(`  Actualizados: ${actualizados}`)
  console.log(`  Sin cambios:  ${sinCambios}`)
  if (errores) console.log(`  Errores:      ${errores}`)
  if (DRY_RUN) console.log('\n  [DRY RUN] Ejecuta sin --dry-run para aplicar.')
  else         console.log(`\n  ✓ Hecho. Revisa /kiosko-admin/${SLUG}`)
  console.log(`  ⚠ Los precios no se pudieron recuperar (no estaban en el CSV original). Ponlos manualmente desde el admin.`)
}

main().catch(err => { console.error(err); process.exit(1) })
