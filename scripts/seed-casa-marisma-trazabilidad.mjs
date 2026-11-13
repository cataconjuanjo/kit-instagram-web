/**
 * Enriquecer la trazabilidad de ventas en Casa Marisma:
 *   - Marcar un subconjunto como "fuente TPV" (detalle.fuente='tpv' +
 *     pos_import_batch_id='demo-YYYYMM').
 *   - Atribuir un subconjunto a una recomendación (detalle.recommendation_id).
 *   - Insertar filas tipo='sommelier' con esos recommendation_id para que
 *     queden "trazadas". Un ~25 % extra sin feedback quedan "abiertas".
 *
 * Objetivos (medidos en UNIDADES, no en filas):
 *   - Fuente TPV:       ≈ 60 %   (grupos vino+día completos → el
 *                                  priorizador NO deduplica KPI).
 *   - Ventas atribuidas:≈ 40 %   (tope 45 %). Boost en los 3 vinos
 *                                  "Empujar hoy" del briefing.
 *   - Rec. cerradas:    ≈ 75 % de las trazadas.
 *   - Fiabilidad global simulada: 70–75 %.
 *
 * Determinista (hash FNV-1a), idempotente, dry-run por defecto.
 * NO modifica importe_vino_estimado, cantidad, created_at, vino_id,
 * resultado, formato_venta ni precio_unidad. Solo añade claves nuevas al
 * JSON (merge). Nuevas filas tipo='sommelier' llevan un created_at
 * calculado 5 minutos antes de la primera venta del grupo.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-casa-marisma-trazabilidad.mjs           # dry-run
 *   node --env-file=.env.local scripts/seed-casa-marisma-trazabilidad.mjs --apply   # escribe
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const TARGET_ID      = '65d26545-7c7e-424c-9c29-33bfe8bbaafa'
const TARGET_NAME_LC = 'casa marisma'
const UUID_DENYLIST = new Set([
  'db3af496-00f1-4295-82b6-35427b9b6286',
  '7af94e33-48cd-43b8-b939-4796ba58e4d8',
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66',
  '6b528438-3d24-432d-9728-dc2ff868baf6',
])
if (UUID_DENYLIST.has(TARGET_ID)) { console.error('ERROR denylist'); process.exit(1) }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.')
  console.error('Lanza con: node --env-file=.env.local scripts/seed-casa-marisma-trazabilidad.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

// ── Parámetros de objetivos ─────────────────────────────────────────────────
const PCT_TPV_GRUPOS         = 0.60   // aplica al GRUPO (vino_id,fechaMadrid)
const PCT_ATRIBUIR_BASE      = 0.40   // decisión por GRUPO (vino_id,fecha,turno)
const PCT_ATRIBUIR_BOOST     = 0.65   // vinos target del "Empujar hoy"
const TOPE_ATRIBUIDAS_PCT    = 0.45   // tope duro en unidades
const PCT_CERRADAS_DESEADO   = 0.75   // cerradas / trazadas (añade "pendientes")
const TURNO_CORTE_HORA       = 17     // Madrid; <17 mediodía, ≥17 noche
const BATCH_PREFIX           = 'demo-'

// Nombres de los 3 vinos "Empujar hoy" del briefing.
const NOMBRES_BOOST = [
  'viña bujanda joven',
  'finca antigua cza. tempranillo',
  'piedemonte crianza cabernet',
]

// ── Utilidades ──────────────────────────────────────────────────────────────
const r2 = n => Math.round(Number(n) * 100) / 100
function parseDet(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h
}
// Devuelve [0,1) determinista.
function rand01(key) { return (fnv1a(key) % 10000) / 10000 }
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
function partsMadrid(iso) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const g = t => p.find(x => x.type === t)?.value
  return { y: g('year'), m: g('month'), d: g('day'), h: Number(g('hour')) }
}
function fechaMadrid(iso) { const p = partsMadrid(iso); return `${p.y}-${p.m}-${p.d}` }
function turnoMadrid(iso) { return partsMadrid(iso).h < TURNO_CORTE_HORA ? 'mediodia' : 'noche' }
function yyyymm(iso)      { const p = partsMadrid(iso); return `${p.y}${p.m}` }

// ── Carga vinos (para detectar los 3 target por nombre normalizado) ────────
const { data: vinos } = await supa
  .from('vinos').select('id, nombre, precio_copa, precio_botella')
  .eq('restaurante_id', TARGET_ID)
const BOOST_IDS = new Set(
  (vinos || [])
    .filter(v => NOMBRES_BOOST.some(n => norm(v.nombre).includes(n)))
    .map(v => v.id)
)

// ── Carga todas las ventas ─────────────────────────────────────────────────
async function cargarVentas() {
  const PAGE = 1000
  let offset = 0
  const out = []
  while (true) {
    const { data, error } = await supa
      .from('estadisticas')
      .select('id, created_at, detalle')
      .eq('restaurante_id', TARGET_ID)
      .eq('tipo', 'venta')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return out
}
const filas = await cargarVentas()

// Rechazamos las no-vendidas para el conteo de UNIDADES KPI, pero las de
// venta no-vendida se quedan como están (no las tocamos).
const vendidas = filas.map(f => ({
  id: f.id, created_at: f.created_at, det: parseDet(f.detalle),
})).filter(x => x.det.resultado === 'vendida')

const totalUnidades = vendidas.reduce((s, v) => s + Math.max(1, Number(v.det.cantidad) || 1), 0)

// ── 1) TPV: agrupar por (vino_id | fechaMadrid) y marcar ~60 % de GRUPOS ──
// Agrupar por grupo evita que salesPriority.js:82-104 marque las ventas no
// TPV como "omitidaPorTpv" cuando hay TPV del mismo vino el mismo día.
const grupoTPV = new Map()   // "vinoId|fecha" → { filas:[], unidades:0 }
for (const v of vendidas) {
  if (!v.det.vino_id) continue
  const key = `${v.det.vino_id}|${fechaMadrid(v.created_at)}`
  if (!grupoTPV.has(key)) grupoTPV.set(key, { filas: [], unidades: 0 })
  const g = grupoTPV.get(key)
  g.filas.push(v)
  g.unidades += Math.max(1, Number(v.det.cantidad) || 1)
}
const decisionTPV = new Map()  // key → true/false
for (const [key, g] of grupoTPV) {
  const yaTpv = g.filas.every(v => v.det.fuente === 'tpv')
  // Idempotencia: si ya todas son TPV, mantener.
  if (yaTpv) { decisionTPV.set(key, true); continue }
  decisionTPV.set(key, rand01(`tpv:${key}`) < PCT_TPV_GRUPOS)
}

// ── 2) Atribución: agrupar por (vino_id|fecha|turno) y decidir ────────────
const grupoATR = new Map()   // "vinoId|fecha|turno" → { filas:[], unidades:0, vinoId, fecha, turno }
for (const v of vendidas) {
  if (!v.det.vino_id) continue
  const fecha = fechaMadrid(v.created_at)
  const turno = turnoMadrid(v.created_at)
  const key = `${v.det.vino_id}|${fecha}|${turno}`
  if (!grupoATR.has(key)) grupoATR.set(key, { filas: [], unidades: 0, vinoId: v.det.vino_id, fecha, turno })
  const g = grupoATR.get(key)
  g.filas.push(v)
  g.unidades += Math.max(1, Number(v.det.cantidad) || 1)
}
// Orden estable: primero los grupos de vinos "boost" para que el sesgo
// hacia esos 3 vinos no se pierda al golpear el tope duro. Dentro de
// cada bloque, hash estable para reproducibilidad.
const gruposAtrOrd = [...grupoATR.entries()]
  .map(([k, g]) => ({ key: k, g, score: rand01(`atr:${k}`), boost: BOOST_IDS.has(g.vinoId) }))
  .sort((a, b) => (b.boost ? 1 : 0) - (a.boost ? 1 : 0) || a.score - b.score)
// Para cada grupo, umbral depende del vino (boost o base).
let unidadesAtrib = 0
const limiteDuro = Math.floor(totalUnidades * TOPE_ATRIBUIDAS_PCT)
const atribuidos = new Set()
for (const { key, g, score } of gruposAtrOrd) {
  const esBoost = BOOST_IDS.has(g.vinoId)
  const umbral  = esBoost ? PCT_ATRIBUIR_BOOST : PCT_ATRIBUIR_BASE
  // Idempotencia: si TODAS las filas del grupo ya tienen recommendation_id,
  // lo contamos pero no tocamos.
  const yaAtrib = g.filas.every(v => typeof v.det.recommendation_id === 'string' && v.det.recommendation_id.length > 0)
  if (yaAtrib) { atribuidos.add(key); unidadesAtrib += g.unidades; continue }
  if (score < umbral && unidadesAtrib + g.unidades <= limiteDuro) {
    atribuidos.add(key)
    unidadesAtrib += g.unidades
  }
}

function recIdDe(vinoId, fecha, turno) {
  return `rec_demo_${vinoId}_${fecha}_${turno}`
}

// ── 3) Preparar updates de ventas y filas sommelier ────────────────────────
const ventaUpdates = []  // { id, newDetalle }
let cambiosTPV = 0, cambiosATR = 0

for (const v of vendidas) {
  const fecha = fechaMadrid(v.created_at)
  const turno = turnoMadrid(v.created_at)
  const keyTPV = v.det.vino_id ? `${v.det.vino_id}|${fecha}` : null
  const keyATR = v.det.vino_id ? `${v.det.vino_id}|${fecha}|${turno}` : null

  const quiereTPV = keyTPV && decisionTPV.get(keyTPV) === true
  const quiereATR = keyATR && atribuidos.has(keyATR)

  const newDet = { ...v.det }
  let tocado = false

  if (quiereTPV && v.det.fuente !== 'tpv') {
    newDet.fuente = 'tpv'
    newDet.pos_import_batch_id = `${BATCH_PREFIX}${yyyymm(v.created_at)}`
    cambiosTPV += 1
    tocado = true
  }
  if (quiereATR && !v.det.recommendation_id) {
    newDet.recommendation_id = recIdDe(v.det.vino_id, fecha, turno)
    cambiosATR += 1
    tocado = true
  }
  if (tocado) ventaUpdates.push({ id: v.id, newDetalle: newDet })
}

// ── 4) Filas tipo='sommelier' para trazabilidad ────────────────────────────
// Para cada grupo atribuido: una fila sommelier (rec cerrada automáticamente).
// Añadimos un ~25 % extra con recIds "pendiente" para bajar cerradas/trazadas
// hasta ~75 %.
const { data: somsExistentes } = await supa
  .from('estadisticas')
  .select('id, detalle')
  .eq('restaurante_id', TARGET_ID)
  .eq('tipo', 'sommelier')
const recIdsSommExistentes = new Set(
  (somsExistentes || [])
    .map(r => parseDet(r.detalle)?.recommendation_id)
    .filter(Boolean)
)

const sommInserts = []
let recCerradasPrev = 0
for (const key of atribuidos) {
  const g = grupoATR.get(key)
  if (!g) continue
  const recId = recIdDe(g.vinoId, g.fecha, g.turno)
  if (recIdsSommExistentes.has(recId)) { recCerradasPrev += 1; continue }
  // created_at = 5 min antes de la primera venta del grupo.
  const firstIso = g.filas.map(x => x.created_at).sort()[0]
  const dt = new Date(firstIso)
  dt.setUTCMinutes(dt.getUTCMinutes() - 5)
  const nombreVino = (vinos || []).find(v => v.id === g.vinoId)?.nombre || '—'
  sommInserts.push({
    restaurante_id: TARGET_ID,
    tipo: 'sommelier',
    created_at: dt.toISOString(),
    detalle: {
      recommendation_id: recId,
      vino_id: g.vinoId,
      vino: nombreVino,
      origen_exposicion: 'camarero',
      fuente_recomendacion: 'demo_seed',
      fecha_servicio: g.fecha,
      servicio_tipo: g.turno === 'mediodia' ? 'comida' : 'cena',
    },
  })
}

// Calculamos cuántas "pendientes" añadir: queremos cerradas / trazadas = 0.75.
// Trazadas después = (previas en som + nuevas con feedback + nuevas sin feedback).
// Cerradas = previas cerradas + atribuciones nuevas asociadas a venta.
// Resolvemos para "sin feedback extra".
const cerradasObjetivo = sommInserts.length + recCerradasPrev
const trazadasObjetivo = Math.ceil(cerradasObjetivo / PCT_CERRADAS_DESEADO)
const pendientesPrev = recIdsSommExistentes.size - recCerradasPrev
let extrasNecesarias = Math.max(0, trazadasObjetivo - cerradasObjetivo - pendientesPrev)

for (let i = 0; i < extrasNecesarias; i++) {
  const recId = `rec_demo_pendiente_${i + 1}`
  if (recIdsSommExistentes.has(recId)) continue
  // Repartimos fechas entre los últimos 14 días para que no se amontonen.
  const base = vendidas[Math.min(vendidas.length - 1, Math.floor(vendidas.length * (i + 1) / Math.max(1, extrasNecesarias + 1)))]
  const iso = base?.created_at || new Date().toISOString()
  sommInserts.push({
    restaurante_id: TARGET_ID,
    tipo: 'sommelier',
    created_at: iso,
    detalle: {
      recommendation_id: recId,
      vino_id: null,
      vino: '—',
      origen_exposicion: 'camarero',
      fuente_recomendacion: 'demo_seed',
      servicio_tipo: 'otro',
      estado: 'pendiente_cierre',
    },
  })
}

// ── 5) Simulación de los KPIs del panel de Fiabilidad ──────────────────────
// Ventas KPI tras priorización con fuente='tpv' aplicada por grupos
// (la dedup del priorizador solo marca omitidaPorTpv a ventas NO-TPV que
// comparten clave con una TPV; al marcar GRUPOS completos como TPV, no
// hay no-TPV en esa clave y nada se omite). Simulación coherente: KPI
// sigue siendo totalUnidades.
const simul = {
  totalUnidades,
  unidadesTPV: 0,
  unidadesAtribuidasSim: 0,
  pctTPV: 0,
  pctAtrib: 0,
  recTrazadas: 0,
  recCerradas: 0,
  pctCerradas: 0,
}
for (const v of vendidas) {
  const fecha = fechaMadrid(v.created_at)
  const turno = turnoMadrid(v.created_at)
  const keyTPV = v.det.vino_id ? `${v.det.vino_id}|${fecha}` : null
  const keyATR = v.det.vino_id ? `${v.det.vino_id}|${fecha}|${turno}` : null
  const cant = Math.max(1, Number(v.det.cantidad) || 1)
  const esTPV = (keyTPV && decisionTPV.get(keyTPV)) || v.det.fuente === 'tpv'
  const esATR = (keyATR && atribuidos.has(keyATR)) || !!v.det.recommendation_id
  if (esTPV) simul.unidadesTPV += cant
  if (esATR) simul.unidadesAtribuidasSim += cant
}
simul.pctTPV   = totalUnidades > 0 ? (simul.unidadesTPV / totalUnidades) * 100 : 0
simul.pctAtrib = totalUnidades > 0 ? (simul.unidadesAtribuidasSim / totalUnidades) * 100 : 0
simul.recTrazadas = recIdsSommExistentes.size + sommInserts.length
simul.recCerradas = cerradasObjetivo
simul.pctCerradas = simul.recTrazadas > 0 ? (simul.recCerradas / simul.recTrazadas) * 100 : 0

// Fiabilidad global simulada: media de los 6 indicadores base del panel
// (fiabilidadIndicadoresBase). Los 3 no tocados aquí (PVP+coste,
// Ventas con coste, Stock mínimo) los asumimos razonablemente altos.
// Usamos estimaciones conservadoras para pintar un rango realista.
const ASUNC = { pvpYCoste: 95, ventasConCoste: 85, stockMinimo: 90, tpvAtribuido: 60 }
const fiabilidadSimulada = Math.round(
  (ASUNC.pvpYCoste + ASUNC.ventasConCoste + ASUNC.stockMinimo + ASUNC.tpvAtribuido +
   simul.pctTPV + simul.pctAtrib + simul.pctCerradas) / 7
)

// ── 6) Invariante de importe 7d/30d ────────────────────────────────────────
const nowIso = new Date().toISOString()
const hace = (d) => {
  const t = new Date(nowIso); t.setUTCDate(t.getUTCDate() - d); return t.toISOString()
}
let importe7d = 0, importe30d = 0
const d7Iso  = hace(7)
const d30Iso = hace(30)
for (const v of vendidas) {
  const imp = Number(v.det.importe_vino_estimado) || 0
  if (v.created_at >= d30Iso) importe30d += imp
  if (v.created_at >= d7Iso)  importe7d  += imp
}

// ── 7) Informe ─────────────────────────────────────────────────────────────
console.log(`\n[seed trazabilidad Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`\n── (1) Universo ─────────────────────────────────────────────────`)
console.log(`  filas 'venta' totales:         ${filas.length}`)
console.log(`  vendidas:                      ${vendidas.length}`)
console.log(`  unidades totales (KPI prev.):  ${totalUnidades}`)
console.log(`  grupos (vino|fecha):           ${grupoTPV.size}`)
console.log(`  grupos (vino|fecha|turno):     ${grupoATR.size}`)
console.log(`  vinos "boost" detectados:      ${BOOST_IDS.size} (de ${NOMBRES_BOOST.length} esperados)`)
if (BOOST_IDS.size !== NOMBRES_BOOST.length) {
  console.log(`  ⚠ No se encontraron todos los vinos boost por nombre normalizado. Revisa NOMBRES_BOOST.`)
}

console.log(`\n── (2) Decisiones (determinista) ─────────────────────────────────`)
console.log(`  grupos marcados como TPV:      ${[...decisionTPV.values()].filter(Boolean).length} / ${decisionTPV.size}`)
console.log(`  grupos atribuidos:             ${atribuidos.size} / ${grupoATR.size}`)
console.log(`  cambios en 'venta' .detalle:   fuente→tpv=${cambiosTPV}  recommendation_id=${cambiosATR}`)

console.log(`\n── (3) Filas 'sommelier' a insertar ──────────────────────────────`)
console.log(`  trazadas con feedback (cerradas): ${sommInserts.filter(r => r.detalle.vino_id).length}`)
console.log(`  trazadas sin feedback (pendientes): ${sommInserts.filter(r => !r.detalle.vino_id).length}`)
console.log(`  TOTAL nuevas tipo='sommelier':  ${sommInserts.length}`)
console.log(`  recs sommelier previas:         ${recIdsSommExistentes.size}`)

console.log(`\n── (4) Simulación de KPIs ────────────────────────────────────────`)
console.log(`  Fuente TPV:          ${simul.unidadesTPV}/${totalUnidades}  →  ${simul.pctTPV.toFixed(1)} %`)
console.log(`  Ventas atribuidas:   ${simul.unidadesAtribuidasSim}/${totalUnidades}  →  ${simul.pctAtrib.toFixed(1)} %  (tope ${TOPE_ATRIBUIDAS_PCT * 100} %)`)
console.log(`  Rec. trazadas:       ${simul.recTrazadas}`)
console.log(`  Rec. cerradas:       ${simul.recCerradas}/${simul.recTrazadas}  →  ${simul.pctCerradas.toFixed(1)} %`)
console.log(`  Fiabilidad global simulada:  ~${fiabilidadSimulada} %   (objetivo 70–75 %, no >80)`)

console.log(`\n── (5) Invariante de importe (no debe cambiar tras apply) ────────`)
console.log(`  importe 'vendida' 7d:  ${r2(importe7d)} €  (referencia histórica: 2.432,50)`)
console.log(`  importe 'vendida' 30d: ${r2(importe30d)} €  (referencia histórica: 10.215,00)`)
console.log(`  este seed no toca importe_vino_estimado ni cantidad: queda igual tras --apply.`)

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── 8) APPLY ───────────────────────────────────────────────────────────────
console.log(`\n── APPLY ─────────────────────────────────────────────────────────`)
let okV = 0
for (const u of ventaUpdates) {
  const { error } = await supa.from('estadisticas')
    .update({ detalle: u.newDetalle })
    .eq('id', u.id)
    .eq('restaurante_id', TARGET_ID)
    .eq('tipo', 'venta')
  if (error) { console.warn(`  (aviso venta ${u.id}):`, error.message); continue }
  okV += 1
}
console.log(`  ✓ ventas actualizadas: ${okV}/${ventaUpdates.length}`)

if (sommInserts.length) {
  // Insertamos en lotes de 500.
  let okS = 0
  for (let i = 0; i < sommInserts.length; i += 500) {
    const lote = sommInserts.slice(i, i + 500)
    const { data, error } = await supa.from('estadisticas').insert(lote).select('id')
    if (error) { console.warn(`  (aviso insert lote):`, error.message); continue }
    okS += data?.length || 0
  }
  console.log(`  ✓ filas 'sommelier' insertadas: ${okS}/${sommInserts.length}`)
}

// ── 9) Verificación post-apply ─────────────────────────────────────────────
console.log(`\n── Verificación tras apply ──────────────────────────────────────`)
const sample3 = ventaUpdates.slice(0, 3).map(u => u.id)
if (sample3.length) {
  const { data } = await supa.from('estadisticas').select('id, detalle').in('id', sample3)
  for (const row of (data || [])) {
    const d = parseDet(row.detalle)
    console.log(`  · ${row.id}  fuente=${d.fuente || '—'}  recommendation_id=${d.recommendation_id || '—'}  importe=${d.importe_vino_estimado}  cantidad=${d.cantidad}`)
  }
}
const { data: verSoms } = await supa
  .from('estadisticas').select('detalle')
  .eq('restaurante_id', TARGET_ID).eq('tipo', 'sommelier')
const recsReales = new Set((verSoms || []).map(r => parseDet(r.detalle)?.recommendation_id).filter(Boolean))
console.log(`  recs tipo='sommelier' en BD tras apply: ${recsReales.size}`)

console.log(`\n[seed trazabilidad Casa Marisma] completado.`)
