'use strict'
/**
 * Actualiza uva, region y anada de los 59 vinos de Araboka
 * extrayéndolos de notas_cata con las 3 normalizaciones acordadas.
 *
 * Uso:
 *   node _tmp_araboka_actualiza.js            → dry-run (solo lectura)
 *   node _tmp_araboka_actualiza.js --apply    → aplica los cambios en BD
 *
 * Campos tocados: uva, region, anada
 * Campos NO tocados: bodega (carga manual / catálogo canónico)
 * Filtro de seguridad: WHERE id = ? AND restaurante_id = RID en cada UPDATE
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

const RID   = '7af94e33-48cd-43b8-b939-4796ba58e4d8'
const APPLY = process.argv.includes('--apply')

// ── Normalización 1: initcap varietal ────────────────────────────────
function initcapUva(s) {
  if (!s) return s
  return s.replace(/(^|\s)([a-záéíóúüñàèìòùâêîôûäëïöü])/gu,
    (_, sp, c) => sp + c.toUpperCase())
}

// ── Normalización 2: puntuar D.O./D.O.C./D.O.P. ──────────────────────
function fixDO(s) {
  if (!s) return s
  s = s.replace(/\bD\.O\.C(?!\.)/g, 'D.O.C.')
  s = s.replace(/\bD\.O\.P(?!\.)/g, 'D.O.P.')
  s = s.replace(/\bD\.O(?!\.)/g,    'D.O.')
  return s
}

function trimDots(s) {
  return s ? s.replace(/^[. ]+|[. ]+$/g, '').trim() : ''
}

const R_FORMAL  = /D\.O[A-Z.]*\s|V\.T\.\s|IGT\s|Champagne|Corpinnat|Vallée\s|Côte\s/i
const R_NOM     = /Rioja|Ribera del Duero|Rías Baixas|Bierzo|Rueda\b|Toro\b|Navarra\b|Málaga|Ronda\b|Cádiz|Jerez|Mendoza|Toscana|Marne|Almansa|Yecla|Jumilla|Calatayud|Cariñena|Otazu|Bizkaiko|Valle del Uco/i
const R_CRIANZA = /^\d+\s+[Mm]eses|^[Mm]eses|[Cc]rianza\b|[Bb]arrica\b/
// Normalización 3: sub-zonas de Champagne → "Champagne"
const R_CHAMP_SUBZONE = /Vallée.*Marne|Côte\s+des?\s+blancs|Villevenard|Marne\b/i

function extractFields(tipo, notas_cata) {
  if (!notas_cata) return { uva: null, region: null, anada: null }

  const hasSlash = notas_cata.includes(' / ')
  const parts    = notas_cata.split(' / ').map(trimDots)
  const [p1, p2, p3, p4] = [parts[0]||'', parts[1]||'', parts[2]||'', parts[3]||'']

  const p1EsDenom  = /^(Champagne|Corpinnat|Cava\b|Prosecco|Crémant|Cremant|Franciacorta)/i.test(p1)
  const p1EsEstilo = /^(Espumoso|Vino espumoso)/i.test(p1)
  const p1TieneDoEmb = p1.includes('.') && /\.\s*(D\.O|V\.T\.)/i.test(p1)

  // ── UVA ──────────────────────────────────────────────────────────
  let uva
  if (!hasSlash && /\.\s*(D\.O|V\.T\.)/i.test(notas_cata)) {
    uva = notas_cata.split('. ')[0].trim()
  } else if (!hasSlash) {
    uva = trimDots(notas_cata) || null
  } else if (tipo === 'espumoso' && p1EsDenom) {
    uva = p2 || null
  } else if (tipo === 'espumoso' && p1EsEstilo) {
    uva = p2 || null
  } else if (p1TieneDoEmb) {
    uva = p1.split('. ')[0].trim() || null
  } else {
    uva = p1 || null
  }

  // ── REGIÓN ───────────────────────────────────────────────────────
  let region
  if (!hasSlash && /\.\s*(D\.O|V\.T\.)/i.test(notas_cata)) {
    const mDO = notas_cata.match(/(D\.O[A-Z.]*\s+[^.]+)/)
    const mVT = notas_cata.match(/(V\.T\.\s+[^.]+)/)
    region = ((mDO || mVT || [,''])[1] || '')
               .replace(/\s*https?:\/\/\S+.*/g, '').trim() || null
  } else if (!hasSlash) {
    region = null
  } else if (tipo === 'espumoso' && p1EsDenom) {
    region = p1.split(/\s+/)[0] || null
  } else if (tipo === 'espumoso' && p1EsEstilo) {
    if (/D\.O|Málaga\b|Champagne/i.test(p4)) region = p4 || null
    else if (R_FORMAL.test(p3) || R_NOM.test(p3)) region = p3 || null
    else region = null
  } else if (p1TieneDoEmb) {
    const m = p1.match(/(D\.O[A-Z.]*\s+[^.]+)/) || p1.match(/(V\.T\.\s+[^.]+)/)
    region = m ? m[1].trim() : null
  } else if (R_CRIANZA.test(p2) && (R_FORMAL.test(p3) || R_NOM.test(p3))) {
    region = p3 || null
  } else if (R_FORMAL.test(p2)) {
    region = p2 || null
  } else if (R_NOM.test(p2)) {
    region = p2 || null
  } else {
    region = null
  }

  if (tipo === 'espumoso' && region && R_CHAMP_SUBZONE.test(region)) {
    region = 'Champagne'
  }

  // ── AÑADA ─────────────────────────────────────────────────────────
  const mAnada = notas_cata.match(/\b((?:19|20)\d{2})\b/)
  const anada  = mAnada ? parseInt(mAnada[1], 10) : null

  if (uva)    uva    = fixDO(initcapUva(uva))
  if (region) region = fixDO(region)

  return { uva: uva || null, region: region || null, anada }
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const { data: vinos, error } = await supabase
    .from('vinos')
    .select('id, nombre, tipo, notas_cata, uva, region, anada')
    .eq('restaurante_id', RID)
    .order('tipo').order('nombre')

  if (error) { console.error('Error:', error.message); process.exit(1) }

  const N = 36, T = 12, U = 46, R = 34, A = 6
  const pad = (s, w) => String(s ?? 'NULL').slice(0, w - 1).padEnd(w)
  const sep = '─'.repeat(N + T + U + R + A + 4 * 3)

  const label = APPLY ? `=== UPDATE Araboka — ${vinos.length} vinos ===`
                      : `=== DRY-RUN — valores que se escribirían (sin tocar BD) ===`
  process.stdout.write(`\n${label}\n\n`)
  process.stdout.write(
    pad('nombre', N) + ' | ' + pad('tipo', T) + ' | ' +
    pad('uva', U) + ' | ' + pad('region', R) + ' | anada\n'
  )
  process.stdout.write(sep + '\n')

  const payload = []
  for (const v of vinos) {
    const { uva, region, anada } = extractFields(v.tipo, v.notas_cata)
    payload.push({ v, uva, region, anada })
    process.stdout.write(
      pad(v.nombre, N) + ' | ' + pad(v.tipo, T) + ' | ' +
      pad(uva, U)      + ' | ' + pad(region, R) + ' | ' +
      (anada ?? 'NULL') + '\n'
    )
  }
  process.stdout.write(sep + '\n')

  const nullUvaSim    = payload.filter(x => !x.uva).length
  const nullRegionSim = payload.filter(x => !x.region).length
  const nullAnadaSim  = payload.filter(x => !x.anada).length
  process.stdout.write(
    `\nSimulado: ${vinos.length} vinos | uva=NULL: ${nullUvaSim} | region=NULL: ${nullRegionSim} | anada=NULL: ${nullAnadaSim}\n`
  )

  if (!APPLY) {
    process.stdout.write('\nModo DRY-RUN — sin cambios. Usa --apply para ejecutar.\n\n')
    return
  }

  // ── Ejecutar UPDATEs ─────────────────────────────────────────────
  process.stdout.write('\nEjecutando UPDATEs (uno por vino, WHERE id + restaurante_id)...\n')
  let updated = 0, failed = 0, sinMatch = 0

  for (const { v, uva, region, anada } of payload) {
    const { data: rows, error: e } = await supabase
      .from('vinos')
      .update({ uva: uva || null, region: region || null, anada: anada || null })
      .eq('id', v.id)
      .eq('restaurante_id', RID)
      .select('id')

    if (e) {
      process.stdout.write(`  ✗ ERROR "${v.nombre}": ${e.message}\n`)
      failed++
    } else if (!rows || rows.length === 0) {
      process.stdout.write(`  ? SIN MATCH "${v.nombre}" (id=${v.id}) — WHERE no coincidió\n`)
      sinMatch++
    } else {
      updated++
    }
  }

  process.stdout.write(`\nResumen UPDATE: ${updated} OK | ${failed} errores | ${sinMatch} sin match\n`)
  if (failed > 0 || sinMatch > 0) {
    process.stdout.write('⚠ Hay filas con error o sin match — revisa antes de continuar.\n')
  }

  // ── SELECT verificación post-UPDATE ─────────────────────────────
  process.stdout.write('\n── Verificación post-UPDATE (estado real en BD) ──\n\n')
  const { data: post, error: postErr } = await supabase
    .from('vinos')
    .select('nombre, tipo, uva, region, anada')
    .eq('restaurante_id', RID)
    .order('tipo').order('nombre')

  if (postErr) {
    console.error('Error en SELECT verificación:', postErr.message)
    process.exit(1)
  }

  process.stdout.write(
    pad('nombre', N) + ' | ' + pad('tipo', T) + ' | ' +
    pad('uva (BD)', U) + ' | ' + pad('region (BD)', R) + ' | anada\n'
  )
  process.stdout.write(sep + '\n')

  let nullUva = 0, nullRegion = 0, nullAnada = 0
  for (const v of post) {
    if (!v.uva)    nullUva++
    if (!v.region) nullRegion++
    if (!v.anada)  nullAnada++
    process.stdout.write(
      pad(v.nombre, N) + ' | ' + pad(v.tipo, T) + ' | ' +
      pad(v.uva, U)    + ' | ' + pad(v.region, R) + ' | ' +
      (v.anada ?? 'NULL') + '\n'
    )
  }
  process.stdout.write(sep + '\n')
  process.stdout.write(
    `\nPost-UPDATE NULLs: uva=${nullUva} | region=${nullRegion} | anada=${nullAnada}\n\n`
  )
}

main().catch(err => { console.error(err); process.exit(1) })
