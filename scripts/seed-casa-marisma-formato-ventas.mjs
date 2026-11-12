/**
 * Rellena detalle.formato_venta / detalle.cantidad / detalle.precio_unidad
 * en public.estadisticas (tipo='venta', resultado='vendida') de Casa
 * Marisma. Fusiona el JSON (no toca importe_vino_estimado, vino_id,
 * created_at ni el resto de claves).
 *
 * Regla v3 (por línea, en este orden de prioridad):
 *   1) Vino SIN precio_copa (null o 0):
 *        → botella, cantidad = max(1, detalle.cantidad actual),
 *          precio_unidad = precio_botella.
 *   2) Vino CON precio_copa: si (importe / cantidad_actual) está a ±15 %
 *      de precio_botella:
 *        → botella, cantidad = cantidad_actual, precio_unidad = precio_botella.
 *        Prioridad sobre copa aunque también encaje como múltiplo de copa.
 *   3) Si no: k = importe / precio_copa. Si k está a ±10 % de un entero o
 *      medio-entero (≥1):
 *        → copa, cantidad = round(k), precio_unidad = precio_copa.
 *      Si no, no se toca y se cuenta con motivo.
 *
 * Idempotente (salta si formato_venta ya es 'copa'|'botella').
 * Dry-run por defecto; guard UUID + nombre; .select() tras apply.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-casa-marisma-formato-ventas.mjs           # dry-run
 *   node --env-file=.env.local scripts/seed-casa-marisma-formato-ventas.mjs --apply   # escribe
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
  console.error('Lanza con: node --env-file=.env.local scripts/seed-casa-marisma-formato-ventas.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

// ── Tolerancias ─────────────────────────────────────────────────────────────
const TOL_BOTELLA_UNITARIO = 0.15   // ±15 % de precio_botella al precio por unidad
const TOL_COPA_ENTERO      = 0.10   // ±10 % al entero o medio-entero más cercano

const r2 = n => Math.round(Number(n) * 100) / 100
function parseDet(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}
function hoyMadridIso(n = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date())
  const y = Number(p.find(x=>x.type==='year').value)
  const m = Number(p.find(x=>x.type==='month').value)
  const d = Number(p.find(x=>x.type==='day').value)
  return new Date(Date.UTC(y, m - 1, d - n, 0)).toISOString()
}

console.log(`\n[seed formato-ventas Casa Marisma v3] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)

// ── 1) Muestra de la forma del detalle ──────────────────────────────────────
const { data: muestra } = await supa
  .from('estadisticas')
  .select('id, created_at, detalle')
  .eq('restaurante_id', TARGET_ID)
  .eq('tipo', 'venta')
  .order('created_at', { ascending: false })
  .limit(3)
console.log('\n── (1) Forma del detalle (3 filas de muestra) ───────────────────')
for (const row of (muestra || [])) {
  const det = parseDet(row.detalle)
  console.log('  ·', JSON.stringify({
    id: row.id, created_at: row.created_at,
    keys: Object.keys(det).sort(),
    tiene_formato_venta: det.formato_venta === 'copa' || det.formato_venta === 'botella',
    tiene_cantidad: Number(det.cantidad) > 0,
    tiene_precio_unidad: Number(det.precio_unidad) > 0,
  }))
}

// ── 2) Vinos ────────────────────────────────────────────────────────────────
const { data: vinos, error: errV } = await supa
  .from('vinos')
  .select('id, nombre, precio_copa, precio_botella')
  .eq('restaurante_id', TARGET_ID)
if (errV) { console.error('ERROR leyendo vinos:', errV.message); process.exit(1) }
const vinoById = Object.fromEntries((vinos || []).map(v => [v.id, v]))
const vinosConBot  = (vinos || []).filter(v => Number(v.precio_botella) > 0).length
const vinosConCop  = (vinos || []).filter(v => Number(v.precio_copa) > 0).length
const vinosSoloBot = (vinos || []).filter(v => Number(v.precio_botella) > 0 && !(Number(v.precio_copa) > 0)).length
console.log(`\n── (2) Vinos Casa Marisma ───────────────────────────────────────`)
console.log(`  total vinos:                 ${vinos?.length || 0}`)
console.log(`  con precio_botella > 0:      ${vinosConBot}`)
console.log(`  con precio_copa > 0:         ${vinosConCop}`)
console.log(`  solo botella (sin pc):       ${vinosSoloBot}`)

// ── 3) Ventas 30d paginadas ────────────────────────────────────────────────
async function cargarVentas30d() {
  const desde = hoyMadridIso(30)
  const hasta = hoyMadridIso(0)
  const PAGE = 1000
  let offset = 0
  const out = []
  while (true) {
    const { data, error } = await supa
      .from('estadisticas')
      .select('id, created_at, detalle')
      .eq('restaurante_id', TARGET_ID)
      .eq('tipo', 'venta')
      .gte('created_at', desde)
      .lt('created_at', hasta)
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
const filas = await cargarVentas30d()
const hace7Iso = hoyMadridIso(7)

// ── 4) Reglas v3 ────────────────────────────────────────────────────────────
function encajaEnteroOMedio(x) {
  if (!(x > 0)) return null
  const e = Math.round(x)
  if (e >= 1 && Math.abs(x - e) / e <= TOL_COPA_ENTERO) return e
  const half = Math.round(x * 2) / 2
  const halfEntero = Math.round(half)
  if (half >= 1 && Math.abs(half - halfEntero) > 1e-9) {
    // es .5 estricto
    if (Math.abs(x - half) / half <= TOL_COPA_ENTERO) {
      // redondea al entero más cercano (ej. 3.5 → 4)
      return Math.max(1, Math.round(half))
    }
  }
  return null
}

function clasificar({ importe, cantidadDet, pB, pC }) {
  // Rule 1: sin precio_copa → botella (cantidad del detalle, mín. 1)
  if (!(pC > 0)) {
    if (!(pB > 0)) return { tipo: null, motivo: 'vino sin precio_botella ni precio_copa' }
    return { tipo: 'botella', cantidad: Math.max(1, Number(cantidadDet) || 1), precio_unidad: pB, bucket: 'sin_copa→botella' }
  }
  // Rule 2: precio por unidad ≈ precio_botella → botella con prioridad.
  if (pB > 0) {
    const cantUsada = Math.max(1, Number(cantidadDet) || 1)
    const precioUnit = importe / cantUsada
    if (precioUnit > 0 && Math.abs(precioUnit - pB) / pB <= TOL_BOTELLA_UNITARIO) {
      return { tipo: 'botella', cantidad: cantUsada, precio_unidad: pB, bucket: 'botella_por_precio_unitario' }
    }
  }
  // Rule 3: copa. k = importe / precio_copa; entero o medio-entero ±10 %.
  const k = importe / pC
  const kRed = encajaEnteroOMedio(k)
  if (kRed) {
    // Distinguimos si fue redondeo desde medio-entero.
    const eExacto = Math.abs(k - Math.round(k)) / Math.max(1, Math.round(k))
    const redondeadoDeMedio = !(eExacto <= TOL_COPA_ENTERO)
    return {
      tipo: 'copa',
      cantidad: kRed,
      precio_unidad: pC,
      bucket: redondeadoDeMedio ? 'copa_redondeada' : 'copa_entera',
    }
  }
  return { tipo: null, motivo: 'no encaja ni como botella (±15 % de pB) ni como copa (entero/medio ±10 %)' }
}

// ── 5) Pasada ───────────────────────────────────────────────────────────────
const stats = {
  total: 0, vendidas: 0, yaConFormato: 0, actualizables: 0,
  importeTotal30d: 0, importeTotal7d: 0,
  buckets: { 'sin_copa→botella': 0, 'botella_por_precio_unitario': 0, 'copa_entera': 0, 'copa_redondeada': 0, 'sin_clasificar': 0 },
}
const reparto  = { d7:  { copa: 0, botella: 0, otros: 0 }, d30: { copa: 0, botella: 0, otros: 0 } }
const importes = { d7: { copa: 0, botella: 0 }, d30: { copa: 0, botella: 0 } }
const sinClasificar = []
const topMap = {} // vino_id → { nombre, uds, importe, tieneCopa, tieneBot }
const updates = []

for (const row of filas) {
  stats.total += 1
  const det = parseDet(row.detalle)
  if (det.resultado && det.resultado !== 'vendida') continue
  stats.vendidas += 1
  const importe = Number(det.importe_vino_estimado) || 0
  const en7d = row.created_at >= hace7Iso
  stats.importeTotal30d += importe
  if (en7d) stats.importeTotal7d += importe

  // Idempotencia: si ya trae formato válido, lo contamos pero no lo tocamos.
  const yaFormato = det.formato_venta === 'copa' || det.formato_venta === 'botella'
  if (yaFormato) {
    stats.yaConFormato += 1
    const cant = Math.max(1, Number(det.cantidad) || 1)
    const key = det.formato_venta
    reparto.d30[key] += cant; importes.d30[key] += importe
    if (en7d) { reparto.d7[key] += cant; importes.d7[key] += importe }
    const nombre = det.vino || (vinoById[det.vino_id]?.nombre) || '—'
    if (det.vino_id) {
      topMap[det.vino_id] ||= { nombre, uds: 0, importe: 0, tieneCopa: false, tieneBot: false }
      topMap[det.vino_id].uds += cant
      topMap[det.vino_id].importe += importe
      if (key === 'copa') topMap[det.vino_id].tieneCopa = true
      if (key === 'botella') topMap[det.vino_id].tieneBot = true
    }
    continue
  }

  const v = vinoById[det.vino_id]
  if (!det.vino_id || !v) {
    stats.buckets.sin_clasificar += 1
    reparto.d30.otros += 1; if (en7d) reparto.d7.otros += 1
    if (sinClasificar.length < 10) sinClasificar.push({ id: row.id, motivo: det.vino_id ? 'vino no en catálogo' : 'detalle sin vino_id' })
    continue
  }
  const pB = Number(v.precio_botella) || 0
  const pC = Number(v.precio_copa) || 0
  const cantidadDet = Number(det.cantidad) || 0
  const res = clasificar({ importe, cantidadDet, pB, pC })

  if (!res.tipo) {
    stats.buckets.sin_clasificar += 1
    reparto.d30.otros += 1; if (en7d) reparto.d7.otros += 1
    if (sinClasificar.length < 10) {
      sinClasificar.push({
        id: row.id, motivo: res.motivo,
        importe, cantidad_det: det.cantidad ?? null,
        precio_copa: pC, precio_botella: pB,
      })
    }
    continue
  }

  // Bucket count + reparto + top
  stats.buckets[res.bucket] += 1
  stats.actualizables += 1
  reparto.d30[res.tipo] += res.cantidad; importes.d30[res.tipo] += importe
  if (en7d) { reparto.d7[res.tipo] += res.cantidad; importes.d7[res.tipo] += importe }
  const nombre = det.vino || v.nombre || '—'
  topMap[det.vino_id] ||= { nombre, uds: 0, importe: 0, tieneCopa: false, tieneBot: false }
  topMap[det.vino_id].uds += res.cantidad
  topMap[det.vino_id].importe += importe
  if (res.tipo === 'copa')    topMap[det.vino_id].tieneCopa = true
  if (res.tipo === 'botella') topMap[det.vino_id].tieneBot = true

  const newDetalle = { ...det, formato_venta: res.tipo, cantidad: res.cantidad, precio_unidad: r2(res.precio_unidad) }
  updates.push({ id: row.id, newDetalle })
}

// ── 6) Buckets ─────────────────────────────────────────────────────────────
console.log(`\n── (3) Buckets de clasificación (regla v3) ──────────────────────`)
console.log(`  sin_copa → botella (regla 1):              ${stats.buckets['sin_copa→botella']}`)
console.log(`  botella por precio unitario (regla 2):     ${stats.buckets['botella_por_precio_unitario']}`)
console.log(`  copa entera (regla 3, k entero):           ${stats.buckets['copa_entera']}`)
console.log(`  copa redondeada (regla 3, k medio-entero): ${stats.buckets['copa_redondeada']}`)
console.log(`  sin clasificar:                            ${stats.buckets['sin_clasificar']}`)
console.log(`  ya con formato (saltadas):                 ${stats.yaConFormato}`)
console.log(`  ─ TOTAL vendidas:                          ${stats.vendidas}`)

if (sinClasificar.length) {
  console.log(`\n  Primeros ${sinClasificar.length} sin clasificar:`)
  for (const s of sinClasificar) console.log('    ·', JSON.stringify(s))
}

// ── 7) Reparto 7d y 30d ────────────────────────────────────────────────────
console.log(`\n── (4) Reparto 7d / 30d ─────────────────────────────────────────`)
console.log(`  unidades 7d:  ${reparto.d7.copa} copas · ${reparto.d7.botella} botellas · ${reparto.d7.otros} sin clasificar`)
console.log(`  unidades 30d: ${reparto.d30.copa} copas · ${reparto.d30.botella} botellas · ${reparto.d30.otros} sin clasificar`)
console.log(`  €        7d:  copa=${r2(importes.d7.copa)}  bot=${r2(importes.d7.botella)}  total=${r2(stats.importeTotal7d)}`)
console.log(`  €        30d: copa=${r2(importes.d30.copa)}  bot=${r2(importes.d30.botella)}  total=${r2(stats.importeTotal30d)}`)
const pctBot30 = stats.importeTotal30d > 0 ? (importes.d30.botella / stats.importeTotal30d) * 100 : 0
console.log(`  % botella / total (30d, €):  ${pctBot30.toFixed(1)} %`)

// ── 8) Top 5 simulado ──────────────────────────────────────────────────────
const topList = Object.values(topMap)
const topByUds     = [...topList].sort((a, b) => b.uds - a.uds).slice(0, 5)
const topByImporte = [...topList].sort((a, b) => b.importe - a.importe).slice(0, 5)
function fmtLinea(x) {
  const flags = [x.tieneCopa ? 'copa' : null, x.tieneBot ? 'bot' : null].filter(Boolean).join('/')
  return `  ${String(x.nombre).slice(0, 48).padEnd(48)}  uds=${String(x.uds).padStart(4)}  €=${r2(x.importe).toString().padStart(8)}  (${flags})`
}
console.log(`\n── (5) Top 5 simulado por UNIDADES ──────────────────────────────`)
for (const x of topByUds) console.log(fmtLinea(x))
console.log(`\n── (6) Top 5 simulado por IMPORTE ───────────────────────────────`)
for (const x of topByImporte) console.log(fmtLinea(x))
// Concentración del Nº1 por uds.
const dominance = topByUds[0] && reparto.d30.copa + reparto.d30.botella > 0
  ? (topByUds[0].uds / (reparto.d30.copa + reparto.d30.botella)) * 100 : 0
console.log(`\n  concentración del Nº1 por uds.: ${dominance.toFixed(1)} % del total clasificado.`)

// ── 9) Realismo ────────────────────────────────────────────────────────────
console.log(`\n── (7) Check de realismo ────────────────────────────────────────`)
const realCopasMayoria = reparto.d30.copa > reparto.d30.botella
const realBotellasRango = reparto.d30.botella >= 150 && reparto.d30.botella <= 250
const realImporteRango  = pctBot30 >= 35 && pctBot30 <= 55
console.log(`  más copas que botellas en uds. 30d?   ${realCopasMayoria ? 'sí ✓' : 'no ✗'}`)
console.log(`  botellas en rango 150–250 uds. 30d?    ${realBotellasRango ? 'sí ✓' : 'no ✗ (' + reparto.d30.botella + ')'}`)
console.log(`  botella 35–55 % del importe 30d?       ${realImporteRango ? 'sí ✓' : 'no ✗ (' + pctBot30.toFixed(1) + ' %)'}`)
if (!(realCopasMayoria && realBotellasRango && realImporteRango)) {
  console.log(`  ⚠ No se fuerza. Interpreta los números con la regla v3; si no te cuadran, revisa precio_copa/precio_botella o el seed original de ventas.`)
}

// ── 10) Invariante importe ─────────────────────────────────────────────────
console.log(`\n── (8) Invariante del importe total ─────────────────────────────`)
console.log(`  importe total 7d:  ${r2(stats.importeTotal7d)} €   (esperado ≈ 2.432,50)`)
console.log(`  importe total 30d: ${r2(stats.importeTotal30d)} €   (esperado ≈ 10.215)`)
console.log(`  tras apply, los importes de todas las filas quedan intactos.`)

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── 11) APPLY ───────────────────────────────────────────────────────────────
console.log(`\n── APPLY (actualizando ${updates.length} filas) ──────────────────`)
let ok = 0, ko = 0
for (const u of updates) {
  const { error } = await supa
    .from('estadisticas')
    .update({ detalle: u.newDetalle })
    .eq('id', u.id)
    .eq('restaurante_id', TARGET_ID)
  if (error) { ko += 1; console.warn(`  (aviso) ${u.id}: ${error.message}`); continue }
  ok += 1
}
console.log(`  ✓ actualizadas: ${ok}/${updates.length}${ko ? ` (${ko} con aviso)` : ''}`)

// ── 12) Verificación ───────────────────────────────────────────────────────
console.log('\n── Verificación tras apply ──────────────────────────────────────')
const idsSample = updates.slice(0, 3).map(u => u.id)
if (idsSample.length) {
  const { data: check } = await supa.from('estadisticas').select('id, detalle').in('id', idsSample)
  for (const row of (check || [])) {
    const det = parseDet(row.detalle)
    console.log(`  · ${row.id}  formato=${det.formato_venta}  cantidad=${det.cantidad}  precio_unidad=${det.precio_unidad}  importe=${det.importe_vino_estimado}`)
  }
}

const { data: verif } = await supa
  .from('estadisticas')
  .select('detalle, created_at')
  .eq('restaurante_id', TARGET_ID)
  .eq('tipo', 'venta')
  .gte('created_at', hoyMadridIso(30))
  .lt('created_at', hoyMadridIso(0))
const vcount = { d7: { copa: 0, botella: 0, otros: 0 }, d30: { copa: 0, botella: 0, otros: 0 } }
let importe30d = 0
for (const row of (verif || [])) {
  const det = parseDet(row.detalle)
  if (det.resultado && det.resultado !== 'vendida') continue
  const cant = Math.max(1, Number(det.cantidad) || 1)
  const en7d = row.created_at >= hace7Iso
  const key = det.formato_venta === 'copa' ? 'copa' : det.formato_venta === 'botella' ? 'botella' : 'otros'
  vcount.d30[key] += cant
  if (en7d) vcount.d7[key] += cant
  importe30d += Number(det.importe_vino_estimado) || 0
}
console.log(`  recuento 7d:  ${vcount.d7.copa} copas · ${vcount.d7.botella} botellas · ${vcount.d7.otros} sin clasificar`)
console.log(`  recuento 30d: ${vcount.d30.copa} copas · ${vcount.d30.botella} botellas · ${vcount.d30.otros} sin clasificar`)
console.log(`  importe 30d:  ${r2(importe30d)} €   (antes: ${r2(stats.importeTotal30d)} €)  diff=${r2(importe30d - stats.importeTotal30d)}`)
if (r2(importe30d) !== r2(stats.importeTotal30d)) {
  console.warn(`  ⚠ El importe total cambió. Revísalo: el apply solo debía tocar formato_venta/cantidad/precio_unidad.`)
}
console.log('\n[seed formato-ventas Casa Marisma v3] completado.')
