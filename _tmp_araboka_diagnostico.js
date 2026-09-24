'use strict'
/**
 * Diagnóstico solo-lectura: extrae uva / region / añada de notas_cata
 * para los 59 vinos de Araboka y aplica las 3 normalizaciones acordadas.
 * NO modifica ningún dato.
 * Uso: node _tmp_araboka_diagnostico.js
 */

const fs   = require('fs')
const path = require('path')

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnv(path.join(__dirname, '.env.local'))

const { createClient } = require('@supabase/supabase-js')
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const RID = '7af94e33-48cd-43b8-b939-4796ba58e4d8'

// ── Normalización 1: initcap varietal ─────────────────────────────
// Capitaliza la primera letra de cada palabra (tras espacio o inicio de cadena).
// Replica el comportamiento de PostgreSQL initcap para nombres varietales.
function initcapUva(s) {
  if (!s) return s
  return s.replace(/(^|\s)([a-záéíóúüñàèìòùâêîôûäëïöü])/gu,
    (_, sp, c) => sp + c.toUpperCase())
}

// ── Normalización 2: puntuar D.O. / D.O.C. / D.O.P. ─────────────
// Añade el punto final faltante en D.O, D.O.C, D.O.P.
// Aplica a region Y a uva (por si alguna uva contiene una D.O. embebida).
function fixDO(s) {
  if (!s) return s
  s = s.replace(/\bD\.O\.C(?!\.)/g, 'D.O.C.') // D.O.C sin punto → D.O.C.
  s = s.replace(/\bD\.O\.P(?!\.)/g, 'D.O.P.') // D.O.P sin punto → D.O.P.
  s = s.replace(/\bD\.O(?!\.)/g,    'D.O.')    // D.O sin punto  → D.O.
  return s
}

// ── Helpers ───────────────────────────────────────────────────────
function trimDots(s) {
  // Elimina puntos y espacios al principio y al final
  return s ? s.replace(/^[. ]+|[. ]+$/g, '').trim() : ''
}

// Sub-regexes de detección (misma lógica que el SQL CTE validado)
const R_FORMAL  = /D\.O[A-Z.]*\s|V\.T\.\s|IGT\s|Champagne|Corpinnat|Vallée\s|Côte\s/i
const R_NOM     = /Rioja|Ribera del Duero|Rías Baixas|Bierzo|Rueda\b|Toro\b|Navarra\b|Málaga|Ronda\b|Cádiz|Jerez|Mendoza|Toscana|Marne|Almansa|Yecla|Jumilla|Calatayud|Cariñena|Otazu|Bizkaiko|Valle del Uco/i
const R_CRIANZA = /^\d+\s+[Mm]eses|^[Mm]eses|[Cc]rianza\b|[Bb]arrica\b/
// Sub-zonas de Champagne que deben normalizarse a "Champagne"
const R_CHAMP_SUBZONE = /Vallée.*Marne|Côte\s+des?\s+blancs|Villevenard|Marne\b/i

// ── Extracción principal ──────────────────────────────────────────
function extractFields(tipo, notas_cata) {
  if (!notas_cata) return { uva: null, region: null, anada: null }

  const hasSlash = notas_cata.includes(' / ')
  const parts    = notas_cata.split(' / ').map(trimDots)
  const [p1, p2, p3, p4] = [parts[0]||'', parts[1]||'', parts[2]||'', parts[3]||'']

  // Flags para espumosos
  const p1EsDenom  = /^(Champagne|Corpinnat|Cava\b|Prosecco|Crémant|Cremant|Franciacorta)/i.test(p1)
  const p1EsEstilo = /^(Espumoso|Vino espumoso)/i.test(p1)
  // Flag: p1 contiene D.O./V.T. embebido tras un punto (patrón Olagosa)
  const p1TieneDoEmb = p1.includes('.') && /\.\s*(D\.O|V\.T\.)/i.test(p1)

  // ── UVA ─────────────────────────────────────────────────────────
  let uva
  if (!hasSlash && /\.\s*(D\.O|V\.T\.)/i.test(notas_cata)) {
    // Patrón A: "Uva. D.O. Región." sin slash (La Raspa, G22, Prieto Pariente)
    uva = notas_cata.split('. ')[0].trim()
  } else if (!hasSlash) {
    // Sin slash, sin D.O.: toda la cadena es la uva
    uva = trimDots(notas_cata) || null
  } else if (tipo === 'espumoso' && p1EsDenom) {
    // Espumoso: p1 es denominación geográfica → uva está en p2
    uva = p2 || null
  } else if (tipo === 'espumoso' && p1EsEstilo) {
    // Espumoso: p1 es descriptor de estilo → uva está en p2
    uva = p2 || null
  } else if (p1TieneDoEmb) {
    // Patrón B: "Uva. D.O. Región / Crianza" → uva = antes del primer ". "
    uva = p1.split('. ')[0].trim() || null
  } else {
    // General: p1 es la uva
    uva = p1 || null
  }

  // ── REGIÓN ──────────────────────────────────────────────────────
  let region
  if (!hasSlash && /\.\s*(D\.O|V\.T\.)/i.test(notas_cata)) {
    // Patrón A: extraer denominación con regex, eliminar URL si la hay
    const mDO = notas_cata.match(/(D\.O[A-Z.]*\s+[^.]+)/)
    const mVT = notas_cata.match(/(V\.T\.\s+[^.]+)/)
    region = ((mDO || mVT || [,''])[1] || '')
               .replace(/\s*https?:\/\/\S+.*/g, '').trim() || null
  } else if (!hasSlash) {
    region = null
  } else if (tipo === 'espumoso' && p1EsDenom) {
    // Primera palabra de p1 es la denominación geográfica
    region = p1.split(/\s+/)[0] || null
  } else if (tipo === 'espumoso' && p1EsEstilo) {
    // Buscar región en p4 primero (Tartratos: …/ Málaga.)
    if (/D\.O|Málaga\b|Champagne/i.test(p4)) region = p4 || null
    else if (R_FORMAL.test(p3) || R_NOM.test(p3)) region = p3 || null
    else region = null
  } else if (p1TieneDoEmb) {
    // Patrón B: extraer D.O. de p1
    const m = p1.match(/(D\.O[A-Z.]*\s+[^.]+)/) || p1.match(/(V\.T\.\s+[^.]+)/)
    region = m ? m[1].trim() : null
  } else if (R_CRIANZA.test(p2) && (R_FORMAL.test(p3) || R_NOM.test(p3))) {
    // Patrón C: p2 = crianza → región en p3 (Apego, Alión, Atalaya, Pago de Otazu)
    region = p3 || null
  } else if (R_FORMAL.test(p2)) {
    region = p2 || null
  } else if (R_NOM.test(p2)) {
    region = p2 || null
  } else {
    region = null
  }

  // Normalización 3: sub-zonas de Champagne → "Champagne"
  // (Barnier Rose: "Villevenard (Côte des blancs)", Constantine: "Vallée del Marne")
  // NO toca Perrier x2 ni Grimau (tienen region=null)
  if (tipo === 'espumoso' && region && R_CHAMP_SUBZONE.test(region)) {
    region = 'Champagne'
  }

  // ── AÑADA ────────────────────────────────────────────────────────
  const mAnada = notas_cata.match(/\b((?:19|20)\d{2})\b/)
  const anada  = mAnada ? mAnada[1] : null

  // Aplicar normas 1 y 2 al resultado
  if (uva)    uva    = fixDO(initcapUva(uva))
  if (region) region = fixDO(region)

  return { uva: uva || null, region: region || null, anada }
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const { data: vinos, error } = await supabase
    .from('vinos')
    .select('id, nombre, tipo, notas_cata, uva, region')
    .eq('restaurante_id', RID)
    .order('tipo').order('nombre')

  if (error) { console.error('Error:', error.message); process.exit(1) }

  const N = 36, T = 12, U = 46, R = 34, A = 6
  const pad  = (s, w) => String(s ?? 'NULL').slice(0, w - 1).padEnd(w)
  const sep  = '─'.repeat(N + T + U + R + A + 4 * 3)

  process.stdout.write(
    `\n=== DIAGNÓSTICO Araboka — ${vinos.length} vinos (BD real) ===\n\n`
  )
  process.stdout.write(
    pad('nombre', N) + ' | ' + pad('tipo', T) + ' | ' +
    pad('uva_propuesta', U) + ' | ' + pad('region_propuesta', R) + ' | añada\n'
  )
  process.stdout.write(sep + '\n')

  let nullUva = 0, nullRegion = 0, nullAnada = 0
  const rows = []
  for (const v of vinos) {
    const { uva, region, anada } = extractFields(v.tipo, v.notas_cata)
    if (!uva)    nullUva++
    if (!region) nullRegion++
    if (!anada)  nullAnada++
    rows.push({ v, uva, region, anada })
    process.stdout.write(
      pad(v.nombre, N) + ' | ' + pad(v.tipo, T) + ' | ' +
      pad(uva, U)      + ' | ' + pad(region, R) + ' | ' +
      (anada ?? 'NULL') + '\n'
    )
  }

  process.stdout.write(sep + '\n')
  process.stdout.write(
    `\nResumen: ${vinos.length} vinos | uva=NULL: ${nullUva} | region=NULL: ${nullRegion} | añada=NULL: ${nullAnada}\n`
  )

  // ── Detectar diferencias entre notas_cata y CSV simulado ─────────
  process.stdout.write('\n── Vinos con notas_cata vacío o NULL en BD:\n')
  const sinNotas = vinos.filter(v => !v.notas_cata)
  if (sinNotas.length === 0) {
    process.stdout.write('  (ninguno)\n')
  } else {
    for (const v of sinNotas) {
      process.stdout.write(`  [${v.tipo}] ${v.nombre}\n`)
    }
  }

  // ── Vinos donde uva o region ya tienen valor en BD ───────────────
  process.stdout.write('\n── Vinos con uva o region YA rellenos en BD (serían sobreescritos):\n')
  const yaRellenos = vinos.filter(v => v.uva || v.region)
  if (yaRellenos.length === 0) {
    process.stdout.write('  (ninguno — todos tienen uva=NULL y region=NULL)\n')
  } else {
    for (const v of yaRellenos) {
      process.stdout.write(`  [${v.tipo}] ${v.nombre} → uva="${v.uva}" region="${v.region}"\n`)
    }
  }

  process.stdout.write('\nNOTA: Solo lectura. No se ha modificado ningún dato.\n\n')
}

main().catch(err => { console.error(err); process.exit(1) })
