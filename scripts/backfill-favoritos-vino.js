'use strict'
// backfill-favoritos-vino.js — Bloque 6
// Para cada proveedor_catalogo_vinos con favorito=true:
//   1. Busca la oferta cuyo referencia_origen_id apunta a esa fila
//   2. Obtiene vino_anada.vino_id
//   3. Escribe proveedor_catalogo_vinos.vino_id
// Requiere que la migración 0006_favoritos_canonico.sql ya se haya ejecutado.
// --dry-run por defecto. Pasar --apply para escribir.

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

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
    if (error) throw new Error(`${table}: ${error.message}`)
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

async function main () {
  const DRY_RUN = !process.argv.includes('--apply')
  console.log(DRY_RUN
    ? '[DRY RUN] Sin escritura en BD. Pasar --apply para aplicar.\n'
    : '[APPLY] Escribiendo en BD.\n')

  const env = loadEnv()
  const sb  = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } })

  // ── Cargar favoritos ──────────────────────────────────────────────────────
  console.log('Cargando favoritos (favorito=true)…')
  // vino_id se selecciona solo si la migración ya corrió (columna existe)
  let selectFav = 'id, nombre, bodega, proveedor_id'
  if (!DRY_RUN) {
    // En apply, la columna debe existir (el usuario confirmó que corrió la migración)
    selectFav += ', vino_id'
  }
  const favoritos = await fetchAll(sb, 'proveedor_catalogo_vinos',
    selectFav,
    q => q.eq('favorito', true))
  console.log(`  Total favoritos en BD: ${favoritos.length}`)

  // ── Comparar con CSV del bloque 1 ─────────────────────────────────────────
  const csvPath = path.join(__dirname, '..', 'backups', '2026-09-12', 'favoritos.csv')
  let csvCount = null
  if (fs.existsSync(csvPath)) {
    const lines = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/).filter(l => l.trim())
    csvCount = lines.length - 1  // descontar cabecera
    console.log(`  Favoritos en CSV bloque 1 (${csvPath}): ${csvCount}`)
    if (favoritos.length !== csvCount) {
      console.warn(`  ⚠ DIFERENCIA: BD=${favoritos.length} vs CSV=${csvCount}`)
    } else {
      console.log('  ✓ Recuento coincide con CSV del bloque 1')
    }
  } else {
    console.log(`  (CSV no encontrado en ${csvPath} — omitiendo comparación)`)
  }

  // ── Cargar ofertas indexadas por referencia_origen_id ─────────────────────
  console.log('\nCargando ofertas con vino_anada…')
  const favIds = favoritos.map(f => f.id)

  // Chunk para evitar URLs largas
  const ofertas = []
  for (let i = 0; i < favIds.length; i += 100) {
    const chunk = favIds.slice(i, i + 100)
    const rows = await fetchAll(sb, 'oferta',
      'referencia_origen_id, vino_anada_id',
      q => q.in('referencia_origen_id', chunk))
    ofertas.push(...rows)
  }
  console.log(`  ${ofertas.length} ofertas encontradas para los ${favoritos.length} favoritos`)

  // Índice referencia_origen_id → vino_anada_id
  const ofertaMap = new Map()
  for (const o of ofertas) {
    if (!ofertaMap.has(o.referencia_origen_id)) ofertaMap.set(o.referencia_origen_id, o.vino_anada_id)
  }

  // ── Cargar vino_anadas para resolver vino_id ──────────────────────────────
  const vaIds = [...new Set(ofertas.map(o => o.vino_anada_id))]
  const vino_anadas = []
  for (let i = 0; i < vaIds.length; i += 100) {
    const chunk = vaIds.slice(i, i + 100)
    const rows = await fetchAll(sb, 'vino_anada', 'id, vino_id', q => q.in('id', chunk))
    vino_anadas.push(...rows)
  }
  const vaMap = new Map(vino_anadas.map(va => [va.id, va.vino_id]))

  // ── Analizar cada favorito ────────────────────────────────────────────────
  const resueltos     = []
  const yaResueltos   = []
  const sinOferta     = []
  const sinVino       = []

  for (const fav of favoritos) {
    if (fav.vino_id) {
      // columna ya backfilleada (solo disponible en modo --apply)
      yaResueltos.push(fav)
      continue
    }
    const vaId   = ofertaMap.get(fav.id)
    if (!vaId) { sinOferta.push(fav); continue }
    const vinoId = vaMap.get(vaId)
    if (!vinoId) { sinVino.push(fav); continue }
    resueltos.push({ pcvId: fav.id, vinoId })
  }

  console.log(`\n── Informe ──────────────────────────────────────────────`)
  console.log(`  Ya tenían vino_id:       ${yaResueltos.length}`)
  console.log(`  Resolvibles ahora:       ${resueltos.length}`)
  console.log(`  Sin oferta en tabla:     ${sinOferta.length}`)
  console.log(`  Sin vino_anada resuelta: ${sinVino.length}`)
  console.log(`  Total:                   ${favoritos.length}`)

  if (sinOferta.length) {
    console.log('\n  Sin oferta (proveedor_catalogo_vinos.id → oferta.referencia_origen_id no encontrado):')
    for (const f of sinOferta) {
      console.log(`    ${f.id}  "${f.nombre}" | ${f.bodega || '(sin bodega)'}`)
    }
  }
  if (sinVino.length) {
    console.log('\n  Sin vino_anada resuelta:')
    for (const f of sinVino) {
      console.log(`    ${f.id}  "${f.nombre}" | ${f.bodega || '(sin bodega)'}`)
    }
  }

  if (DRY_RUN || !resueltos.length) {
    if (!resueltos.length) console.log('\nNada que actualizar.')
    else console.log(`\n[DRY RUN] Se actualizarían ${resueltos.length} filas. Pasar --apply para aplicar.`)
    return
  }

  // ── Aplicar ───────────────────────────────────────────────────────────────
  console.log(`\nActualizando ${resueltos.length} favoritos con vino_id…`)
  let ok = 0, err = 0
  for (const { pcvId, vinoId } of resueltos) {
    const { error } = await sb.from('proveedor_catalogo_vinos')
      .update({ vino_id: vinoId })
      .eq('id', pcvId)
    if (error) {
      console.error(`  ERROR ${pcvId}: ${error.message}`)
      err++
    } else {
      ok++
    }
  }
  console.log(`  Actualizados: ${ok}  Errores: ${err}`)

  // ── Recuento final ────────────────────────────────────────────────────────
  const { count: conVinoId } = await sb.from('proveedor_catalogo_vinos')
    .select('*', { count: 'exact', head: true })
    .eq('favorito', true)
    .not('vino_id', 'is', null)
  const { count: total } = await sb.from('proveedor_catalogo_vinos')
    .select('*', { count: 'exact', head: true })
    .eq('favorito', true)

  console.log(`\n── Recuento final ───────────────────────────────────────`)
  console.log(`  Favoritos totales:       ${total}`)
  console.log(`  Con vino_id resuelto:   ${conVinoId}`)
  console.log(`  Sin vino_id (pendiente): ${total - conVinoId}`)
  if (csvCount !== null) {
    console.log(`  CSV bloque 1:           ${csvCount}`)
    console.log(total === csvCount
      ? '  ✓ Ninguno se ha perdido'
      : `  ⚠ Diferencia: ${total - csvCount} respecto al CSV`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
