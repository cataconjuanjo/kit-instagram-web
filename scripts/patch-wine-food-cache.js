/**
 * patch-wine-food-cache.js
 *
 * Corrige palabras pegadas y razones incorrectas en el wine_food_cache
 * guardado en BD, sin llamar a Claude.
 *
 * Uso:
 *   node scripts/patch-wine-food-cache.js            → muestra cambios + aplica
 *   node scripts/patch-wine-food-cache.js --dry-run  → solo muestra cambios
 */

'use strict'
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

;(function loadEnv(file = '.env.local') {
  try {
    let content = fs.readFileSync(file, 'utf8')
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
    for (let raw of content.split('\n')) {
      raw = raw.replace(/\r$/, '')
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const stripped = line.startsWith('export ') ? line.slice(7).trim() : line
      const eq = stripped.indexOf('=')
      if (eq < 0) continue
      const k = stripped.slice(0, eq).trim()
      if (!k || !/^[A-Z_][A-Z0-9_]*$/i.test(k)) continue
      let v = stripped.slice(eq + 1)
      const vt = v.trim()
      if ((vt[0] === '"' && vt[vt.length-1] === '"') || (vt[0] === "'" && vt[vt.length-1] === "'")) v = vt.slice(1, -1)
      else v = v.split(' #')[0].split('\t#')[0].trim()
      if (v && !process.env[k]) process.env[k] = v
    }
  } catch {}
})()

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const SLUG    = 'eci-gourmet-k7x2'
const DRY_RUN = process.argv.includes('--dry-run')

// ── Correcciones de espacios programáticas ────────────────────────────────────

function postProcess(text) {
  if (!text) return text
  return text
    // Verbo + con: asientacon, contrastacon, limpiacon, enlazacon
    .replace(/\b([a-záéíóúüñ]{5,}[ao])con\b/gi, '$1 con')
    // Verbo + la: potenciala, realzala, limpiala, cortala
    .replace(/\b([a-záéíóúüñ]{5,}[ao])la\b/gi, '$1 la')
    // se + verbo: sereflejan, seintegra, sefunde, secomplementa
    .replace(/\bse([bcdfghjklmnpqrstvwxyzñ][a-záéíóúüñ]{4,})\b/gi, 'se $1')
    // la + sustantivo: lagrasa, laacidez, launtuosidad
    .replace(/\bla(grasa|acidez|textura|untuosidad|curación|mineralidad|fruta|mineralid)\b/gi, 'la $1')
    // de + sustantivo: decuración, debarrica, deintensidad
    .replace(/\bde(curación|crianza|barrica|textura|intensidad)\b/gi, 'de $1')
    // grasa + adjetivo: grasainfiltrada, grasafina, grasablanca
    .replace(/\bgrasa(infiltrada|fina|blanca|del)\b/gi, 'grasa $1')
    // sustantivo + de: yodode
    .replace(/\byodo(de|y|el|la)\b/gi, 'yodo $1')
    // del + varietal: delsangiovese, delchianti, delmerlot
    .replace(/\bdel(sangiovese|chianti|merlot|cabernet|tempranillo|godello|garnacha|pinot|riesling)\b/gi, 'del $1')
    // Marca: CincoJotas → Cinco Jotas
    .replace(/\bCincoJotas\b/g, 'Cinco Jotas')
    // Normalizar doble espacio si lo generamos
    .replace(/  +/g, ' ')
    .trim()
}

// ── Correcciones manuales puntuales (hallucinations / razones incorrectas) ────
// Formato: { vinoNombreContains, recIndex (0-based), textoNuevo }

const MANUAL_FIXES = [
  {
    // Louro #3: product = Espárragos blancos pero razón mencionaba ventresca de atún rojo
    vinoNombreContains: 'Louro 2025',
    recIndex: 2,
    textoNuevo: 'La acidez vibrante del Godello limpia la cremosidad del espárrago blanco de Navarra, realzando su dulzor sin tapar la frescura cítrica.',
  },
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n▶ patch-wine-food-cache — slug: ${SLUG}`)
  if (DRY_RUN) console.log('  [DRY-RUN: sin escritura en BD]\n')

  const { data: tienda } = await sb.from('tiendas').select('id, wine_food_cache').eq('slug', SLUG).single()
  if (!tienda) { console.error('✗ Tienda no encontrada'); process.exit(1) }

  const cache = tienda.wine_food_cache || {}
  const vinos = Object.entries(cache).filter(([k]) => k !== '_gourmet_to_vino')

  const { data: vinosMeta } = await sb
    .from('vinos_tienda')
    .select('id, nombre')
    .in('id', vinos.map(([id]) => id))

  const nombreById = Object.fromEntries((vinosMeta || []).map(v => [v.id, v.nombre]))

  let totalChanges = 0

  // 1. Correcciones de espacios
  for (const [vinoId, recs] of vinos) {
    if (!Array.isArray(recs)) continue
    const vinNombre = nombreById[vinoId] || vinoId

    for (let i = 0; i < recs.length; i++) {
      const old = recs[i].razon || ''
      const fixed = postProcess(old)
      if (fixed !== old) {
        console.log(`\n  ${vinNombre.slice(0, 50)} #${i+1}`)
        console.log(`  ANTES: ${old}`)
        console.log(`  NUEVO: ${fixed}`)
        recs[i] = { ...recs[i], razon: fixed }
        totalChanges++
      }
    }
  }

  // 2. Correcciones manuales
  for (const fix of MANUAL_FIXES) {
    for (const [vinoId, recs] of vinos) {
      if (!Array.isArray(recs)) continue
      const vinNombre = nombreById[vinoId] || ''
      if (!vinNombre.includes(fix.vinoNombreContains)) continue

      const old = recs[fix.recIndex]?.razon || ''
      if (old === fix.textoNuevo) continue

      console.log(`\n  [MANUAL] ${vinNombre.slice(0, 50)} #${fix.recIndex+1}`)
      console.log(`  ANTES: ${old}`)
      console.log(`  NUEVO: ${fix.textoNuevo}`)
      recs[fix.recIndex] = { ...recs[fix.recIndex], razon: fix.textoNuevo }
      totalChanges++
    }
  }

  // 3. Actualizar cache inverso con razones corregidas
  const reverseCache = {}
  for (const [vinoId, recs] of vinos) {
    if (!Array.isArray(recs)) continue
    const vinNombre = nombreById[vinoId] || ''
    const vinRow = (vinosMeta || []).find(v => v.id === vinoId)
    for (const g of recs) {
      if (!reverseCache[g.id]) reverseCache[g.id] = []
      reverseCache[g.id].push({
        id:     vinoId,
        nombre: vinNombre,
        razon:  g.razon,
      })
    }
  }

  const cacheFinal = {
    ...Object.fromEntries(vinos),
    _gourmet_to_vino: reverseCache,
  }

  console.log(`\n─────────────────────────────`)
  console.log(`  ${totalChanges} razones modificadas`)

  if (!DRY_RUN && totalChanges > 0) {
    const { error } = await sb.from('tiendas').update({ wine_food_cache: cacheFinal }).eq('id', tienda.id)
    if (error) console.error('✗', error.message)
    else console.log('✓ Cache guardado en BD\n')
  } else if (totalChanges === 0) {
    console.log('✓ Sin cambios necesarios\n')
  } else {
    console.log('  [DRY] No escrito\n')
  }
}

main().catch(err => { console.error('\n✗', err.message); process.exit(1) })
