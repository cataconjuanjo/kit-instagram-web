'use strict'
// construir-canonico.js — Bloque 5: construye vino / vino_anada / oferta / dedup_candidato
// --dry-run por defecto. Pasar --apply para escribir en BD.

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

// UUID determinista basado en SHA-256 de la clave natural.
// Formato UUID estándar (no v5 RFC, pero válido como UUID en Postgres).
function deterministicUUID (...parts) {
  const h = crypto.createHash('sha256').update(parts.join('\x00')).digest('hex')
  return [h.slice(0,8), h.slice(8,12), h.slice(12,16), h.slice(16,20), h.slice(20,32)].join('-')
}

// Extrae añada de un nombre de vino. Devuelve { anada, nombreLimpio, dudoso }.
// Dudoso: rango de cosecha tipo "2011 - 12" o dos años distintos en el nombre.
function extractAnada (nombre) {
  if (!nombre) return { anada: null, nombreLimpio: '', dudoso: false }

  // Rango de cosecha: "2011 - 12" o "2011-12" — no podemos asignar una sola añada
  if (/\b(19|20)\d{2}\s*[-–]\s*\d{2}\b/.test(nombre)) {
    return { anada: null, nombreLimpio: nombre.trim(), dudoso: true }
  }

  const matches = [...nombre.matchAll(/\b((19|20)\d{2})\b/g)]

  if (matches.length === 0) {
    return { anada: null, nombreLimpio: nombre.trim(), dudoso: false }
  }
  if (matches.length > 1) {
    // Más de un año: DUDOSO; conservamos el nombre sin tocar
    return { anada: parseInt(matches[matches.length - 1][1]), nombreLimpio: nombre.trim(), dudoso: true }
  }

  const m = matches[0]
  const nombreLimpio = (nombre.slice(0, m.index) + nombre.slice(m.index + m[0].length))
    .replace(/\s+/g, ' ').trim()
  return { anada: parseInt(m[1]), nombreLimpio, dudoso: false }
}

// Convierte formato a ml. Extrae codigo_articulo y unidadesCaja si los hay.
// Devuelve { ml, codigoArticulo, unidadesCaja, dudoso }.
function parseFormato (raw) {
  if (!raw || !raw.trim()) return { ml: 750, codigoArticulo: null, unidadesCaja: null, dudoso: true }
  const s = raw.trim()
  let ml = null
  let codigoArticulo = null
  let unidadesCaja = null

  // Casos textuales conocidos — intercept antes de cualquier parsing numérico
  if (s.toLowerCase() === 'null') {
    return { ml: 750, codigoArticulo: null, unidadesCaja: null, dudoso: false }
  }
  const cajaM = s.match(/^caja\s+(\d+)$/i)
  if (cajaM) {
    return { ml: 750, codigoArticulo: null, unidadesCaja: parseInt(cajaM[1]), dudoso: false }
  }
  if (/^unidad\s*\/\s*asignaci[oó]n$/i.test(s)) {
    return { ml: 750, codigoArticulo: null, unidadesCaja: null, dudoso: false }
  }

  // cl → ml (acepta "75 cl", "75CL", "37,5 cl", "botella 75 cl")
  const clM = s.match(/(\d+[,.]?\d*)\s*cl\b/i)
  if (clM) ml = Math.round(parseFloat(clM[1].replace(',', '.')) * 10)

  // L/lt/litro → ml solo si no hay cl
  if (!ml) {
    const lM = s.match(/\b(\d+[,.]?\d*)\s*(?:l|lt|litro)\b/i)
    if (lM) ml = Math.round(parseFloat(lM[1].replace(',', '.')) * 1000)
  }

  // Nombres canónicos de formato — usar cadena sin acentos para el match
  // (cubre variantes como "Mágnum" con á acentuada)
  if (!ml) {
    const low = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (/media\s*botella|half\s*bottle/.test(low))                ml = 375
    else if (/doble\s*magnum|double\s*magnum|jeroboam/.test(low)) ml = 3000
    else if (/magnum/.test(low))                                  ml = 1500
    else if (/imperial|imperi/.test(low))                         ml = 6000
    else if (/botella/.test(low))                                 ml = 750
  }

  // Unidades por caja: "6 u/c", "6u/c", "º6 u/c", "6 u.c"
  const ucM = s.match(/[°º\s](\d{1,2})\s*u\s*[/.\-]\s*c\b/i) ||
              s.match(/\b(\d{1,2})\s*u\s*\/\s*c\b/i)
  if (ucM) unidadesCaja = parseInt(ucM[1])

  // Código de artículo: último segmento tras · si es cadena numérica de 4-8 dígitos
  const segs = s.split(/[·•|]/)
  if (segs.length > 1) {
    const last = segs[segs.length - 1].trim()
    if (/^\d{4,8}$/.test(last)) codigoArticulo = last
  }

  if (!ml) ml = 750  // default conservador
  const dudoso = !clM && !s.match(/\b(\d+[,.]?\d*)\s*(?:l|lt|litro)\b/i) &&
                 !/media|magnum|jeroboam|botella|imperial/i.test(s)

  return { ml, codigoArticulo, unidadesCaja, dudoso }
}

// ── Similitud trigrama (Jaccard) ─────────────────────────────────────────────

function trigramas (s) {
  const set = new Set()
  const p = '  ' + s + '  '
  for (let i = 0; i < p.length - 2; i++) set.add(p.slice(i, i + 3))
  return set
}

function similarity (a, b) {
  if (!a || !b) return 0
  const ta = trigramas(a), tb = trigramas(b)
  if (ta.size === 0 && tb.size === 0) return 1
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

// ── Escritura por lotes ──────────────────────────────────────────────────────

async function batchUpsert (sb, table, rows, label) {
  if (rows.length === 0) { console.log(`  ${table}: 0 filas`); return }
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await sb.from(table)
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(`${table} batch ${i}: ${error.message}`)
  }
  console.log(`  ${table}: ${rows.length} filas`)
}

// ── Pasada principal ─────────────────────────────────────────────────────────

async function pasada (sb, apply) {
  console.log('Cargando proveedor_catalogo_vinos…')
  const rows = await fetchAll(sb, 'proveedor_catalogo_vinos',
    'id,nombre,formato,coste_estimado,disponibilidad,proveedor_id,bodega_id,zona_id,referencia_proveedor,bodega_pendiente')
  console.log(`  Total filas: ${rows.length}\n`)

  const vinoMap     = new Map()  // deterministicUUID → vino record
  const vaMap       = new Map()  // deterministicUUID → vino_anada record
  const vaByVino    = new Map()  // vinoId → [vino_anada, ...]
  const ofertas     = []
  const dudososAnada  = []
  const dudososFmt    = []
  let autoMerge = 0
  let sinNombre = 0

  for (const row of rows) {
    // ── 1. Añada ─────────────────────────────────────────────────────────
    const { anada, nombreLimpio, dudoso: dudosoAnada } = extractAnada(row.nombre || '')
    if (dudosoAnada) dudososAnada.push({ id: row.id, nombre: row.nombre })

    // ── 2. Formato ────────────────────────────────────────────────────────
    const { ml, codigoArticulo, unidadesCaja, dudoso: dudosoFmt } = parseFormato(row.formato)
    if (dudosoFmt) dudososFmt.push({ id: row.id, nombre: row.nombre, formato: row.formato })

    // ── 3. Nombre normalizado ─────────────────────────────────────────────
    const nombreNorm = normTexto(nombreLimpio)
    if (!nombreNorm) { sinNombre++; continue }

    const bodegaId = row.bodega_id || null
    const zonaId   = row.zona_id   || null

    // ── 4. Vino (clave natural: bodega_id + nombre_norm) ──────────────────
    const vinoId = deterministicUUID('vino', bodegaId || '', nombreNorm)
    if (!vinoMap.has(vinoId)) {
      vinoMap.set(vinoId, {
        id: vinoId,
        bodega_id:   bodegaId,
        nombre:      nombreLimpio,
        tipo:        null,
        zona_id:     zonaId,
        uvas:        [],
      })
      vaByVino.set(vinoId, [])
    }

    // ── 5. Vino_anada (clave natural: vino_id + anada + formato_ml) ───────
    const vaId = deterministicUUID('va', vinoId, String(anada ?? ''), String(ml))
    if (!vaMap.has(vaId)) {
      const va = { id: vaId, vino_id: vinoId, anada: anada ?? null, formato_ml: ml }
      vaMap.set(vaId, va)
      vaByVino.get(vinoId).push(va)
    } else {
      autoMerge++  // clave dura: misma (bodega+nombre+añada+formato)
    }

    // ── 6. Oferta ─────────────────────────────────────────────────────────
    ofertas.push({
      id:                   deterministicUUID('oferta', row.id),
      proveedor_id:         row.proveedor_id,
      vino_anada_id:        vaId,
      codigo_articulo:      codigoArticulo || row.referencia_proveedor || null,
      coste:                row.coste_estimado,
      iva:                  null,
      unidades_caja:        unidadesCaja,
      disponibilidad:       row.disponibilidad,
      referencia_origen_id: row.id,
    })
  }

  // ── 7. Soft dedup: similitud de nombre dentro de la misma bodega ──────────
  const dedupCandidatos = []
  const seenPares = new Set()

  // Agrupar vinos por bodega_id; excluir bodega_id=null (bodegas no resueltas)
  const vinosByBodega = new Map()
  for (const [, vino] of vinoMap) {
    if (!vino.bodega_id) continue
    if (!vinosByBodega.has(vino.bodega_id)) vinosByBodega.set(vino.bodega_id, [])
    vinosByBodega.get(vino.bodega_id).push(vino)
  }

  for (const [, vinos] of vinosByBodega) {
    if (vinos.length < 2) continue
    for (let i = 0; i < vinos.length; i++) {
      for (let j = i + 1; j < vinos.length; j++) {
        const sim = similarity(vinos[i].nombre_norm || normTexto(vinos[i].nombre),
                               vinos[j].nombre_norm || normTexto(vinos[j].nombre))
        if (sim < 0.65 || sim >= 1.0) continue

        // Un candidato por par de vinos: usar vino_anada representativa (750ml si existe)
        const repA = (vaByVino.get(vinos[i].id) || [])
          .sort((a, b) => a.formato_ml === 750 ? -1 : b.formato_ml === 750 ? 1 : a.formato_ml - b.formato_ml)[0]
        const repB = (vaByVino.get(vinos[j].id) || [])
          .sort((a, b) => a.formato_ml === 750 ? -1 : b.formato_ml === 750 ? 1 : a.formato_ml - b.formato_ml)[0]
        if (!repA || !repB) continue

        const [idA, idB] = repA.id < repB.id ? [repA.id, repB.id] : [repB.id, repA.id]
        const pKey = `${idA}|${idB}`
        if (seenPares.has(pKey)) continue
        seenPares.add(pKey)

        dedupCandidatos.push({
          id:           deterministicUUID('dedup', idA, idB),
          vino_anada_a: idA,
          vino_anada_b: idB,
          similitud:    Math.round(sim * 1000) / 1000,
          estado:       'pendiente',
        })
      }
    }
  }

  // ── 8. Informe ────────────────────────────────────────────────────────────
  console.log('=== INFORME ===')
  console.log(`Filas procesadas:         ${rows.length}`)
  console.log(`Filas sin nombre útil:    ${sinNombre}`)
  console.log(`Vinos únicos:             ${vinoMap.size}`)
  console.log(`Vino_añadas únicas:       ${vaMap.size}`)
  console.log(`Ofertas a crear:          ${ofertas.length}`)
  console.log(`Fusiones automáticas:     ${autoMerge}`)
  console.log(`Candidatos soft-dedup:    ${dedupCandidatos.length}`)
  console.log(`DUDOSO añada:             ${dudososAnada.length}`)
  console.log(`DUDOSO formato:           ${dudososFmt.length}`)

  if (dudososAnada.length > 0) {
    console.log('\n── DUDOSO añada (primeros 20) ───────────────────────────')
    dudososAnada.slice(0, 20).forEach(d => console.log(`  ${d.nombre}`))
    if (dudososAnada.length > 20) console.log(`  … (${dudososAnada.length - 20} más)`)
  }

  if (dudososFmt.length > 0) {
    console.log('\n── DUDOSO formato (primeros 20) ─────────────────────────')
    dudososFmt.slice(0, 20).forEach(d =>
      console.log(`  "${d.formato}"  ←  ${d.nombre}`))
    if (dudososFmt.length > 20) console.log(`  … (${dudososFmt.length - 20} más)`)
  }

  if (!apply) {
    console.log('\n[DRY RUN] No se ha escrito nada en la base de datos.')
    return
  }

  // ── 9. Escritura en BD ────────────────────────────────────────────────────
  console.log('\nEscribiendo en BD…')
  await batchUpsert(sb, 'vino',            [...vinoMap.values()].map(v => ({
    id: v.id, bodega_id: v.bodega_id, nombre: v.nombre, tipo: v.tipo, zona_id: v.zona_id, uvas: v.uvas,
  })))
  await batchUpsert(sb, 'vino_anada',      [...vaMap.values()])
  await batchUpsert(sb, 'oferta',          ofertas)
  await batchUpsert(sb, 'dedup_candidato', dedupCandidatos)
  console.log('\nPasada completada.')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main () {
  const env   = loadEnv()
  const url   = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const key   = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
  const sb    = createClient(url, key)
  const apply = process.argv.includes('--apply')
  if (apply) console.log('[APPLY] Modo escritura activo.\n')
  else       console.log('[DRY RUN] Sin escritura en BD. Pasar --apply para aplicar.\n')
  await pasada(sb, apply)
}

main().catch(e => { console.error(e.message); process.exit(1) })
