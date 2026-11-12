/**
 * Rellena detalle.formato_venta / detalle.cantidad / detalle.precio_unidad
 * en public.estadisticas (tipo='venta', resultado='vendida') de Casa
 * Marisma donde falte, SIN cambiar importe_vino_estimado, vino_id,
 * created_at ni el resto de claves. Fusiona el JSON existente.
 *
 * Hipótesis reforzada por los datos: una fila agrega varias unidades del
 * mismo formato (copas o botellas). `importe_vino_estimado = m*precio_botella`
 * con m entero → botella; o `= k*precio_copa` con k entero → copa. Hay un
 * subset en copa con k en múltiplos de 0,5 (3,5 → 4; 6,5 → 7) que se
 * redondea al entero más cercano y se contabiliza.
 *
 * Preferencia ante ambigüedad (ambas encajan con enteros ≥1 distintos):
 * copa si k ≤ 12, botella en caso contrario.
 *
 * Idempotente, dry-run por defecto, blindado a UUID + nombre.
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
const TOL_INT  = 0.03   // tolerancia relativa al entero más cercano
const K_COPA_PREF = 12  // umbral para preferir copa en ambigüedad

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
function encajaEntero(n) {
  if (!(n > 0)) return null
  const e = Math.round(n)
  if (e < 1) return null
  const diff = Math.abs(n - e) / e
  return diff <= TOL_INT ? e : null
}
function encajaMedioEntero(n) {
  // Detecta valores como 3.5, 6.5, 8.5, ...
  if (!(n > 0)) return null
  const half = Math.round(n * 2) / 2
  if (half < 1.5) return null
  if (Math.abs(half - Math.round(half)) < 1e-9) return null  // es entero puro
  return Math.abs(n - half) / half <= TOL_INT ? half : null
}

// ── 1) Muestra de la forma del detalle ──────────────────────────────────────
console.log(`\n[seed formato-ventas Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)

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
    tiene_precio_unidad: Number(det.precio_unidad) > 0,
  }))
}

// ── 2) Vinos (id → precio_copa, precio_botella) ─────────────────────────────
const { data: vinos, error: errV } = await supa
  .from('vinos')
  .select('id, nombre, precio_copa, precio_botella')
  .eq('restaurante_id', TARGET_ID)
if (errV) { console.error('ERROR leyendo vinos:', errV.message); process.exit(1) }
const vinoById = Object.fromEntries((vinos || []).map(v => [v.id, v]))
const vinosConBot  = (vinos || []).filter(v => Number(v.precio_botella) > 0).length
const vinosConCop  = (vinos || []).filter(v => Number(v.precio_copa) > 0).length
const vinosConAmbos= (vinos || []).filter(v => Number(v.precio_botella) > 0 && Number(v.precio_copa) > 0).length
console.log(`\n── (2) Vinos Casa Marisma ───────────────────────────────────────`)
console.log(`  total vinos:                  ${vinos?.length || 0}`)
console.log(`  con precio_botella > 0:       ${vinosConBot}`)
console.log(`  con precio_copa > 0:          ${vinosConCop}`)
console.log(`  con ambos precios > 0:        ${vinosConAmbos}`)

// ── 3) Ventas 30d paginadas ─────────────────────────────────────────────────
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

// ── 4) Clasificación nueva (importe = m*precio_botella  o  k*precio_copa) ──
function clasificar(importe, pBot, pCop) {
  // Devuelve { formato, unidades, redondeado?: true } o null.
  const mB = encajaEntero(importe / (pBot || Infinity))
  const kC = encajaEntero(importe / (pCop || Infinity))
  if (mB && kC) {
    // Ambiguo con enteros ≥ 1. Preferimos copa si kC ≤ K_COPA_PREF.
    return kC <= K_COPA_PREF
      ? { formato: 'copa',    unidades: kC, ambiguo: true }
      : { formato: 'botella', unidades: mB, ambiguo: true }
  }
  if (mB) return { formato: 'botella', unidades: mB }
  if (kC) return { formato: 'copa',    unidades: kC }
  // Último intento: copa en múltiplos de 0.5 → redondeo al entero más cercano.
  const half = encajaMedioEntero(importe / (pCop || Infinity))
  if (half) {
    const redondeado = Math.round(half)
    return { formato: 'copa', unidades: redondeado, redondeado: true, half_original: half }
  }
  return null
}

const stats = {
  total: 0, vendidas: 0, yaConFormato: 0, actualizables: 0,
  sinVinoId: 0, sinPrecios: 0, importeTotal30d: 0, importeTotal7d: 0,
  redondeos: 0, ambiguos: 0,
  bucket_botella_pura: 0, bucket_copa_pura: 0, bucket_copa_media: 0, bucket_no_encaja: 0,
}
const reparto = {
  d7:  { copa: 0, botella: 0, otros: 0 },
  d30: { copa: 0, botella: 0, otros: 0 },
}
const importes = { d7: { copa: 0, botella: 0 }, d30: { copa: 0, botella: 0 } }
const updates = []
const sinClasificarSamples = []
const samplesSinCopaPrecio = [] // filas de vinos sin precio_copa (contexto)

// Buffers para los volcados pedidos en el informe.
const volcadoSinClasificar = []
const volcadoBotellaDetectada = []

for (const row of filas) {
  stats.total += 1
  const det = parseDet(row.detalle)
  if (det.resultado && det.resultado !== 'vendida') continue
  stats.vendidas += 1
  const importe = Number(det.importe_vino_estimado) || 0
  const en7d = row.created_at >= hace7Iso
  stats.importeTotal30d += importe
  if (en7d) stats.importeTotal7d += importe

  // Si ya trae formato válido, no tocar.
  if (det.formato_venta === 'copa' || det.formato_venta === 'botella') {
    stats.yaConFormato += 1
    const cant = Math.max(1, Number(det.cantidad) || 1)
    const key = det.formato_venta
    reparto.d30[key] += cant; importes.d30[key] += importe
    if (en7d) { reparto.d7[key] += cant; importes.d7[key] += importe }
    continue
  }

  if (!det.vino_id) { stats.sinVinoId += 1; stats.bucket_no_encaja += 1; continue }
  const v = vinoById[det.vino_id]
  const pB = Number(v?.precio_botella) || 0
  const pC = Number(v?.precio_copa) || 0
  if (pB <= 0 && pC <= 0) {
    stats.sinPrecios += 1; stats.bucket_no_encaja += 1
    if (sinClasificarSamples.length < 15) {
      sinClasificarSamples.push({ id: row.id, importe, cantidad_det: det.cantidad ?? null, pB, pC, motivo: 'vino sin precios' })
    }
    continue
  }
  if (pC <= 0 && samplesSinCopaPrecio.length < 5) {
    samplesSinCopaPrecio.push({ vino_id: det.vino_id, nombre: v?.nombre, precio_botella: pB })
  }

  const res = clasificar(importe, pB, pC)

  // Volcado de ejemplos para el informe (antes de decidir update).
  if (!res && volcadoSinClasificar.length < 15) {
    volcadoSinClasificar.push({
      id: row.id,
      cantidad_det: det.cantidad ?? null,
      importe,
      precio_copa: pC,
      precio_botella: pB,
      n_copa: pC > 0 ? r2(importe / pC) : null,
      n_botella: pB > 0 ? r2(importe / pB) : null,
    })
  }
  if (res && res.formato === 'botella' && volcadoBotellaDetectada.length < 10) {
    volcadoBotellaDetectada.push({
      id: row.id,
      cantidad_det: det.cantidad ?? null,
      importe,
      precio_botella: pB,
      n_botella: r2(importe / pB),
    })
  }

  if (!res) {
    stats.bucket_no_encaja += 1
    reparto.d30.otros += 1
    if (en7d) reparto.d7.otros += 1
    if (sinClasificarSamples.length < 15) {
      sinClasificarSamples.push({
        id: row.id, importe, cantidad_det: det.cantidad ?? null, pB, pC,
        n_copa: pC > 0 ? r2(importe / pC) : null,
        n_botella: pB > 0 ? r2(importe / pB) : null,
        motivo: 'ni entero·botella ni entero·copa dentro de tolerancia',
      })
    }
    continue
  }

  // Clasificación OK. Actualizamos.
  if (res.ambiguo)    stats.ambiguos += 1
  if (res.redondeado) stats.redondeos += 1
  const ref = res.formato === 'botella' ? pB : pC
  reparto.d30[res.formato] += res.unidades; importes.d30[res.formato] += importe
  if (en7d) { reparto.d7[res.formato] += res.unidades; importes.d7[res.formato] += importe }
  if (res.formato === 'botella' && !res.ambiguo) stats.bucket_botella_pura += 1
  if (res.formato === 'copa'    && !res.ambiguo && !res.redondeado) stats.bucket_copa_pura += 1
  if (res.formato === 'copa'    && res.redondeado) stats.bucket_copa_media += 1

  const newDetalle = { ...det, formato_venta: res.formato, cantidad: res.unidades, precio_unidad: r2(ref) }
  updates.push({ id: row.id, newDetalle, formato: res.formato, unidades: res.unidades, en7d, redondeado: res.redondeado })
  stats.actualizables += 1
}

// ── 5) Volcados pedidos ─────────────────────────────────────────────────────
console.log(`\n── (3a) 15 filas SIN clasificar (muestra) ───────────────────────`)
for (const s of volcadoSinClasificar) console.log('  ·', JSON.stringify(s))
if (!volcadoSinClasificar.length) console.log('  (ninguna; todas clasificadas)')

console.log(`\n── (3b) hasta 10 filas clasificadas como BOTELLA (muestra) ──────`)
for (const s of volcadoBotellaDetectada) console.log('  ·', JSON.stringify(s))
if (!volcadoBotellaDetectada.length) console.log('  (ninguna)')

if (samplesSinCopaPrecio.length) {
  console.log(`\n── (3c) vinos sin precio_copa (contexto, ${samplesSinCopaPrecio.length} ejemplos) ──`)
  for (const s of samplesSinCopaPrecio) console.log('  ·', JSON.stringify(s))
}

console.log(`\n── (4) Tabla de hipótesis (regla nueva) ─────────────────────────`)
console.log(`  botella (importe = m·precio_botella, m entero): ${stats.bucket_botella_pura}`)
console.log(`  copa    (importe = k·precio_copa,    k entero): ${stats.bucket_copa_pura}`)
console.log(`  copa    (k medio-entero → redondeado):          ${stats.bucket_copa_media}`)
console.log(`  ambiguas (encajan en los dos, prefiere copa≤${K_COPA_PREF}): ${stats.ambiguos}`)
console.log(`  no encaja (ni copa ni botella):                 ${stats.bucket_no_encaja}  (de ellas sin vino_id=${stats.sinVinoId}, sin precios=${stats.sinPrecios})`)

// ── 6) Reparto final ───────────────────────────────────────────────────────
console.log(`\n── (5) Reparto resultante ───────────────────────────────────────`)
console.log(`  unidades 7d:  ${reparto.d7.copa} copas · ${reparto.d7.botella} botellas · ${reparto.d7.otros} sin clasificar`)
console.log(`  unidades 30d: ${reparto.d30.copa} copas · ${reparto.d30.botella} botellas · ${reparto.d30.otros} sin clasificar`)
console.log(`  €        7d:  copa=${r2(importes.d7.copa)}  bot=${r2(importes.d7.botella)}  total=${r2(stats.importeTotal7d)}`)
console.log(`  €        30d: copa=${r2(importes.d30.copa)}  bot=${r2(importes.d30.botella)}  total=${r2(stats.importeTotal30d)}`)
console.log(`  invariante importe 30d (no cambia tras apply): ${r2(stats.importeTotal30d)} €`)
console.log(`  redondeos (copa medio-entero → entero): ${stats.redondeos}`)
console.log(`  ambigüedades resueltas con regla copa≤${K_COPA_PREF}: ${stats.ambiguos}`)

// Realismo: más copas que botellas en unidades.
if (reparto.d30.copa > 0 && reparto.d30.botella > 0 && reparto.d30.copa <= reparto.d30.botella) {
  console.log(`\n  ⚠ AVISO de realismo: no salen MÁS copas que botellas en 30d. No se fuerza.`)
  console.log(`    Revisa precio_copa de los vinos (${vinosConCop}/${vinos?.length} lo tienen) y la hipótesis en el informe.`)
}

if (sinClasificarSamples.length) {
  console.log(`\n  Primeros ${sinClasificarSamples.length} sin clasificar (motivo + ratios):`)
  for (const s of sinClasificarSamples) console.log('    ·', JSON.stringify(s))
}

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── 7) APPLY ───────────────────────────────────────────────────────────────
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

// ── 8) Verificación ────────────────────────────────────────────────────────
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
  console.warn(`  ⚠ El importe total cambió. Revísalo: el apply solo debía tocar formato_venta, cantidad y precio_unidad.`)
}
console.log('\n[seed formato-ventas Casa Marisma] completado.')
