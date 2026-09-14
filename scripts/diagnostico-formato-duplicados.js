'use strict'
// scripts/diagnostico-formato-duplicados.js
// SOLO LECTURA — cero escrituras en BD.
//
// Cuantifica el bug de formato embebido en el nombre del vino,
// generalizado a TODOS los FORMAT_WORDS (no solo magnum).
//
// Uso:
//   node scripts/diagnostico-formato-duplicados.js

const fs = require('fs')
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

async function fetchAll(sb, table, select, extra) {
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

// ── Utilidades copiadas literalmente de insertar-candidatos-formato.js ────────

function normTexto(v) {
  if (!v) return ''
  return v
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Palabras de formato que el script de build NO elimina del nombre (deuda bloque 9)
const FORMAT_WORDS = [
  'doble magnum', 'double magnum', 'media botella', 'half bottle',
  'matusalem', 'methuselah', 'balthazar', 'salmanazar', 'rehoboam',
  'jeroboam', 'imperial', 'magnum',
]

function tieneFormatoEmbebido(normNombre) {
  return FORMAT_WORDS.some(fw => normNombre.includes(fw))
}

function quitarFormato(normNombre) {
  let s = normNombre
  // Orden importante: primero los compuestos (doble magnum antes que magnum)
  for (const fw of FORMAT_WORDS) s = s.replace(fw, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const env = loadEnv()
  const sb  = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } })

  const SEP  = '═'.repeat(62)
  const SEP2 = '─'.repeat(62)

  // ── 1. Cargar todos los vinos ─────────────────────────────────────────────
  console.log('Cargando vinos (paginado)…')
  const vinos = await fetchAll(sb, 'vino', 'id, nombre, bodega_id')
  console.log(`  ${vinos.length} vinos cargados\n`)

  // ── 2. Separar conFormato / sinFormatoPorBodega ───────────────────────────
  const conFormato          = []
  const sinFormatoPorBodega = new Map()

  for (const v of vinos) {
    if (!v.bodega_id) continue
    const _norm = normTexto(v.nombre)
    if (tieneFormatoEmbebido(_norm)) {
      conFormato.push({ ...v, _norm })
    } else {
      if (!sinFormatoPorBodega.has(v.bodega_id)) sinFormatoPorBodega.set(v.bodega_id, [])
      sinFormatoPorBodega.get(v.bodega_id).push({ ...v, _norm })
    }
  }

  const totalSinFmt = [...sinFormatoPorBodega.values()].reduce((s, a) => s + a.length, 0)
  console.log(`  Vinos con formato embebido: ${conFormato.length}`)
  console.log(`  Vinos sin formato (con bodega): ${totalSinFmt}\n`)

  // ── 3. Identificar pares (coincidencia exacta dentro de la misma bodega) ──
  // La condición es: sinFormato._norm === quitarFormato(conFormato._norm)
  const pares = []

  for (const vm of conFormato) {
    const candidatos = sinFormatoPorBodega.get(vm.bodega_id) || []
    const normSinFmt = quitarFormato(vm._norm)
    const base       = candidatos.find(v => v._norm === normSinFmt)
    if (!base) continue

    // El primer FORMAT_WORD que aparece en el nombre (compuestos antes que simples)
    const formatoDetectado = FORMAT_WORDS.find(fw => vm._norm.includes(fw)) || '?'
    pares.push({ vinoConFormato: vm, vinoBase: base, formatoDetectado })
  }

  // ── 4.a Resumen general ───────────────────────────────────────────────────
  const bodegasAfectadas = new Set(pares.map(p => p.vinoBase.bodega_id))

  console.log(SEP)
  console.log('RESUMEN GENERAL')
  console.log(`  Total pares encontrados:     ${pares.length}`)
  console.log(`  Bodegas distintas afectadas: ${bodegasAfectadas.size}`)
  console.log(SEP)

  if (pares.length === 0) {
    console.log('\nSin pares. Nada que analizar.')
    return
  }

  // ── 4.b Desglose por palabra de formato ───────────────────────────────────
  const porFormato = new Map()
  for (const { formatoDetectado } of pares) {
    porFormato.set(formatoDetectado, (porFormato.get(formatoDetectado) || 0) + 1)
  }

  console.log('\nDESGLOSE POR PALABRA DE FORMATO')
  const sorted = [...porFormato.entries()].sort((a, b) => b[1] - a[1])
  for (const [fw, n] of sorted) {
    console.log(`  ${fw.padEnd(22)} ${n}`)
  }

  // Muestra de los primeros 10 pares
  console.log('\nMuestra (primeros 10 pares):')
  console.log(SEP2)
  for (const { vinoConFormato: vm, vinoBase: base, formatoDetectado: fw } of pares.slice(0, 10)) {
    console.log(`  [${fw}]`)
    console.log(`    CON: ${vm.nombre}`)
    console.log(`    SIN: ${base.nombre}`)
  }
  console.log(SEP2)

  // ── 5. Cargar vino_anada de todos los vinos implicados ────────────────────
  const vinoIds = [...new Set(pares.flatMap(p => [p.vinoConFormato.id, p.vinoBase.id]))]
  console.log(`\nCargando vino_anada para ${vinoIds.length} vinos…`)

  const todasVas = []
  for (let i = 0; i < vinoIds.length; i += 100) {
    const rows = await fetchAll(sb, 'vino_anada', 'id, vino_id, anada, formato_ml',
      q => q.in('vino_id', vinoIds.slice(i, i + 100)))
    todasVas.push(...rows)
  }
  const vaIds = todasVas.map(v => v.id)

  // ── 4.c Total vino_anada ──────────────────────────────────────────────────
  console.log(`  ${todasVas.length} vino_anada bajo los vinos implicados`)

  // ── 6. Cargar ofertas para esas vino_anada ────────────────────────────────
  // "Activa" = existe al menos una fila en oferta (la tabla no tiene columna de estado)
  console.log(`\nCargando ofertas para ${vaIds.length} vino_anada…`)
  const ofertas = []
  for (let i = 0; i < vaIds.length; i += 100) {
    const rows = await fetchAll(sb, 'oferta', 'id, vino_anada_id',
      q => q.in('vino_anada_id', vaIds.slice(i, i + 100)))
    ofertas.push(...rows)
  }
  const vaConOferta = new Set(ofertas.map(o => o.vino_anada_id))

  // ── 4.d vino_anada con oferta ─────────────────────────────────────────────
  console.log(`  ${vaConOferta.size} vino_anada tienen al menos una oferta`)

  // ── 7. Cargar entradas en cartas de restaurante (tabla vinos) ─────────────
  console.log(`\nCargando entradas de carta (tabla vinos)…`)
  const cartaLineas = []
  for (let i = 0; i < vaIds.length; i += 100) {
    const rows = await fetchAll(
      sb, 'vinos', 'id, nombre, restaurante_id, vino_anada_id',
      q => q.in('vino_anada_id', vaIds.slice(i, i + 100)).not('vino_anada_id', 'is', null),
    )
    cartaLineas.push(...rows)
  }

  // Deduplicar por id (puede aparecer en múltiples chunks si Supabase devuelve solapamientos)
  const cartaMap   = new Map(cartaLineas.map(cl => [cl.id, cl]))
  const cartaDedup = [...cartaMap.values()]

  // ── 4.e Listado completo de cartas afectadas ──────────────────────────────
  console.log(SEP)
  console.log('RESUMEN FINAL')
  console.log(`  Total pares (vino con formato ↔ vino base):  ${pares.length}`)
  console.log(`  Bodegas distintas:                           ${bodegasAfectadas.size}`)
  console.log(`  vino_anada bajo vinos implicados:            ${todasVas.length}`)
  console.log(`  vino_anada con al menos una oferta:          ${vaConOferta.size}`)
  console.log(`  Entradas de carta afectadas (tabla vinos):   ${cartaDedup.length}`)
  console.log(SEP)

  if (cartaDedup.length > 0) {
    console.log('\nLISTADO COMPLETO — entradas de carta (tabla vinos):')
    const W1 = 44, W2 = 38
    console.log(
      'nombre_en_carta'.padEnd(W1) + ' ' +
      'restaurante_id'.padEnd(W2) + ' ' +
      'vino_anada_id',
    )
    console.log('-'.repeat(W1 + 1 + W2 + 1 + 36))
    for (const cl of cartaDedup) {
      const nombre = (cl.nombre || '(sin nombre)').substring(0, W1 - 1)
      console.log(
        nombre.padEnd(W1) + ' ' +
        (cl.restaurante_id || '(null)').padEnd(W2) + ' ' +
        cl.vino_anada_id,
      )
    }
  } else {
    console.log('\nNinguna de las vino_anada implicadas aparece en cartas de restaurante.')
  }

  console.log(`\n${SEP}`)
  console.log('FIN DIAGNÓSTICO — cero escrituras realizadas en BD')
  console.log(SEP)
}

main().catch(e => { console.error(e); process.exit(1) })
