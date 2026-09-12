'use strict'
// Inserta dedup_candidato faltantes para pares (vino-con-formato, vino-sin-formato)
// con similitud >= 0.65 calculada sobre el nombre SIN la palabra de formato.
// Comprueba existencia por vino_id (no por vino_anada concreta).
// --dry-run por defecto. Pasar --apply para insertar.

const fs     = require('fs')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

// ── Entorno ──────────────────────────────────────────────────────────────────

function loadEnv () {
  const env = {}
  for (const f of ['.env.local', '.env.vercel']) {
    if (!fs.existsSync(f)) continue
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
  return { ...env, ...process.env }
}

async function fetchAll (sb, table, select, extra) {
  const all = []
  for (let o = 0; ; o += 1000) {
    let q = sb.from(table).select(select).range(o, o + 999)
    if (extra) q = extra(q)
    const { data, error } = await q
    if (error) throw new Error(table + ': ' + error.message)
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function normTexto (v) {
  if (!v) return ''
  return v
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function deterministicUUID (...parts) {
  const h = crypto.createHash('sha256').update(parts.join('\x00')).digest('hex')
  return [h.slice(0,8), h.slice(8,12), h.slice(12,16), h.slice(16,20), h.slice(20,32)].join('-')
}

function trigrams (s) {
  const p = '  ' + s + '  '
  const set = new Set()
  for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3))
  return set
}

function similarity (a, b) {
  if (!a || !b) return 0
  const ta = trigrams(a)
  const tb = trigrams(b)
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

// Palabras de formato que el script de build NO elimina del nombre (deuda bloque 9)
const FORMAT_WORDS = [
  'doble magnum', 'double magnum', 'media botella', 'half bottle',
  'matusalem', 'methuselah', 'balthazar', 'salmanazar', 'rehoboam',
  'jeroboam', 'imperial', 'magnum',
]

function tieneFormatoEmbebido (normNombre) {
  return FORMAT_WORDS.some(fw => normNombre.includes(fw))
}

function quitarFormato (normNombre) {
  let s = normNombre
  // Orden importante: primero los compuestos (doble magnum antes que magnum)
  for (const fw of FORMAT_WORDS) s = s.replace(fw, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main () {
  const DRY_RUN = !process.argv.includes('--apply')
  if (DRY_RUN) console.log('[DRY RUN] Pasar --apply para insertar en BD.\n')
  else         console.log('[APPLY] Insertando en BD.\n')

  const env = loadEnv()
  const sb  = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } })

  // ── Recuento antes ────────────────────────────────────────────────────────
  const { count: antesTotal } = await sb
    .from('dedup_candidato').select('*', { count: 'exact', head: true })
  console.log(`dedup_candidato antes: ${antesTotal}`)

  // ── Cargar vinos ──────────────────────────────────────────────────────────
  console.log('Cargando vinos…')
  const vinos = await fetchAll(sb, 'vino', 'id, nombre, bodega_id')
  console.log(`  ${vinos.length} vinos`)

  // Agrupar por bodega
  const byBodega = new Map()
  for (const v of vinos) {
    if (!v.bodega_id) continue
    if (!byBodega.has(v.bodega_id)) byBodega.set(v.bodega_id, [])
    byBodega.get(v.bodega_id).push(v)
  }

  // ── Identificar pares candidatos (sim >= 0.65) ────────────────────────────
  const pares = [] // { vinoConId, vinoSinId, sim }
  for (const [, grupo] of byBodega) {
    const conFmt = grupo.filter(v => tieneFormatoEmbebido(normTexto(v.nombre)))
    const sinFmt = grupo.filter(v => !tieneFormatoEmbebido(normTexto(v.nombre)))
    if (!conFmt.length || !sinFmt.length) continue
    for (const vCon of conFmt) {
      const normCon    = normTexto(vCon.nombre)
      const sinFmtNorm = quitarFormato(normCon)
      for (const vSin of sinFmt) {
        const normSin = normTexto(vSin.nombre)
        const sim     = similarity(sinFmtNorm, normSin)
        if (sim < 0.65) continue
        pares.push({ vinoConId: vCon.id, vinoSinId: vSin.id, sim: Math.round(sim * 1000) / 1000 })
      }
    }
  }
  console.log(`  ${pares.length} pares >= 0.65 encontrados`)

  // ── Cargar vino_anadas ────────────────────────────────────────────────────
  const allVinoIds = [...new Set(pares.flatMap(p => [p.vinoConId, p.vinoSinId]))]
  console.log(`Cargando vino_anadas para ${allVinoIds.length} vinos…`)
  const vasAll = []
  for (let i = 0; i < allVinoIds.length; i += 100) {
    const chunk = allVinoIds.slice(i, i + 100)
    const rows = await fetchAll(sb, 'vino_anada', 'id, vino_id, formato_ml',
      q => q.in('vino_id', chunk))
    vasAll.push(...rows)
  }
  console.log(`  ${vasAll.length} vino_anadas`)

  // Índice vino_id → [vino_anada_id, …] ordenados (750ml primero, luego asc)
  const vasByVino = new Map()
  for (const va of vasAll) {
    if (!vasByVino.has(va.vino_id)) vasByVino.set(va.vino_id, [])
    vasByVino.get(va.vino_id).push(va)
  }
  for (const [, list] of vasByVino) {
    list.sort((a, b) => a.formato_ml === 750 ? -1 : b.formato_ml === 750 ? 1 : a.formato_ml - b.formato_ml)
  }

  // Índice vino_anada_id → vino_id (para cruzar con candidatos existentes)
  const vinoByVa = new Map()
  for (const va of vasAll) vinoByVa.set(va.id, va.vino_id)

  // ── Cargar candidatos existentes relevantes ───────────────────────────────
  const allVaIds = vasAll.map(v => v.id)
  console.log(`Cargando candidatos existentes para ${allVaIds.length} vino_anadas…`)
  const candExist = []
  for (let i = 0; i < allVaIds.length; i += 100) {
    const chunk = allVaIds.slice(i, i + 100)
    const orFilter = chunk.map(id => `vino_anada_a.eq.${id},vino_anada_b.eq.${id}`).join(',')
    const { data, error } = await sb.from('dedup_candidato')
      .select('id, vino_anada_a, vino_anada_b')
      .or(orFilter)
    if (error) throw new Error('dedup_candidato: ' + error.message)
    candExist.push(...(data || []))
  }
  // Deduplicar
  const candMap = new Map(candExist.map(c => [c.id, c]))

  // Construir conjunto de pares (vinoId_A, vinoId_B) ya cubiertos
  const paresCubiertos = new Set()
  for (const c of candMap.values()) {
    const vA = vinoByVa.get(c.vino_anada_a)
    const vB = vinoByVa.get(c.vino_anada_b)
    if (vA && vB) {
      const [lo, hi] = vA < vB ? [vA, vB] : [vB, vA]
      paresCubiertos.add(`${lo}|${hi}`)
    }
  }
  console.log(`  ${candMap.size} candidatos existentes, ${paresCubiertos.size} pares cubiertos`)

  // ── Generar nuevos candidatos ─────────────────────────────────────────────
  const nuevos = []
  const seenPares = new Set(paresCubiertos)

  for (const { vinoConId, vinoSinId, sim } of pares) {
    const [lo, hi] = vinoConId < vinoSinId ? [vinoConId, vinoSinId] : [vinoSinId, vinoConId]
    const pKey = `${lo}|${hi}`
    if (seenPares.has(pKey)) continue
    seenPares.add(pKey)

    const repCon = (vasByVino.get(vinoConId) || [])[0]
    const repSin = (vasByVino.get(vinoSinId) || [])[0]
    if (!repCon || !repSin) continue

    const [idA, idB] = repCon.id < repSin.id ? [repCon.id, repSin.id] : [repSin.id, repCon.id]
    nuevos.push({
      id:           deterministicUUID('dedup', idA, idB),
      vino_anada_a: idA,
      vino_anada_b: idB,
      similitud:    sim,
      estado:       'pendiente',
    })
  }

  console.log(`\nNuevos candidatos a insertar: ${nuevos.length}`)

  if (nuevos.length === 0) {
    console.log('Nada que insertar.')
    return
  }

  // Muestra de 5
  console.log('\nMuestra (primeros 5):')
  for (const c of nuevos.slice(0, 5)) {
    const vaA = vasAll.find(v => v.id === c.vino_anada_a)
    const vaB = vasAll.find(v => v.id === c.vino_anada_b)
    const nomA = vinos.find(v => v.id === vinoByVa.get(c.vino_anada_a))?.nombre || '?'
    const nomB = vinos.find(v => v.id === vinoByVa.get(c.vino_anada_b))?.nombre || '?'
    console.log(`  ${c.id}`)
    console.log(`    A: ${nomA} (${vaA?.formato_ml}ml)`)
    console.log(`    B: ${nomB} (${vaB?.formato_ml}ml)  sim=${c.similitud}`)
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Sin cambios. Pasar --apply para insertar.')
    return
  }

  // ── Insertar en chunks de 100 ─────────────────────────────────────────────
  let insertados = 0
  let errores    = 0
  for (let i = 0; i < nuevos.length; i += 100) {
    const chunk = nuevos.slice(i, i + 100)
    const { error } = await sb.from('dedup_candidato').insert(chunk)
    if (error) {
      // Ignorar duplicados (unique violation = 23505)
      if (error.code === '23505') {
        insertados += chunk.length // probablemente la mayoría OK
      } else {
        console.error(`  ERROR chunk ${i}: ${error.message}`)
        errores += chunk.length
      }
    } else {
      insertados += chunk.length
    }
  }
  console.log(`\nInsertados: ${insertados}  Errores: ${errores}`)

  // Recuento después
  const { count: despuesTotal } = await sb
    .from('dedup_candidato').select('*', { count: 'exact', head: true })
  console.log(`dedup_candidato después: ${despuesTotal}`)
}

main().catch(e => { console.error(e); process.exit(1) })
