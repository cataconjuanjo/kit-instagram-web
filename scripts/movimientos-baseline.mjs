/**
 * Línea base de métricas de movimientos — B1 pre/post migración
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MODOS DE USO
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   # Paso (a): genera baseline con lógica ORIGINAL (pre-B1, commit c69c5d80)
 *   node --env-file=.env.local scripts/movimientos-baseline.mjs --legacy --yes
 *
 *   # Paso (c): calcula con lógica NUEVA y compara contra el baseline legacy
 *   node --env-file=.env.local scripts/movimientos-baseline.mjs --compare scripts/b1-baseline-XXXX.json --yes
 *
 *   # Paso (d): guarda el nuevo baseline con nota de migración
 *   node --env-file=.env.local scripts/movimientos-baseline.mjs --yes --note "post dual-mode, pre-migración; R4 Araboka +126 = compra ahora contada (corrección intencionada)"
 *
 *   # Verificar ventanas temporales (sin acceso a BD, no requiere --yes)
 *   node scripts/movimientos-baseline.mjs --test-windows
 *   node scripts/movimientos-baseline.mjs --test-windows --compare scripts/b1-baseline-XXXX.json
 *
 *   # Verificar lógica de aceptación de divergencias (sin acceso a BD, no requiere --yes)
 *   node scripts/movimientos-baseline.mjs --test-compare
 *
 * ─────────────────────────────────────────────────────────────────────────
 * VENTANAS TEMPORALES
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   R1, R2: created_at ∈ [inicio_mes_ref .. ref_now]
 *   R3, R4, R5: created_at ∈ [ref_now - 30d .. ref_now]
 *
 *   ref_now = en modo --compare: prev.generated_at
 *             en modo normal:    fecha de ejecución actual
 *
 *   → En --compare TODAS las ventanas se calculan desde prev.generated_at,
 *     de modo que la actividad posterior no genera divergencias falsas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MAPEO DE MÉTRICAS (nombre JSON ↔ nombre en el motor)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   JSON key              Motor (consultoriaFase1Engine.js)  UI (SommStockSection.js)
 *   pmp.vinos_con_pmp     calcularPmpVino                    "PMP" en tarjeta
 *   r2_salidasMes         —                                  "Salidas este mes"
 *   r3_mermaUnidades      mermaUnidades / ajustesNegativos   merma_unidades (output)
 *   r4_entradasUnidades   entradasUnidades                   —
 *   r5_salidasUnidades    salidasUnidades                    salidas_unidades (output)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LÓGICA LEGACY vs NUEVA
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   Lógica LEGACY (--legacy, commit c69c5d80):
 *     R1/R4 esEntrada:  tipo === 'entrada'
 *     R2 esSalida:      tipo !== 'entrada'
 *     R3 TIPOS_R3:      ['merma','ajuste','cata','invitacion']
 *     R5 TIPOS_R5:      ['venta','merma','ajuste','cata','invitacion']
 *
 *   Lógica NUEVA (por defecto, dual-mode):
 *     R1/R4 esEntrada:  tipo ∈ {compra, entrada}
 *     R2 esSalida:      tipo ∉ {compra, entrada, devolucion}
 *     R3 TIPOS_R3:      +rotura, +invitacion_botella, +invitacion_copa
 *     R5 TIPOS_R5:      +venta_botella, +venta_copa, +rotura,
 *                        +invitacion_botella, +invitacion_copa
 *
 *   Divergencias esperadas entre legacy y nueva con datos actuales de prod:
 *     · R3/R5 +5 uds en restaurante a4346301… (4 filas rotura preexistentes,
 *       SI su created_at cae en la ventana 30d de prev.generated_at)
 *     · Cualquier otra diferencia → PARA antes de continuar
 */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// ── Vocabularios ──────────────────────────────────────────────────────────────

// LEGACY — commit c69c5d80, SommStockSection.js:70,168 y consultoriaFase1Engine.js:613-616
const VOCAB_LEGACY = {
  label:        'legacy (c69c5d80)',
  esEntrada:    t => t === 'entrada',
  esSalida:     t => t !== 'entrada',
  TIPOS_R3:     new Set(['merma', 'ajuste', 'cata', 'invitacion']),
  TIPOS_R5:     new Set(['venta', 'merma', 'ajuste', 'cata', 'invitacion']),
}

// DUAL MODE — app/lib/movimientosTipos.js + consultoriaFase1Engine.js (modificado B1)
const VOCAB_DUAL = {
  label:        'dual-mode (B1)',
  esEntrada:    t => t === 'compra' || t === 'entrada',
  esSalida:     t => !(t === 'compra' || t === 'entrada') && t !== 'devolucion',
  TIPOS_R3:     new Set(['merma', 'rotura', 'ajuste', 'cata', 'invitacion', 'invitacion_botella', 'invitacion_copa']),
  TIPOS_R5:     new Set(['venta', 'venta_botella', 'venta_copa', 'merma', 'rotura', 'ajuste', 'cata', 'invitacion', 'invitacion_botella', 'invitacion_copa']),
}

// ── PMP (réplica de calcularPmpVino en SommStockSection.js) ───────────────────

function calcularPmpVino(vino, movs, vocab) {
  const movVino       = movs.filter(m => m.vino_id === vino.id && vocab.esEntrada(m.tipo))
  const entradasCoste = movVino.reduce((sum, m) => {
    const cu = m.coste_medio_ponderado || vino.coste_compra || 0
    return sum + m.cantidad * cu
  }, 0)
  const entradasUds    = movVino.reduce((sum, m) => sum + m.cantidad, 0)
  const stockInicial   = Math.max(0, (vino.stock || 0) - entradasUds)
  const stockInicValor = stockInicial * (vino.coste_compra || 0)
  const totalValor     = stockInicValor + entradasCoste
  const totalUds       = vino.stock || 0
  return totalUds > 0 ? Math.round((totalValor / totalUds) * 10000) / 10000 : 0
}

// ── Cálculo de ventanas ───────────────────────────────────────────────────────
// Siempre relativo a refNow para que --compare sea reproducible.

function calcularVentanas(refNow) {
  const inicioMes = new Date(refNow.getFullYear(), refNow.getMonth(), 1)
  const hace30d   = new Date(refNow.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { inicioMes, hace30d }
}

// ── Test de bordes de ventana (sin BD) ────────────────────────────────────────
// Verifica que los límites de cada ventana incluyen/excluyen correctamente
// un movimiento justo en el borde (+/- 1 ms).

function testWindowBorders(refNow, queryCutoff) {
  const { inicioMes, hace30d } = calcularVentanas(refNow)
  const cutoff = queryCutoff ? new Date(queryCutoff) : null

  console.log('\n── Test de bordes de ventana ────────────────────────────')
  console.log(`ref_now:     ${refNow.toISOString()}`)
  console.log(`inicioMes:   ${inicioMes.toISOString()}`)
  console.log(`hace30d:     ${hace30d.toISOString()}`)
  console.log(`cutoff:      ${cutoff ? cutoff.toISOString() : '(sin cota superior)'}`)
  console.log()

  const estaEnMes = ts => ts >= inicioMes && (!cutoff || ts <= cutoff)
  const estaEn30d = ts => ts >= hace30d   && (!cutoff || ts <= cutoff)

  const casos = [
    // [timestamp, ventana, esperado, descripción]
    [new Date(inicioMes.getTime() - 1), 'mes', false, 'inicio_mes - 1ms → fuera del mes'],
    [new Date(inicioMes.getTime()),     'mes', true,  'inicio_mes exacto → dentro del mes'],
    [new Date(hace30d.getTime() - 1),   '30d', false, 'hace30d - 1ms → fuera de 30d'],
    [new Date(hace30d.getTime()),        '30d', true,  'hace30d exacto → dentro de 30d'],
    ...(cutoff ? [
      [new Date(cutoff.getTime()),     'mes', true,  'cutoff exacto → incluido (lte)'],
      [new Date(cutoff.getTime() + 1), 'mes', false, 'cutoff + 1ms → excluido (posterior al baseline)'],
    ] : []),
  ]

  let ok = 0; let fail = 0
  for (const [ts, ventana, esperado, desc] of casos) {
    const actual = ventana === 'mes' ? estaEnMes(ts) : estaEn30d(ts)
    const pass   = actual === esperado
    console.log(`  ${pass ? '✓' : '✗'} ${desc}`)
    pass ? ok++ : fail++
  }

  console.log(`\n  ${ok} ok, ${fail} fallidos`)
  if (fail > 0) {
    console.error('  ERROR: lógica de ventanas incorrecta')
    process.exit(1)
  }
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const isLegacy      = process.argv.includes('--legacy')
const isTestWindows = process.argv.includes('--test-windows')
const compareIdx    = process.argv.indexOf('--compare')
const compareFile   = compareIdx >= 0 ? process.argv[compareIdx + 1] : null
const noteIdx       = process.argv.indexOf('--note')
const noteText      = noteIdx >= 0 ? process.argv[noteIdx + 1] : null

// En --compare siempre se usa la lógica NUEVA, aunque el baseline sea legacy.
// El --legacy y --compare son mutuamente excluyentes.
if (isLegacy && compareFile) {
  console.error('ERROR: --legacy y --compare son mutuamente excluyentes.')
  console.error('  --legacy genera un baseline con lógica original.')
  console.error('  --compare siempre calcula con lógica nueva y compara contra el baseline.')
  process.exit(1)
}

const vocab = isLegacy ? VOCAB_LEGACY : VOCAB_DUAL

// ── Cargar baseline previo si --compare ──────────────────────────────────────

let prev        = null
let queryCutoff = null   // null = sin cota superior

if (compareFile) {
  if (!existsSync(compareFile)) {
    console.error(`ERROR: no existe el archivo ${compareFile}`)
    process.exit(1)
  }
  prev        = JSON.parse(readFileSync(compareFile, 'utf8'))
  queryCutoff = prev.generated_at
}

// ── Calcular ventanas temporales ──────────────────────────────────────────────
// ref_now = generated_at del baseline en --compare, o ahora en generación normal.

const ahora   = new Date()
const refNow  = queryCutoff ? new Date(queryCutoff) : ahora
const { inicioMes, hace30d } = calcularVentanas(refNow)

// ── Modo --test-windows: ejecutar solo el test y salir ────────────────────────

if (isTestWindows) {
  testWindowBorders(refNow, queryCutoff)
  process.exit(0)
}

// ── Divergencias esperadas y lógica de aceptación ────────────────────────────
// Definidas aquí (antes del credential check) porque --test-compare las necesita
// sin acceso a BD.
//
// Clave: { [restaurante_id]: { [campo]: { delta, motivo } } }
// delta puede ser un número exacto o un array de números aceptables.
//
const EXPECTED_DIVERGENCES = {
  // Araboka: R4 legacy contaba solo 'entrada', dual cuenta 'compra'+'entrada'.
  // Los seeds de demo usan 'compra', que el código antiguo ignoraba.
  '7af94e33-48cd-43b8-b939-4796ba58e4d8': {
    r4_entradasUnidades: { delta: [126], motivo: "R4 Araboka: 'compra' ahora contada por esEntrada — corrección intencionada (datos demo)" },
  },
  // La Taberna del Puerto: 4 filas de rotura preexistentes (5 uds).
  // Solo divergen si su created_at cae en la ventana 30d del baseline (hoy no caen).
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66': {
    r3_mermaUnidades:   { delta: [5], motivo: 'rotura preexistente (4f/5u) ahora contada por TIPOS_R3 (si cae en ventana 30d)' },
    r5_salidasUnidades: { delta: [5], motivo: 'rotura preexistente (4f/5u) ahora contada por TIPOS_R5 (si cae en ventana 30d)' },
  },
}

// Devuelve 'ok' | 'accepted' | 'fail' para un delta dado
function checkDivergence(restId, campo, delta) {
  if (delta === 0) return 'ok'
  const exp = EXPECTED_DIVERGENCES[restId]?.[campo]
  if (exp && exp.delta.includes(delta)) return 'accepted'
  return 'fail'
}

// ── Modo --test-compare: ejecutar solo los tests de checkDivergence y salir ──

if (process.argv.includes('--test-compare')) {
  console.log('\n── Test de lógica de comparación ───────────────────────────')
  let pass = 0; let fail = 0
  const assert = (cond, desc) => { console.log(`  ${cond ? '✓' : '✗'} ${desc}`); cond ? pass++ : fail++ }

  const ID_ARABOKA  = '7af94e33-48cd-43b8-b939-4796ba58e4d8'
  const ID_TABERNA  = 'a4346301-4dc5-4cb5-a2f5-3ca6469acd66'
  const ID_OTRO     = 'ffffffff-0000-0000-0000-000000000000'

  assert(checkDivergence(ID_ARABOKA, 'r4_entradasUnidades', 126) === 'accepted', 'Araboka R4 +126 → aceptado')
  assert(checkDivergence(ID_ARABOKA, 'r4_entradasUnidades', 127) === 'fail',     'Araboka R4 +127 → fallo (delta incorrecto)')
  assert(checkDivergence(ID_ARABOKA, 'r4_entradasUnidades',   0) === 'ok',       'Araboka R4  +0  → ok (sin diferencia)')
  assert(checkDivergence(ID_ARABOKA, 'r2_salidasMes',         5) === 'fail',     'Araboka R2 cualquier delta → fallo (campo no esperado)')
  assert(checkDivergence(ID_TABERNA, 'r3_mermaUnidades',      5) === 'accepted', 'Taberna R3 +5 → aceptado')
  assert(checkDivergence(ID_TABERNA, 'r5_salidasUnidades',    5) === 'accepted', 'Taberna R5 +5 → aceptado')
  assert(checkDivergence(ID_TABERNA, 'r3_mermaUnidades',      3) === 'fail',     'Taberna R3 +3 → fallo (delta incorrecto)')
  assert(checkDivergence(ID_TABERNA, 'r3_mermaUnidades',      0) === 'ok',       'Taberna R3  +0 → ok (rotura fuera de ventana 30d)')
  assert(checkDivergence(ID_OTRO,    'r4_entradasUnidades', 126) === 'fail',     'Otro restaurante R4 +126 → fallo (no esperado)')
  assert(checkDivergence(ID_OTRO,    'r2_salidasMes',         0) === 'ok',       'Cualquier restaurante campo 0 → ok')

  console.log(`\n  ${pass} ok, ${fail} fallidos`)
  if (fail > 0) { console.error('  ERROR en lógica de comparación'); process.exit(1) }
  process.exit(0)
}

// ── Validar credenciales ──────────────────────────────────────────────────────

const supabaseUrl    = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

// ── Seguridad: confirmar proyecto Supabase ────────────────────────────────────
// Imprime el host antes de cualquier operación. Requiere --yes para continuar.
const supabaseHost = new URL(supabaseUrl).hostname   // p. ej. abcxyz.supabase.co

console.log('\n⚠  PROYECTO SUPABASE DETECTADO:')
console.log(`   ${supabaseHost}`)
console.log('   Asegúrate de que este es el entorno correcto antes de continuar.\n')

if (!process.argv.includes('--yes')) {
  console.error('ERROR: Añade --yes para confirmar que el proyecto es correcto.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Cabecera ──────────────────────────────────────────────────────────────────

console.log('══════════════════════════════════════════════════════')
console.log(' B1 — Línea base de métricas de movimientos')
console.log('══════════════════════════════════════════════════════')
console.log(`Modo:        ${vocab.label}`)
console.log(`Proyecto:    ${supabaseHost}`)
console.log(`Ejecutado:   ${ahora.toISOString()}`)
console.log(`ref_now:     ${refNow.toISOString()}${queryCutoff ? '  (= generated_at del baseline)' : '  (= ahora)'}`)
console.log(`Ventana mes: [${inicioMes.toISOString()}  ..  ${refNow.toISOString()}]`)
console.log(`Ventana 30d: [${hace30d.toISOString()}  ..  ${refNow.toISOString()}]`)
if (noteText)     console.log(`Nota:        ${noteText}`)
console.log()

// ── Restaurantes activos ──────────────────────────────────────────────────────

const { data: restaurantes, error: errRest } = await supabase
  .from('restaurantes')
  .select('id, nombre')
  .order('nombre')

if (errRest) { console.error('ERROR restaurantes:', errRest.message); process.exit(1) }

const resultado = {
  generated_at:  ahora.toISOString(),
  vocab_mode:    vocab.label,
  inicioMes:     inicioMes.toISOString(),
  hace30d:       hace30d.toISOString(),
  ...(queryCutoff ? { compare_mode_cutoff: queryCutoff } : {}),
  ...(noteText    ? { migration_notes: [noteText] }      : {}),
  restaurantes:  {},
}

// ── Bucle por restaurante ─────────────────────────────────────────────────────

for (const rest of restaurantes) {
  console.log(`── ${rest.nombre} (${rest.id})`)

  // Vinos activos
  const { data: vinos } = await supabase
    .from('vinos')
    .select('id, nombre, stock, coste_compra')
    .eq('restaurante_id', rest.id)
    .eq('activo', true)

  // Movimientos del mes → R1, R2
  let qMes = supabase
    .from('movimientos_stock')
    .select('id, vino_id, tipo, cantidad, coste_medio_ponderado, created_at')
    .eq('restaurante_id', rest.id)
    .gte('created_at', inicioMes.toISOString())
  if (queryCutoff) qMes = qMes.lte('created_at', queryCutoff)
  const { data: movsMes } = await qMes.order('created_at')

  // Movimientos últimos 30d → R3, R4, R5
  let q30d = supabase
    .from('movimientos_stock')
    .select('id, vino_id, tipo, cantidad, created_at')
    .eq('restaurante_id', rest.id)
    .gte('created_at', hace30d.toISOString())
  if (queryCutoff) q30d = q30d.lte('created_at', queryCutoff)
  const { data: movs30d } = await q30d.order('created_at')

  const vs   = vinos   || []
  const mMes = movsMes || []
  const m30d = movs30d || []

  // R1: PMP por vino (del mes) — réplica de SommStockSection.js calcularPmpVino
  const pmpPorVino = {}
  for (const v of vs) pmpPorVino[v.id] = calcularPmpVino(v, mMes, vocab)
  const pmpResumen = {
    vinos_con_pmp: Object.values(pmpPorVino).filter(p => p > 0).length,
    pmp_total_uds: Object.values(pmpPorVino).reduce((s, p) => s + p, 0),
    detalle:       vs.map(v => ({ id: v.id, nombre: v.nombre, pmp: pmpPorVino[v.id] })),
  }

  // R2: salidas del mes — réplica de SommStockSection.js "Salidas este mes"
  const r2_salidasMes = mMes.filter(m => vocab.esSalida(m.tipo)).length

  // R3: ajustes negativos 30d — réplica de consultoriaFase1Engine.js ajustesNegativos/mermaUnidades
  const r3_mermaUnidades = Math.abs(
    m30d
      .filter(m => vocab.TIPOS_R3.has(m.tipo) && (m.cantidad || 0) < 0)
      .reduce((s, m) => s + (m.cantidad || 0), 0)
  )

  // R4: entradas 30d — réplica de consultoriaFase1Engine.js entradasUnidades
  const r4_entradasUnidades = m30d
    .filter(m => vocab.esEntrada(m.tipo))
    .reduce((s, m) => s + Math.max(0, m.cantidad || 0), 0)

  // R5: salidas 30d — réplica de consultoriaFase1Engine.js salidasUnidades
  const r5_salidasUnidades = m30d
    .filter(m => vocab.TIPOS_R5.has(m.tipo))
    .reduce((s, m) => s + Math.abs(Math.min(0, m.cantidad || 0)), 0)

  // Diagnóstico
  const conteoTipos = {}
  for (const m of m30d) conteoTipos[m.tipo] = (conteoTipos[m.tipo] || 0) + 1

  const legacy = Object.keys(conteoTipos).filter(t =>
    ['entrada', 'venta', 'merma', 'invitacion'].includes(t)
  )

  resultado.restaurantes[rest.id] = {
    id:                   rest.id,
    nombre:               rest.nombre,
    pmp:                  pmpResumen,
    r2_salidasMes,
    r3_mermaUnidades,
    r4_entradasUnidades,
    r5_salidasUnidades,
    conteoTipos,
    legacyPresentes:      legacy,
    totalMovsMes:         mMes.length,
    totalMovs30d:         m30d.length,
  }

  console.log(`  Vinos activos:           ${vs.length}`)
  console.log(`  Movs mes:                ${mMes.length}`)
  console.log(`  Movs 30d:                ${m30d.length}`)
  console.log(`  R1 vinos con PMP > 0:    ${pmpResumen.vinos_con_pmp}`)
  console.log(`  R2 r2_salidasMes:        ${r2_salidasMes}`)
  console.log(`  R3 r3_mermaUnidades:     ${r3_mermaUnidades}   (≡ ajustesNegativos/mermaUnidades en engine)`)
  console.log(`  R4 r4_entradasUnidades:  ${r4_entradasUnidades}`)
  console.log(`  R5 r5_salidasUnidades:   ${r5_salidasUnidades}   (≡ salidasUnidades en engine)`)
  if (legacy.length) {
    console.log(`  ⚠  Legacy presentes: ${legacy.join(', ')} — backfill pendiente`)
  } else {
    console.log(`  ✓  Sin tipos legacy`)
  }
  console.log(`  Tipos: ${Object.keys(conteoTipos).sort().join(', ')}`)
  console.log()
}

// ── Guardar resultado ─────────────────────────────────────────────────────────

const ts      = ahora.toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outFile = join(import.meta.dirname, `b1-baseline-${ts}.json`)
writeFileSync(outFile, JSON.stringify(resultado, null, 2))
console.log(`✓ Guardado: ${outFile}`)
if (noteText) console.log(`  Nota: ${noteText}`)

// ── Comparar con baseline anterior ───────────────────────────────────────────

if (prev) {
  const prevMode = prev.vocab_mode ?? '(sin registro de modo — asumir legacy)'
  console.log(`\nComparando (${vocab.label}) contra baseline (${prevMode})`)
  console.log(`  Baseline generado: ${prev.generated_at}`)
  console.log(`  Ventanas ancladas a generated_at del baseline:`)
  console.log(`    Mes:  [${inicioMes.toISOString()}  ..  ${refNow.toISOString()}]`)
  console.log(`    30d:  [${hace30d.toISOString()}  ..  ${refNow.toISOString()}]`)
  console.log(`  Movimientos con created_at <= ${queryCutoff}`)
  console.log()

  let aceptadas = 0
  let diferencias = 0

  for (const [restId, actual] of Object.entries(resultado.restaurantes)) {
    const anterior = prev.restaurantes?.[restId]
    if (!anterior) {
      console.log(`  [NUEVO] ${actual.nombre} no estaba en el baseline anterior`)
      continue
    }

    const campos = ['r2_salidasMes', 'r3_mermaUnidades', 'r4_entradasUnidades', 'r5_salidasUnidades']
    for (const campo of campos) {
      const delta  = actual[campo] - anterior[campo]
      const estado = checkDivergence(restId, campo, delta)
      const signo  = delta > 0 ? '+' : ''

      if (estado === 'accepted') {
        const motivo = EXPECTED_DIVERGENCES[restId][campo].motivo
        console.log(`  ✓ (aceptado) ${actual.nombre} · ${campo}: ${anterior[campo]} → ${actual[campo]} (delta=${signo}${delta})`)
        console.log(`              ${motivo}`)
        aceptadas++
      } else if (estado === 'fail') {
        console.error(`  ✗ ${actual.nombre} · ${campo}: ${anterior[campo]} → ${actual[campo]} (delta=${signo}${delta})`)
        diferencias++
      }
    }

    // R1: PMP
    const deltaPmp = actual.pmp.vinos_con_pmp - anterior.pmp.vinos_con_pmp
    if (deltaPmp !== 0) {
      console.error(`  ✗ ${actual.nombre} · pmp.vinos_con_pmp: ${anterior.pmp.vinos_con_pmp} → ${actual.pmp.vinos_con_pmp} (delta=${deltaPmp > 0 ? '+' : ''}${deltaPmp})`)
      diferencias++
    }
  }

  console.log()
  if (diferencias === 0) {
    if (aceptadas > 0) console.log(`  ✓ ${aceptadas} divergencia(s) esperada(s) aceptada(s) — ver motivos arriba`)
    console.log('  ✓ Sin diferencias inesperadas')
  } else {
    console.error(`  ✗ ${diferencias} diferencia(s) inesperada(s) — PARA antes de continuar`)
    process.exit(1)
  }
}
