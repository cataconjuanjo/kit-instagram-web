/**
 * Rellena detalle.formato_venta ('copa'|'botella') y detalle.precio_unidad
 * en las filas de public.estadisticas (tipo='venta', resultado='vendida')
 * de Casa Marisma donde falte, fusionando el JSON sin pisar el resto de
 * claves ni cambiar importes/fechas/cantidades.
 *
 * Orden de resolución:
 *   a) Cruce con partes_servicio_lineas (tipo='venta_copa'|'venta_botella')
 *      por (vino_id, fecha_Madrid) — solo informativo, se usa para contrastar.
 *   b) PRECIO por línea = importe_vino_estimado / cantidad vs
 *      vinos.precio_botella (tol. relativa 15 %) y vinos.precio_copa
 *      (tol. relativa 25 %). Si ambos encajan, gana el ratio menor.
 *      Si ninguno encaja: 'sin clasificar' (no se escribe).
 *
 * Idempotente, dry-run por defecto, blindado al UUID + nombre.
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

// ── Utilidades ──────────────────────────────────────────────────────────────
const TOL_BOT = 0.15
const TOL_COP = 0.25

function fechaMadrid(iso) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' })
    .formatToParts(new Date(iso))
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`
}
function hoyMadridIso(n = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' })
    .formatToParts(new Date())
  const y = Number(parts.find(p => p.type === 'year').value)
  const m = Number(parts.find(p => p.type === 'month').value)
  const d = Number(parts.find(p => p.type === 'day').value)
  return new Date(Date.UTC(y, m - 1, d - n, 0)).toISOString()
}
function parseDet(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}
const r2 = n => Math.round(Number(n) * 100) / 100

// ── 1) Muestra de forma del detalle (SOLO LECTURA, 3 filas) ─────────────────
console.log(`\n[seed formato-ventas Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)
const { data: muestra } = await supa
  .from('estadisticas')
  .select('id, created_at, detalle')
  .eq('restaurante_id', TARGET_ID)
  .eq('tipo', 'venta')
  .order('created_at', { ascending: false })
  .limit(3)

const claves = new Set()
console.log('\n── (1) Forma del detalle (3 filas de muestra) ───────────────────')
for (const row of (muestra || [])) {
  const det = parseDet(row.detalle)
  for (const k of Object.keys(det)) claves.add(k)
  // Ocultamos contenido textual sensible (vino puede llevar nombre completo).
  const resumen = {
    id: row.id, created_at: row.created_at,
    detalle_keys: Object.keys(det).sort(),
    tiene_vino_id: Boolean(det.vino_id),
    tiene_importe: Number(det.importe_vino_estimado) > 0,
    tiene_cantidad: Number(det.cantidad) > 0,
    tiene_formato_venta: det.formato_venta === 'copa' || det.formato_venta === 'botella',
    tiene_precio_unidad: Number(det.precio_unidad) > 0,
    muestra_resultado: det.resultado || null,
  }
  console.log('  ·', JSON.stringify(resumen))
}
console.log(`  claves vistas en el detalle: ${[...claves].sort().join(', ') || '—'}`)

// ── 2) Carga vinos (id → precio_copa, precio_botella) ───────────────────────
const { data: vinos, error: errV } = await supa
  .from('vinos')
  .select('id, nombre, precio_copa, precio_botella')
  .eq('restaurante_id', TARGET_ID)
if (errV) { console.error('ERROR leyendo vinos:', errV.message); process.exit(1) }
const vinoById = Object.fromEntries((vinos || []).map(v => [v.id, v]))
const vinosConBotella = (vinos || []).filter(v => Number(v.precio_botella) > 0).length
const vinosConCopa    = (vinos || []).filter(v => Number(v.precio_copa) > 0).length
console.log(`\n── (2) Vinos de Casa Marisma ────────────────────────────────────`)
console.log(`  total vinos:               ${vinos?.length || 0}`)
console.log(`  con precio_botella > 0:    ${vinosConBotella}`)
console.log(`  con precio_copa > 0:       ${vinosConCopa}`)

// ── 3) Contraste informativo con partes_servicio_lineas ─────────────────────
// No lo usamos para decidir (la cobertura es parcial: Casa Marisma solo tiene
// unos pocos partes seed), pero avisamos de la señal que hay.
let hintPartes = { copa: 0, botella: 0 }
try {
  const { data: pLines } = await supa
    .from('partes_servicio_lineas')
    .select('tipo, cantidad')
    .eq('restaurante_id', TARGET_ID)
  for (const l of (pLines || [])) {
    if (l.tipo === 'venta_copa')    hintPartes.copa    += Number(l.cantidad) || 0
    if (l.tipo === 'venta_botella') hintPartes.botella += Number(l.cantidad) || 0
  }
} catch { /* ignore */ }
console.log(`\n── (3) Pista desde partes_servicio_lineas (referencia) ──────────`)
console.log(`  venta_copa (uds. todas las fechas):    ${hintPartes.copa}`)
console.log(`  venta_botella (uds. todas las fechas): ${hintPartes.botella}`)
console.log(`  nota: solo cubre los días seed-casa-marisma-partes.mjs y no se cruza fila a fila.`)

// ── 4) Carga TODAS las estadisticas 'venta' de los últimos 30 días ─────────
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
console.log(`\n── (4) Estadísticas tipo='venta' últimos 30d: ${filas.length}`)

// ── 5) Clasificación por precio ────────────────────────────────────────────
const hace7Iso = hoyMadridIso(7)
const stats = {
  total: 0, vendidas: 0, yaConFormato: 0, actualizables: 0, sinClasificar: 0,
  sinVinoId: 0, sinPrecios: 0, importeTotal30d: 0, importeTotal7d: 0,
}
const reparto = {
  d7:  { copa: 0, botella: 0, otros: 0 },
  d30: { copa: 0, botella: 0, otros: 0 },
}
const importes = { d7: { copa: 0, botella: 0 }, d30: { copa: 0, botella: 0 } }
const updates = [] // { id, oldDetalle, newDetalle, formato, precio_unidad, en7d }
const sinClasificarSamples = []

function clasificar(precio, pBot, pCop) {
  const dB = pBot > 0 ? Math.abs(precio - pBot) / pBot : Infinity
  const dC = pCop > 0 ? Math.abs(precio - pCop) / pCop : Infinity
  const okB = dB <= TOL_BOT
  const okC = dC <= TOL_COP
  if (okB && okC) return dB <= dC ? { f: 'botella', ref: pBot } : { f: 'copa', ref: pCop }
  if (okB)        return { f: 'botella', ref: pBot }
  if (okC)        return { f: 'copa',    ref: pCop }
  return null
}

for (const row of filas) {
  stats.total += 1
  const det = parseDet(row.detalle)
  if (det.resultado && det.resultado !== 'vendida') continue
  stats.vendidas += 1
  const cantidad = Math.max(1, Number(det.cantidad) || 1)
  const importe  = Number(det.importe_vino_estimado) || 0
  const en7d = row.created_at >= hace7Iso
  stats.importeTotal30d += importe
  if (en7d) stats.importeTotal7d += importe

  // Si ya trae formato válido, lo contamos y no tocamos.
  if (det.formato_venta === 'copa' || det.formato_venta === 'botella') {
    stats.yaConFormato += 1
    const key = det.formato_venta
    reparto.d30[key] += cantidad
    importes.d30[key] += importe
    if (en7d) { reparto.d7[key] += cantidad; importes.d7[key] += importe }
    continue
  }

  // Clasificación por precio.
  if (!det.vino_id)      { stats.sinVinoId += 1; stats.sinClasificar += 1; reparto.d30.otros += cantidad; if (en7d) reparto.d7.otros += cantidad; continue }
  const v = vinoById[det.vino_id]
  const pB = Number(v?.precio_botella) || 0
  const pC = Number(v?.precio_copa) || 0
  if (pB <= 0 && pC <= 0) { stats.sinPrecios += 1; stats.sinClasificar += 1; reparto.d30.otros += cantidad; if (en7d) reparto.d7.otros += cantidad; continue }

  const precioLinea = cantidad > 0 ? importe / cantidad : 0
  if (precioLinea <= 0) {
    stats.sinClasificar += 1; reparto.d30.otros += cantidad; if (en7d) reparto.d7.otros += cantidad
    if (sinClasificarSamples.length < 3) sinClasificarSamples.push({ id: row.id, motivo: 'importe/cantidad=0' })
    continue
  }
  const dec = clasificar(precioLinea, pB, pC)
  if (!dec) {
    stats.sinClasificar += 1; reparto.d30.otros += cantidad; if (en7d) reparto.d7.otros += cantidad
    if (sinClasificarSamples.length < 3) {
      sinClasificarSamples.push({
        id: row.id, motivo: 'precio fuera de tolerancia',
        precio_linea: r2(precioLinea), precio_botella: pB, precio_copa: pC,
      })
    }
    continue
  }
  // Candidato a actualizar.
  stats.actualizables += 1
  reparto.d30[dec.f] += cantidad; importes.d30[dec.f] += importe
  if (en7d) { reparto.d7[dec.f] += cantidad; importes.d7[dec.f] += importe }
  const newDetalle = { ...det, formato_venta: dec.f, precio_unidad: r2(dec.ref) }
  updates.push({ id: row.id, newDetalle, formato: dec.f, en7d })
}

// ── 6) Informe ──────────────────────────────────────────────────────────────
console.log(`\n── (5) Resumen clasificación ─────────────────────────────────────`)
console.log(`  filas totales 30d:            ${stats.total}`)
console.log(`  vendidas (resultado):         ${stats.vendidas}`)
console.log(`  ya con formato (no se tocan): ${stats.yaConFormato}`)
console.log(`  actualizables:                ${stats.actualizables}`)
console.log(`  sin clasificar:               ${stats.sinClasificar}  (vino_id ausente=${stats.sinVinoId}, sin precios=${stats.sinPrecios})`)
console.log(`\n  Reparto en unidades:`)
console.log(`    7d:  ${reparto.d7.copa} copas · ${reparto.d7.botella} botellas · ${reparto.d7.otros} sin clasificar`)
console.log(`    30d: ${reparto.d30.copa} copas · ${reparto.d30.botella} botellas · ${reparto.d30.otros} sin clasificar`)
console.log(`\n  Reparto en importe (€):`)
console.log(`    7d:  copas=${r2(importes.d7.copa)}  botellas=${r2(importes.d7.botella)}  total=${r2(stats.importeTotal7d)}`)
console.log(`    30d: copas=${r2(importes.d30.copa)}  botellas=${r2(importes.d30.botella)}  total=${r2(stats.importeTotal30d)}`)
console.log(`\n  Invariante (debe cumplirse): el apply NO toca importe_vino_estimado ni cantidad ni fecha → total_30d queda igual: ${r2(stats.importeTotal30d)} €.`)

if (sinClasificarSamples.length) {
  console.log(`\n  Ejemplos sin clasificar (primeros ${sinClasificarSamples.length}):`)
  for (const s of sinClasificarSamples) console.log(`    · ${JSON.stringify(s)}`)
}

// Aviso de realismo: esperamos más copas en número que botellas.
if (reparto.d30.copa > 0 && reparto.d30.botella > 0 && reparto.d30.copa < reparto.d30.botella) {
  console.log(`\n  ⚠ AVISO de realismo: salen más botellas que copas en unidades. Puede ser válido`)
  console.log(`    pero si no te cuadra para la demo, revisa precio_copa/precio_botella de los vinos.`)
}

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── 7) APPLY: UPDATE fila a fila fusionando el JSON ─────────────────────────
console.log(`\n── APPLY (escribiendo ${updates.length} filas) ──────────────────`)
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

// Verificación: re-lectura + conteo rápido.
console.log('\n── Verificación tras apply ──────────────────────────────────────')
const idsSample = updates.slice(0, 3).map(u => u.id)
if (idsSample.length) {
  const { data: check } = await supa
    .from('estadisticas')
    .select('id, detalle')
    .in('id', idsSample)
  for (const row of (check || [])) {
    const det = parseDet(row.detalle)
    console.log(`  · ${row.id}  formato_venta=${det.formato_venta}  precio_unidad=${det.precio_unidad}`)
  }
}

// Conteo global tras apply (para los 30d).
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
  console.warn(`  ⚠ El importe cambió. Revísalo: el apply solo debía tocar formato_venta y precio_unidad.`)
}
console.log('\n[seed formato-ventas Casa Marisma] completado.')
