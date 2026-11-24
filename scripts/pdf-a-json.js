#!/usr/bin/env node
/**
 * pdf-a-json.js
 *
 * Trocea un PDF de tarifa grande (500 a 3.500 referencias) y extrae a JSON
 * con Claude, bloque a bloque. Dedupe por codigo_articulo y por claveDura
 * (nombre|bodega|formato_ml|anada). Detecta packs/cajas: si la fila lleva
 * "Caja N Botellas / Pack N / Estuche N" y el precio corresponde a la caja,
 * reparte coste_caja / unidades_por_caja -> coste_botella.
 *
 * Diseño:
 *   - Lectura PDF con pdf-parse (dependencia ya presente en package.json).
 *   - Si una página supera un tamaño estimado, se trocea por páginas.
 *   - Un bloque por N páginas (default 4). Solapamiento 1 página entre bloques
 *     para evitar perder vinos partidos a mitad.
 *   - Llamada por bloque a Claude Sonnet 4.6 (el mismo id que usa route.js).
 *   - Si algún bloque devuelve stop_reason='max_tokens', aborta con exit 2.
 *   - Final: concatena, deduplica, escribe JSON a stdout o a --salida.
 *
 * Uso:
 *   node scripts/pdf-a-json.js --pdf ruta.pdf [--salida out.json] [--paginas-por-bloque 4]
 *
 * NO escribe en base de datos. El JSON resultante se alimenta al CLI
 * scripts/importar-tarifa.js --fichero out.json (que a su vez tiene --dry-run
 * por defecto).
 */

'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const pdfParse = require('pdf-parse/lib/pdf-parse.js')

try { process.loadEnvFile(path.join(__dirname, '..', '.env.local')) } catch {}

const MODELO = process.env.PDF_EXTRACTION_MODEL || 'claude-sonnet-4-6'
console.error(`[pdf-a-json] modelo: ${MODELO}`)
const MAX_TOKENS_POR_BLOQUE = 16000
const LIMITE_REFS_POR_BLOQUE = 400

const PROMPT_EXTRACCION = `Extrae un catalogo de vinos de distribuidor desde el fragmento siguiente de una tarifa en PDF.

Devuelve EXCLUSIVAMENTE un array JSON valido, sin markdown, sin explicaciones.
Si el fragmento tiene mas de ~400 referencias, extrae las que puedas y nada mas.

Cada objeto debe tener esta forma exacta:
{
  "codigo_articulo": "codigo interno del proveedor si aparece o vacio",
  "nombre_crudo": "nombre comercial del vino tal cual aparece",
  "bodega_cruda": "bodega/productor si aparece o vacio",
  "tipo": "tinto|blanco|rosado|espumoso|generoso|dulce|otros o vacio",
  "zona_cruda": "D.O., zona o pais si aparece o vacio",
  "uva": "uva o blend si aparece o vacio",
  "anada": "año 4 digitos si aparece o null",
  "formato_crudo": "ej. '75 cl', '50 cl', '1500 ml', 'magnum'",
  "unidades_por_caja": "numero entero si la referencia es un pack/caja/estuche, o 1",
  "coste_caja": "numero en euros SIN simbolo si el precio corresponde a la CAJA, o null",
  "coste_botella": "numero en euros SIN simbolo si el precio corresponde a UNA BOTELLA, o null",
  "disponibilidad": "disponible|limitado|consultar|agotado o vacio",
  "iva_dudoso": "true si no queda claro si el precio incluye IVA, false en otro caso"
}

Reglas de packs/cajas:
- Si la descripcion incluye 'Caja N Botellas', 'Pack N', 'Estuche N' o similares,
  rellena unidades_por_caja. Si no, pon 1.
- Si el precio corresponde a la caja (p.ej. "200 Monges Impar Caja Madera 4 Botellas 50cl" con un precio alto para ese formato), rellena coste_caja.
- Si el precio corresponde a la botella individual, rellena coste_botella.
- NUNCA rellenes los dos a la vez.

Reglas de IVA (distribuidores espanoles tarifan habitualmente SIN IVA; la factura anade 21%):
- Si el PDF indica "IVA incluido" o "precios con IVA", divide los precios por 1.21
  antes de devolverlos y marca iva_dudoso=false.
- Si el PDF indica "SIN IVA" o "IVA no incluido", deja el numero tal cual, iva_dudoso=false.
- Si no esta claro, deja el numero tal cual y marca iva_dudoso=true.

Formatos: incluye explicitamente 1500 (magnum), 750 (botella estandar), 500, 375, 50 cl.

No incluyas cervezas, refrescos, destilados, aceites, conservas, comida, ni lineas de totales/portes/condiciones.
No inventes precios, anadas, regiones ni bodegas.
`

function argv(flag, fallback = null) {
  const i = process.argv.indexOf(flag)
  return i > 0 ? process.argv[i + 1] : fallback
}
function flag(name) { return process.argv.includes(name) }

function normalizar(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

function formatoAMl(str) {
  if (!str) return null
  const s = String(str).toLowerCase().replace(/\s/g, '').replace(',', '.')
  if (/magnum/.test(s)) return 1500
  if (/jeroboam|doblemagnum/.test(s)) return 3000
  let m
  if ((m = s.match(/(\d+(?:\.\d+)?)ml/))) return Math.round(parseFloat(m[1]))
  if ((m = s.match(/(\d+(?:\.\d+)?)cl/))) return Math.round(parseFloat(m[1]) * 10)
  if ((m = s.match(/(\d+(?:\.\d+)?)l(?!\w)/))) return Math.round(parseFloat(m[1]) * 1000)
  return null
}

function claveDura(nombre, bodega, formatoMl, anada) {
  return `${normalizar(nombre)}|${normalizar(bodega)}|${formatoMl ?? '?'}|${anada ?? 'sv'}`
}

function extraerJson(texto) {
  const limpio = (texto || '').trim()
  try { return JSON.parse(limpio) } catch {}
  const match = limpio.match(/\[[\s\S]*\]/)
  if (!match) return []
  try { return JSON.parse(match[0]) } catch { return [] }
}

async function troccearPorPaginas(pdfBuffer, paginasPorBloque) {
  // pdf-parse devuelve todo el texto plano, con \f entre páginas en la mayoría de PDFs.
  const res = await pdfParse(pdfBuffer)
  const paginas = String(res.text || '').split(/\f|\n{3,}/).filter(p => p.trim().length > 20)
  const bloques = []
  const paso = Math.max(1, paginasPorBloque)
  for (let i = 0; i < paginas.length; i += paso) {
    const inicio = i === 0 ? 0 : Math.max(0, i - 1) // solapamiento de 1 página
    const trozo = paginas.slice(inicio, i + paso).join('\n\n')
    bloques.push(trozo)
  }
  return { bloques, totalPaginas: paginas.length }
}

async function extraerBloque(cliente, texto, numeroBloque) {
  const message = await cliente.messages.create({
    model: MODELO,
    max_tokens: MAX_TOKENS_POR_BLOQUE,
    system: 'Eres un extractor de catalogos profesionales de distribuidores de vino. Devuelves solo JSON valido. No inventas referencias ni precios.',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `Bloque ${numeroBloque} de la tarifa:\n\n${texto.slice(0, 90000)}` },
        { type: 'text', text: PROMPT_EXTRACCION },
      ],
    }],
  })
  return message
}

async function main() {
  const pdfPath = argv('--pdf')
  const salidaPath = argv('--salida')
  const paginasPorBloque = parseInt(argv('--paginas-por-bloque', '4'), 10) || 4

  if (!pdfPath) {
    console.error('Uso: node scripts/pdf-a-json.js --pdf <ruta.pdf> [--salida out.json] [--paginas-por-bloque 4]')
    process.exit(1)
  }
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF no encontrado: ${pdfPath}`)
    process.exit(1)
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Falta ANTHROPIC_API_KEY en el entorno')
    process.exit(1)
  }
  let Anthropic
  try {
    Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk')
  } catch (e) {
    console.error('No se encontró @anthropic-ai/sdk. Asegúrate de que está instalado.')
    process.exit(1)
  }
  const cliente = new Anthropic({ apiKey })

  const pdfBuffer = fs.readFileSync(pdfPath)
  const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex')

  console.error(`PDF: ${path.basename(pdfPath)}  (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`)
  console.error(`sha256: ${pdfHash}`)

  const { bloques, totalPaginas } = await troccearPorPaginas(pdfBuffer, paginasPorBloque)
  console.error(`Páginas detectadas: ${totalPaginas}  ·  Bloques: ${bloques.length}  ·  Páginas/bloque: ${paginasPorBloque}`)

  const vinosBrutos = []
  let packsDetectados = 0
  let ivaDudoso = 0
  for (let i = 0; i < bloques.length; i++) {
    console.error(`  → Bloque ${i + 1}/${bloques.length}…`)
    let message
    try {
      message = await extraerBloque(cliente, bloques[i], i + 1)
    } catch (e) {
      console.error(`  ✗ Error en bloque ${i + 1}: ${e.message}`)
      process.exit(2)
    }
    if (message.stop_reason === 'max_tokens') {
      console.error(`  ✗ Bloque ${i + 1} truncado (stop_reason=max_tokens). Reduce --paginas-por-bloque y reintenta.`)
      process.exit(2)
    }
    const trozo = extraerJson(message.content?.[0]?.text)
    if (!Array.isArray(trozo)) continue
    if (trozo.length >= LIMITE_REFS_POR_BLOQUE) {
      console.error(`  ✗ Bloque ${i + 1} llegó al límite duro de ${LIMITE_REFS_POR_BLOQUE} refs. Reduce --paginas-por-bloque y reintenta.`)
      process.exit(2)
    }
    vinosBrutos.push(...trozo)
  }

  console.error(`Refs brutas extraídas: ${vinosBrutos.length}`)

  // Post-proceso: packs → coste_botella
  const vinosPost = vinosBrutos.map(v => {
    const unidades = Number(v.unidades_por_caja) > 0 ? Number(v.unidades_por_caja) : 1
    let coste = Number(v.coste_botella) > 0 ? Number(v.coste_botella) : null
    if (!coste && Number(v.coste_caja) > 0 && unidades > 1) {
      coste = Number(v.coste_caja) / unidades
      packsDetectados++
    }
    if (v.iva_dudoso === true || v.iva_dudoso === 'true') ivaDudoso++
    const formatoMl = formatoAMl(v.formato_crudo)
    return {
      codigo_articulo: v.codigo_articulo || null,
      nombre_crudo: v.nombre_crudo || '',
      bodega_cruda: v.bodega_cruda || '',
      tipo: v.tipo || null,
      zona_cruda: v.zona_cruda || null,
      uva: v.uva || null,
      anada: v.anada ?? null,
      formato_crudo: v.formato_crudo || '',
      formato_ml: formatoMl,
      unidades_por_caja: unidades,
      coste: coste !== null ? Number(coste.toFixed(4)) : null,
      disponibilidad: v.disponibilidad || null,
      iva_dudoso: v.iva_dudoso === true || v.iva_dudoso === 'true',
    }
  })

  // Dedup: por codigo_articulo (hard) y por claveDura (fallback)
  const vistos = new Set()
  const vinos = []
  for (const v of vinosPost) {
    const k1 = v.codigo_articulo ? `c:${v.codigo_articulo}` : null
    const k2 = `k:${claveDura(v.nombre_crudo, v.bodega_cruda, v.formato_ml, v.anada)}`
    if (k1 && vistos.has(k1)) continue
    if (vistos.has(k2)) continue
    if (k1) vistos.add(k1)
    vistos.add(k2)
    vinos.push(v)
  }

  const sinPrecio = vinos.filter(v => !v.coste || v.coste <= 0).length

  console.error('\nResumen de extracción:')
  console.error(`  · Refs detectadas en PDF: ${vinosBrutos.length}`)
  console.error(`  · Refs únicas tras dedup: ${vinos.length}`)
  console.error(`  · Sin precio: ${sinPrecio}`)
  console.error(`  · Packs detectados (unidades_por_caja > 1): ${packsDetectados}`)
  console.error(`  · IVA dudoso: ${ivaDudoso}`)

  const payload = { pdf_sha256: pdfHash, pdf_origen: path.basename(pdfPath), vinos }
  const json = JSON.stringify(payload, null, 2)
  if (salidaPath) {
    fs.writeFileSync(salidaPath, json, 'utf8')
    console.error(`\n✓ JSON escrito en ${salidaPath}`)
  } else {
    process.stdout.write(json + '\n')
  }
}

main().catch(err => { console.error(`\nError: ${err.message}`); process.exit(1) })
