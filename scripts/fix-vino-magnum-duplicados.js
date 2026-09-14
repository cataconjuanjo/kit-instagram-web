'use strict'
// fix-vino-magnum-duplicados.js
// Corrige los pares de vino duplicados donde "Magnum"/"Mágnum" quedó
// embebido en el nombre en lugar de derivarse a vino_anada.formato_ml
// (bug en construir-canonico.js líneas 192-218, bloque 5).
//
// Por cada par (vino_base sin "magnum", vino_magnum con "magnum", misma bodega):
//   1. Re-parentar vino_anada de vino_magnum → vino_base (id intacto)
//   2. Borrar dedup_candidato del par (SIN crear dedup_decision)
//   3. Borrar vino_magnum — solo tras verificar count(vino_anada)=0, id individual
//
// --dry-run por defecto. --apply para escribir.

const fs   = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// ── Entorno ───────────────────────────────────────────────────────────────────

function loadEnv() {
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

// ── Normalización ─────────────────────────────────────────────────────────────

function normTexto(v) {
  if (!v) return ''
  return v
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tieneFormatoMagnum(normNombre) {
  return /doble\s+magnum|double\s+magnum|magnum/.test(normNombre)
}

function quitarMagnum(normNombre) {
  // Compuestos primero para no dejar "doble " suelto
  return normNombre
    .replace(/doble\s+magnum|double\s+magnum/g, ' ')
    .replace(/magnum/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchAll(sb, table, select, extra) {
  const all = []
  for (let offset = 0; ; offset += 1000) {
    let q = sb.from(table).select(select).range(offset, offset + 999)
    if (extra) q = extra(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    all.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return all
}

// ── Constante vigilada ────────────────────────────────────────────────────────

// vino_anada enlazado hoy en carta de Lo de Carmen — verificar explícitamente
const VA_CARMEN = 'af254353-98d9-c8d2-3122-fc0254b93b37'

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const DRY_RUN = !process.argv.includes('--apply')
  console.log(DRY_RUN ? '[DRY RUN] Pasar --apply para escribir en BD.\n'
                       : '[APPLY] Modo escritura activo.\n')

  const env = loadEnv()
  const sb  = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  )

  // ── 1. Cargar todos los vinos ─────────────────────────────────────────────
  console.log('Cargando vinos…')
  const vinos = await fetchAll(sb, 'vino', 'id, nombre, bodega_id')
  console.log(`  ${vinos.length} vinos\n`)

  // Separar con-magnum / sin-magnum, indexados por bodega
  const conMagnum          = []
  const sinMagnumPorBodega = new Map()

  for (const v of vinos) {
    if (!v.bodega_id) continue
    const norm = normTexto(v.nombre)
    if (tieneFormatoMagnum(norm)) {
      conMagnum.push({ ...v, _norm: norm })
    } else {
      if (!sinMagnumPorBodega.has(v.bodega_id)) sinMagnumPorBodega.set(v.bodega_id, [])
      sinMagnumPorBodega.get(v.bodega_id).push({ ...v, _norm: norm })
    }
  }

  // ── 2. Identificar pares ──────────────────────────────────────────────────
  const pares = []
  for (const vm of conMagnum) {
    const candidatos = sinMagnumPorBodega.get(vm.bodega_id) || []
    const base = candidatos.find(v => v._norm === quitarMagnum(vm._norm))
    if (base) pares.push({ vinoBase: base, vinoMagnum: vm })
  }

  const bodegasN = new Set(pares.map(p => p.vinoBase.bodega_id)).size
  console.log(`Pares identificados: ${pares.length} en ${bodegasN} bodegas`)

  if (pares.length === 0) {
    console.log('Sin correcciones necesarias.')
    return
  }

  // ── 3. Cargar vino_anada para todos los vinos implicados ──────────────────
  const vinoIds = [...new Set(pares.flatMap(p => [p.vinoBase.id, p.vinoMagnum.id]))]
  console.log(`\nCargando vino_anada para ${vinoIds.length} vinos…`)

  const todasVas = []
  for (let i = 0; i < vinoIds.length; i += 100) {
    const rows = await fetchAll(sb, 'vino_anada', 'id, vino_id, anada, formato_ml',
      q => q.in('vino_id', vinoIds.slice(i, i + 100)))
    todasVas.push(...rows)
  }

  const vasByVino = new Map()
  for (const va of todasVas) {
    if (!vasByVino.has(va.vino_id)) vasByVino.set(va.vino_id, [])
    vasByVino.get(va.vino_id).push(va)
  }
  console.log(`  ${todasVas.length} vino_anada cargadas`)

  // ── 4. Cargar dedup_candidato relevantes ──────────────────────────────────
  const vaIds = todasVas.map(v => v.id)
  console.log(`\nCargando dedup_candidato para ${vaIds.length} vino_anada…`)

  const dedupRowsRaw = []
  for (let i = 0; i < vaIds.length; i += 50) {
    const chunk  = vaIds.slice(i, i + 50)
    const filter = chunk.map(id => `vino_anada_a.eq.${id},vino_anada_b.eq.${id}`).join(',')
    const { data, error } = await sb.from('dedup_candidato')
      .select('id, vino_anada_a, vino_anada_b, estado')
      .or(filter)
    if (error) throw new Error(`dedup_candidato: ${error.message}`)
    dedupRowsRaw.push(...(data || []))
  }
  // Deduplicar por id (puede aparecer en múltiples chunks)
  const dedupRows = [...new Map(dedupRowsRaw.map(d => [d.id, d])).values()]
  console.log(`  ${dedupRows.length} dedup_candidato cargados`)

  // ── 5. Planificar operaciones ─────────────────────────────────────────────
  let totalMover      = 0
  let totalConflictos = 0
  let totalDedup      = 0
  let totalParaBorrar = 0
  let carmenEstado    = 'no afectado — vino_anada no pertenece a ningún vino_magnum de los pares'

  const ops = []

  for (const { vinoBase, vinoMagnum } of pares) {
    const vasBase   = vasByVino.get(vinoBase.id)   || []
    const vasMagnum = vasByVino.get(vinoMagnum.id) || []

    // Claves ya ocupadas en vinoBase: no podemos re-parentar si ya existe la misma
    const clavesBase = new Set(vasBase.map(va => `${va.anada ?? ''}|${va.formato_ml}`))

    const vasMover     = []
    const vasConflicto = []

    for (const va of vasMagnum) {
      const esConflicto = clavesBase.has(`${va.anada ?? ''}|${va.formato_ml}`)
      if (esConflicto) {
        vasConflicto.push(va)
      } else {
        vasMover.push(va)
        // Actualizar claves para detectar conflictos con vino_anada posteriores del mismo magnum
        clavesBase.add(`${va.anada ?? ''}|${va.formato_ml}`)
      }
      if (va.id === VA_CARMEN) {
        carmenEstado = esConflicto
          ? `⚠ CONFLICTO DE CLAVE en par "${vinoMagnum.nombre}" → "${vinoBase.nombre}" — REVISAR`
          : `re-parentado de "${vinoMagnum.nombre}" → "${vinoBase.nombre}"\n    vino_anada.id CONSERVADO — carta de Lo de Carmen SIGUE VÁLIDA`
      }
    }

    // dedup_candidato que cruzan una va de vinoBase con una va de vinoMagnum
    const vaIdBase   = new Set(vasBase.map(v => v.id))
    const vaIdMagnum = new Set(vasMagnum.map(v => v.id))

    const dedupDelPar = dedupRows.filter(d =>
      (vaIdBase.has(d.vino_anada_a) && vaIdMagnum.has(d.vino_anada_b)) ||
      (vaIdMagnum.has(d.vino_anada_a) && vaIdBase.has(d.vino_anada_b)),
    )

    totalMover      += vasMover.length
    totalConflictos += vasConflicto.length
    totalDedup      += dedupDelPar.length
    if (vasConflicto.length === 0) totalParaBorrar++

    ops.push({
      vinoBase,
      vinoMagnum,
      vasMover,
      vasConflicto,
      dedupIds: dedupDelPar.map(d => d.id),
    })
  }

  // ── 6. Resumen dry-run ────────────────────────────────────────────────────
  const SEP = '═'.repeat(56)
  console.log(`\n${SEP}`)
  console.log('RESUMEN')
  console.log(`  Pares a procesar:             ${pares.length}`)
  console.log(`  vino_anada a re-parentar:     ${totalMover}`)
  console.log(`  vino_anada en conflicto (*):  ${totalConflictos}`)
  console.log(`  vino a borrar:                ${totalParaBorrar}`)
  console.log(`  dedup_candidato a borrar:     ${totalDedup}  (sin crear dedup_decision)`)
  if (totalConflictos > 0)
    console.log(`  (*) misma clave anada+formato_ml ya existe en vinoBase → SKIP`)

  console.log(`\n  ► MAR DE FRADES / vino_anada vigilado:`)
  console.log(`    id:     ${VA_CARMEN}`)
  console.log(`    estado: ${carmenEstado}`)
  console.log(SEP)

  // Listar conflictos
  const opsConConflicto = ops.filter(op => op.vasConflicto.length > 0)
  if (opsConConflicto.length > 0) {
    console.log(`\nConflictos de clave (${opsConConflicto.length} pares — estos vino_anada NO se tocarán):`)
    for (const op of opsConConflicto) {
      console.log(`  "${op.vinoMagnum.nombre}" → "${op.vinoBase.nombre}"`)
      for (const va of op.vasConflicto) {
        console.log(`    ↳ ${va.id}  anada=${va.anada ?? 'null'}  formato_ml=${va.formato_ml}  — SKIP`)
      }
    }
  }

  // Muestra de formato_ml (confirma que ya está correcto, script no lo toca)
  console.log('\nMuestra vino_anada a re-parentar (primeras 8):')
  const muestra = ops.flatMap(op => op.vasMover.map(va => ({ ...va, _magnum: op.vinoMagnum.nombre, _base: op.vinoBase.nombre }))).slice(0, 8)
  for (const va of muestra) {
    console.log(`  ${va._magnum.padEnd(30)} → ${va._base.padEnd(30)}  formato_ml=${va.formato_ml}ml  anada=${va.anada ?? 'S/A'}`)
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Sin cambios en BD. Pasar --apply para ejecutar.\n')
    return
  }

  // ── 7. Backup CSV ─────────────────────────────────────────────────────────
  const backupDir  = 'backups'
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })
  const ts         = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `fix-magnum-${ts}.csv`)

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csvLines = [
    'vino_magnum_id,vino_magnum_nombre,vino_base_id,vino_base_nombre,bodega_id,vino_anada_id,anada,formato_ml,accion',
  ]
  for (const op of ops) {
    for (const va of op.vasMover)
      csvLines.push([op.vinoMagnum.id, esc(op.vinoMagnum.nombre), op.vinoBase.id, esc(op.vinoBase.nombre),
        op.vinoBase.bodega_id, va.id, va.anada ?? '', va.formato_ml, 'reparentar'].join(','))
    for (const va of op.vasConflicto)
      csvLines.push([op.vinoMagnum.id, esc(op.vinoMagnum.nombre), op.vinoBase.id, esc(op.vinoBase.nombre),
        op.vinoBase.bodega_id, va.id, va.anada ?? '', va.formato_ml, 'conflicto_skip'].join(','))
  }
  fs.writeFileSync(backupPath, csvLines.join('\n'), 'utf8')
  console.log(`\nBackup: ${backupPath}`)

  // ── 8. Aplicar ────────────────────────────────────────────────────────────
  let reparentados  = 0
  let dedupBorrados = 0
  let vinosBorrados = 0
  let errores       = 0

  for (const op of ops) {
    // 8a. Re-parentar vino_anada uno por uno (nunca cambia vino_anada.id)
    for (const va of op.vasMover) {
      const { error } = await sb.from('vino_anada')
        .update({ vino_id: op.vinoBase.id })
        .eq('id', va.id)
      if (error) {
        console.error(`  ERR reparentar vino_anada ${va.id}: ${error.message}`)
        errores++
        continue
      }
      reparentados++
    }

    // 8b. Borrar dedup_candidato del par (sin crear dedup_decision)
    for (const dId of op.dedupIds) {
      const { error } = await sb.from('dedup_candidato').delete().eq('id', dId)
      if (error) {
        console.error(`  ERR dedup_candidato delete ${dId}: ${error.message}`)
        errores++
        continue
      }
      dedupBorrados++
    }

    // 8c. Verificar que no queda ningún vino_anada apuntando a vinoMagnum
    const { count, error: cErr } = await sb
      .from('vino_anada')
      .select('*', { count: 'exact', head: true })
      .eq('vino_id', op.vinoMagnum.id)

    if (cErr) {
      console.error(`  ERR verificar vino_anada de ${op.vinoMagnum.id}: ${cErr.message}`)
      errores++
      continue
    }
    if (count > 0) {
      console.log(`  SKIP borrar "${op.vinoMagnum.nombre}" (${op.vinoMagnum.id}): quedan ${count} vino_anada`)
      continue
    }

    // 8d. Borrar vino_magnum — id concreto, nunca en bloque
    const { error: delErr } = await sb.from('vino')
      .delete()
      .eq('id', op.vinoMagnum.id)
    if (delErr) {
      console.error(`  ERR borrar vino ${op.vinoMagnum.id}: ${delErr.message}`)
      errores++
      continue
    }
    vinosBorrados++
  }

  // ── 9. Resultado final ────────────────────────────────────────────────────
  console.log(`\n${SEP}`)
  console.log('RESULTADO APPLY')
  console.log(`  vino_anada re-parentadas:  ${reparentados}`)
  console.log(`  dedup_candidato borrados:  ${dedupBorrados}`)
  console.log(`  vino borrados:             ${vinosBorrados}`)
  if (errores > 0) console.log(`  ⚠ ERRORES:                 ${errores}`)
  console.log(SEP + '\n')
}

main().catch(e => { console.error(e.message || e); process.exit(1) })
