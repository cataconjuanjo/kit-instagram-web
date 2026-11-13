/**
 * Enriquecer la trazabilidad de ventas en Casa Marisma:
 *   - Marcar un subconjunto como "fuente TPV" (detalle.fuente='tpv' +
 *     pos_import_batch_id='demo-YYYYMM'). Lo hacemos por GRUPO
 *     (vino_id, fechaMadrid) completo, para no activar la dedup del
 *     priorizador (app/lib/salesPriority.js:82-104, L86-101).
 *   - Atribuir un subconjunto a una recomendación (detalle.recommendation_id).
 *     También por grupo (vino_id, fechaMadrid). Boost en los 3 vinos
 *     "Empujar hoy" del briefing.
 *   - Insertar filas `tipo='recomendacion'` (tipo correcto según
 *     app/dashboard/estadisticas/page.js:400 y cierre/page.js:187) con
 *     esos recommendation_id para que queden trazadas.
 *   - Un número PEQUEÑO de pendientes (constante PENDIENTES_OBJETIVO)
 *     con created_at en los últimos 7 días RELATIVOS A LA ÚLTIMA VENTA
 *     y FUERA del día operativo actual Madrid, para no ensuciar el
 *     Cierre del turno ("Servicio limpio 100 %").
 *
 * Objetivos (medidos en UNIDADES, no en filas):
 *   - Fuente TPV:        ≈ 60 %
 *   - Ventas atribuidas: 35–45 %   (tope duro 45 %). Boost en los 3 vinos.
 *   - Pendientes:        PENDIENTES_OBJETIVO filas (hoy fijado en 10).
 *   - Cerradas / trazadas: ≈ 97–99 %  (porque pendientes son muy pocas).
 *   - Fiabilidad global simulada: 72–78 %.
 *
 * Determinista (hash FNV-1a), idempotente, dry-run por defecto.
 * NO modifica importe_vino_estimado, cantidad, created_at, vino_id,
 * resultado, formato_venta ni precio_unidad.
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
const PCT_TPV_GRUPOS      = 0.60
const PCT_ATRIBUIR_BASE   = 0.40
const PCT_ATRIBUIR_BOOST  = 0.65
const TOPE_ATRIBUIDAS_PCT = 0.45
const PENDIENTES_OBJETIVO = 10
const BATCH_PREFIX        = 'demo-'

// Palabras clave para resolver los 3 vinos "Empujar hoy" del briefing.
// Como no tengo los UUIDs a priori (no puedo consultar la BD desde el
// editor), se resuelven en runtime y se imprimen en el dry-run; una vez
// confirmados, puedes copiarlos a BOOST_IDS_FIJOS para no depender del
// matching por palabras clave.
const BOOST_IDS_FIJOS = [] // ['uuid-vina-bujanda', 'uuid-finca-antigua', 'uuid-piedemonte']
const BOOST_KEYWORDS = [
  ['bujanda', 'joven'],
  ['finca antigua', 'tempranillo'],
  ['piedemonte', 'cabernet'],
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
function yyyymm(iso)      { const p = partsMadrid(iso); return `${p.y}${p.m}` }

// Inicio de hoy Madrid, en UTC ISO. Las filas con created_at ≥ a esto
// están "en el día operativo actual" (lo que Cierre lee).
function inicioHoyMadridIso() {
  const nowParts = partsMadrid(new Date().toISOString())
  // Construir medianoche Madrid del día actual como timestamptz.
  // Aproximación DST-safe: usar anchor mediodía y reconstruir offset.
  const noonUtc = new Date(`${nowParts.y}-${nowParts.m}-${nowParts.d}T12:00:00Z`)
  const madridParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(noonUtc)
  const g = t => madridParts.find(p => p.type === t)?.value ?? '00'
  const madridIso = `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}Z`
  const offsetMs = noonUtc.getTime() - new Date(madridIso).getTime()
  return new Date(new Date(`${nowParts.y}-${nowParts.m}-${nowParts.d}T00:00:00Z`).getTime() + offsetMs).toISOString()
}

// ── Carga vinos y resuelve boost IDs ───────────────────────────────────────
const { data: vinos } = await supa
  .from('vinos').select('id, nombre, precio_copa, precio_botella')
  .eq('restaurante_id', TARGET_ID)

function resolverBoost() {
  if (BOOST_IDS_FIJOS.length) return { ids: new Set(BOOST_IDS_FIJOS), resueltos: [], modo: 'fijos' }
  const resueltos = []
  for (const kws of BOOST_KEYWORDS) {
    const match = (vinos || []).find(v => kws.every(k => norm(v.nombre).includes(k)))
    if (match) resueltos.push({ palabras: kws.join(' + '), id: match.id, nombre: match.nombre })
  }
  return { ids: new Set(resueltos.map(r => r.id)), resueltos, modo: 'por_palabras' }
}
const boostResuelto = resolverBoost()
const BOOST_IDS = boostResuelto.ids

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

const vendidas = filas.map(f => ({
  id: f.id, created_at: f.created_at, det: parseDet(f.detalle),
})).filter(x => x.det.resultado === 'vendida')

const totalUnidades = vendidas.reduce((s, v) => s + Math.max(1, Number(v.det.cantidad) || 1), 0)
const ultimaVentaIso = vendidas.length ? vendidas[vendidas.length - 1].created_at : null

// ── Grupos (vino_id, fechaMadrid) ──────────────────────────────────────────
const grupos = new Map()  // key → { filas:[], unidades, vinoId, fecha }
for (const v of vendidas) {
  if (!v.det.vino_id) continue
  const fecha = fechaMadrid(v.created_at)
  const key = `${v.det.vino_id}|${fecha}`
  if (!grupos.has(key)) grupos.set(key, { filas: [], unidades: 0, vinoId: v.det.vino_id, fecha })
  const g = grupos.get(key)
  g.filas.push(v)
  g.unidades += Math.max(1, Number(v.det.cantidad) || 1)
}

// ── Decisión TPV por grupo ─────────────────────────────────────────────────
const decisionTPV = new Map()
for (const [key, g] of grupos) {
  const yaTpv = g.filas.every(v => v.det.fuente === 'tpv')
  if (yaTpv) { decisionTPV.set(key, true); continue }
  decisionTPV.set(key, rand01(`tpv:${key}`) < PCT_TPV_GRUPOS)
}

// ── Decisión atribución por grupo (boost primero para respetar sesgo) ──────
const gruposOrd = [...grupos.entries()]
  .map(([k, g]) => ({ key: k, g, score: rand01(`atr:${k}`), boost: BOOST_IDS.has(g.vinoId) }))
  .sort((a, b) => (b.boost ? 1 : 0) - (a.boost ? 1 : 0) || a.score - b.score)

const atribuidos = new Set()
let unidadesAtrib = 0
const limiteDuro = Math.floor(totalUnidades * TOPE_ATRIBUIDAS_PCT)
for (const { key, g, score, boost } of gruposOrd) {
  const umbral = boost ? PCT_ATRIBUIR_BOOST : PCT_ATRIBUIR_BASE
  const yaAtrib = g.filas.every(v => typeof v.det.recommendation_id === 'string' && v.det.recommendation_id.length > 0)
  if (yaAtrib) { atribuidos.add(key); unidadesAtrib += g.unidades; continue }
  if (score < umbral && unidadesAtrib + g.unidades <= limiteDuro) {
    atribuidos.add(key)
    unidadesAtrib += g.unidades
  }
}

function recIdDe(vinoId, fecha) { return `rec_demo_${vinoId}_${fecha}` }

// ── Updates de ventas ──────────────────────────────────────────────────────
const ventaUpdates = []
let cambiosTPV = 0, cambiosATR = 0
for (const v of vendidas) {
  if (!v.det.vino_id) continue
  const fecha = fechaMadrid(v.created_at)
  const key = `${v.det.vino_id}|${fecha}`
  const quiereTPV = decisionTPV.get(key) === true
  const quiereATR = atribuidos.has(key)
  const newDet = { ...v.det }
  let tocado = false
  if (quiereTPV && v.det.fuente !== 'tpv') {
    newDet.fuente = 'tpv'
    newDet.pos_import_batch_id = `${BATCH_PREFIX}${yyyymm(v.created_at)}`
    cambiosTPV += 1
    tocado = true
  }
  if (quiereATR && !v.det.recommendation_id) {
    newDet.recommendation_id = recIdDe(v.det.vino_id, fecha)
    cambiosATR += 1
    tocado = true
  }
  if (tocado) ventaUpdates.push({ id: v.id, newDetalle: newDet })
}

// ── Filas 'recomendacion' a insertar ───────────────────────────────────────
const { data: recsExistentes } = await supa
  .from('estadisticas')
  .select('id, detalle')
  .eq('restaurante_id', TARGET_ID)
  .eq('tipo', 'recomendacion')
const recIdsExistentes = new Set(
  (recsExistentes || []).map(r => parseDet(r.detalle)?.recommendation_id).filter(Boolean)
)

// Cerradas: una recomendación por grupo atribuido.
const inserts = []
for (const key of atribuidos) {
  const g = grupos.get(key)
  if (!g) continue
  const recId = recIdDe(g.vinoId, g.fecha)
  if (recIdsExistentes.has(recId)) continue
  const firstIso = g.filas.map(x => x.created_at).sort()[0]
  const dt = new Date(firstIso)
  dt.setUTCMinutes(dt.getUTCMinutes() - 5)
  const nombreVino = (vinos || []).find(v => v.id === g.vinoId)?.nombre || '—'
  inserts.push({
    restaurante_id: TARGET_ID,
    tipo: 'recomendacion',
    created_at: dt.toISOString(),
    detalle: {
      recommendation_id: recId,
      vino_id: g.vinoId,
      vino: nombreVino,
      origen_exposicion: 'camarero',
      fuente_recomendacion: 'demo_seed',
      fecha_servicio: g.fecha,
    },
  })
}

// Pendientes: PENDIENTES_OBJETIVO, repartidas en los últimos 7 días
// relativos a la última venta, excluyendo el día actual Madrid para
// no romper "Servicio limpio" en Cierre del turno (cierre carga solo
// tipo='recomendacion' dentro de hoy Madrid; ver app/lib/demoServiceDay.js
// y cierre/page.js:170-191).
const hoyInicioIso = inicioHoyMadridIso()
const vinosDisponibles = (vinos || []).filter(v => v.id).map(v => v.id)
let creadas = 0
if (ultimaVentaIso && vinosDisponibles.length) {
  // Candidatas de fecha: últimas 7 fechas distintas relativas a la última venta.
  const fechasUltimas = [...new Set(vendidas
    .filter(v => v.created_at < hoyInicioIso)     // nada en el día de hoy
    .slice(-500)
    .map(v => fechaMadrid(v.created_at))
  )].slice(-7)
  if (fechasUltimas.length) {
    for (let i = 0; i < PENDIENTES_OBJETIVO; i++) {
      // reparto rotatorio sobre las fechas recientes y los vinos
      const fecha = fechasUltimas[i % fechasUltimas.length]
      const vinoId = vinosDisponibles[(i * 7) % vinosDisponibles.length]
      const recId = `rec_demo_pendiente_${fecha}_${i + 1}`
      if (recIdsExistentes.has(recId)) continue
      // created_at: el mediodía Madrid de esa fecha (12:00 UTC ~ 13-14:00 Madrid).
      const createdIso = new Date(`${fecha}T12:00:00Z`).toISOString()
      // Guardia explícita: no debe caer en el día operativo actual.
      if (createdIso >= hoyInicioIso) continue
      inserts.push({
        restaurante_id: TARGET_ID,
        tipo: 'recomendacion',
        created_at: createdIso,
        detalle: {
          recommendation_id: recId,
          vino_id: vinoId,
          vino: (vinos || []).find(v => v.id === vinoId)?.nombre || '—',
          origen_exposicion: 'camarero',
          fuente_recomendacion: 'demo_seed',
          fecha_servicio: fecha,
          estado: 'pendiente_cierre',
        },
      })
      creadas += 1
    }
  }
}

// ── Simulación de KPIs ─────────────────────────────────────────────────────
let unidadesTPV = 0, unidadesAtribuidasSim = 0
for (const v of vendidas) {
  const fecha = fechaMadrid(v.created_at)
  const key = v.det.vino_id ? `${v.det.vino_id}|${fecha}` : null
  const cant = Math.max(1, Number(v.det.cantidad) || 1)
  if ((key && decisionTPV.get(key)) || v.det.fuente === 'tpv') unidadesTPV += cant
  if ((key && atribuidos.has(key)) || v.det.recommendation_id) unidadesAtribuidasSim += cant
}
const pctTPV   = totalUnidades > 0 ? (unidadesTPV / totalUnidades) * 100 : 0
const pctAtrib = totalUnidades > 0 ? (unidadesAtribuidasSim / totalUnidades) * 100 : 0
const recTrazadas = recIdsExistentes.size + inserts.length
const recCerradas = recIdsExistentes.size + inserts.filter(r => !r.detalle.estado).length
const pctCerradas = recTrazadas > 0 ? (recCerradas / recTrazadas) * 100 : 0
const pendientesEnPantalla = inserts.filter(r => r.detalle.estado === 'pendiente_cierre').length

// Asunciones para los 3 indicadores no tocados aquí (PVP+coste 95 %,
// Ventas con coste 85 %, Stock mínimo 90 %) y TPV atribuido (60 %).
const ASUNC = { pvpYCoste: 95, ventasConCoste: 85, stockMinimo: 90, tpvAtribuido: 60 }
const fiabilidadSim = Math.round(
  (ASUNC.pvpYCoste + ASUNC.ventasConCoste + ASUNC.stockMinimo + ASUNC.tpvAtribuido +
   pctTPV + pctAtrib + pctCerradas) / 7
)

// ── Invariante importe 7d/30d ──────────────────────────────────────────────
const nowIso = new Date().toISOString()
const hace = d => { const t = new Date(nowIso); t.setUTCDate(t.getUTCDate() - d); return t.toISOString() }
let importe7d = 0, importe30d = 0
for (const v of vendidas) {
  const imp = Number(v.det.importe_vino_estimado) || 0
  if (v.created_at >= hace(30)) importe30d += imp
  if (v.created_at >= hace(7))  importe7d  += imp
}

// ── Informe ────────────────────────────────────────────────────────────────
console.log(`\n[seed trazabilidad Casa Marisma v2] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)

console.log(`\n── (1) Vinos boost resueltos (${boostResuelto.modo}) ────────────`)
if (boostResuelto.resueltos.length) {
  for (const r of boostResuelto.resueltos) {
    console.log(`  · ${r.palabras.padEnd(32)} → id=${r.id}  (${r.nombre})`)
  }
  if (boostResuelto.resueltos.length < BOOST_KEYWORDS.length) {
    console.log(`  ⚠ ${BOOST_KEYWORDS.length - boostResuelto.resueltos.length} vino(s) boost no se encontraron por palabras clave.`)
  }
  console.log(`  Si quieres fijarlos para no depender de nombres: copia los ids a BOOST_IDS_FIJOS en este script.`)
} else {
  console.log(`  (ninguno resuelto; el boost se desactiva)`)
}

console.log(`\n── (2) Universo ─────────────────────────────────────────────────`)
console.log(`  filas 'venta' totales:         ${filas.length}`)
console.log(`  vendidas:                      ${vendidas.length}`)
console.log(`  unidades totales (KPI prev.):  ${totalUnidades}`)
console.log(`  grupos (vino_id | fechaMadrid):${grupos.size}`)
console.log(`  inicio de hoy Madrid (UTC):    ${hoyInicioIso}`)
console.log(`  última venta (created_at UTC): ${ultimaVentaIso}`)

console.log(`\n── (3) Decisiones ───────────────────────────────────────────────`)
console.log(`  grupos TPV:                    ${[...decisionTPV.values()].filter(Boolean).length} / ${decisionTPV.size}`)
console.log(`  grupos atribuidos:             ${atribuidos.size} / ${grupos.size}`)
console.log(`  cambios en 'venta' .detalle:   fuente→tpv=${cambiosTPV}  recommendation_id=${cambiosATR}`)

console.log(`\n── (4) Filas 'recomendacion' a insertar ─────────────────────────`)
console.log(`  cerradas (por grupo atribuido):${inserts.length - creadas}`)
console.log(`  pendientes (objetivo ${PENDIENTES_OBJETIVO}):${' '.repeat(5)}${creadas}`)
console.log(`  TOTAL nuevas:                  ${inserts.length}`)
console.log(`  recs previas en BD:            ${recIdsExistentes.size}`)

console.log(`\n── (5) Simulación de KPIs (panel Fiabilidad) ────────────────────`)
console.log(`  Fuente TPV:          ${unidadesTPV}/${totalUnidades}  →  ${pctTPV.toFixed(1)} %`)
console.log(`  Ventas atribuidas:   ${unidadesAtribuidasSim}/${totalUnidades}  →  ${pctAtrib.toFixed(1)} %  (tope ${TOPE_ATRIBUIDAS_PCT*100}%)`)
console.log(`  Rec. cerradas:       ${recCerradas}/${recTrazadas}  →  ${pctCerradas.toFixed(1)} %`)
console.log(`  Fiabilidad global simulada:  ~${fiabilidadSim} %   (objetivo 72–78 %, tope 80 %)`)

console.log(`\n── (6) Pantallas: cuántas pendientes verá cada una ──────────────`)
console.log(`  Inicio (radar-diario)  → filas 'recomendacion' sin feedback: ${pendientesEnPantalla} (recientes, visibles)`)
console.log(`  Estadísticas (backlog) → mismas: ${pendientesEnPantalla}`)
console.log(`  Cierre del turno       → 0 (pendientes creadas con created_at < hoy_Madrid, fuera del día operativo)`)

console.log(`\n── (7) Invariante importe (no cambia tras apply) ────────────────`)
console.log(`  importe 'vendida' 7d:  ${r2(importe7d)} €`)
console.log(`  importe 'vendida' 30d: ${r2(importe30d)} €`)
console.log(`  este seed no toca importe_vino_estimado, cantidad, created_at, formato_venta ni precio_unidad.`)

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── APPLY ──────────────────────────────────────────────────────────────────
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

if (inserts.length) {
  let okR = 0
  for (let i = 0; i < inserts.length; i += 500) {
    const lote = inserts.slice(i, i + 500)
    const { data, error } = await supa.from('estadisticas').insert(lote).select('id')
    if (error) { console.warn(`  (aviso insert lote):`, error.message); continue }
    okR += data?.length || 0
  }
  console.log(`  ✓ filas 'recomendacion' insertadas: ${okR}/${inserts.length}`)
}

// Verificación
const sample3 = ventaUpdates.slice(0, 3).map(u => u.id)
if (sample3.length) {
  const { data } = await supa.from('estadisticas').select('id, detalle').in('id', sample3)
  for (const row of (data || [])) {
    const d = parseDet(row.detalle)
    console.log(`  · ${row.id}  fuente=${d.fuente || '—'}  rec_id=${d.recommendation_id || '—'}  importe=${d.importe_vino_estimado}`)
  }
}
const { data: verRec } = await supa
  .from('estadisticas').select('detalle, created_at')
  .eq('restaurante_id', TARGET_ID).eq('tipo', 'recomendacion')
const enHoy = (verRec || []).filter(r => r.created_at >= hoyInicioIso).length
console.log(`  'recomendacion' en BD tras apply: ${verRec?.length || 0}  (en hoy_Madrid: ${enHoy})`)
if (enHoy > 0) console.warn(`  ⚠ ${enHoy} recomendaciones caen en el día operativo actual → Cierre del turno las verá como pendientes.`)

console.log(`\n[seed trazabilidad Casa Marisma v2] completado.`)
