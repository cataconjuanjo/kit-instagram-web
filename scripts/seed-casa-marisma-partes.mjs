/**
 * Seed de partes de servicio de la demo Casa Marisma (Bloque 7).
 *
 * Crea 4–6 partes (mediodía/noche) en los días más recientes con ventas
 * reales para que Sala > Parte de servicio y Cierre de servicio muestren
 * contenido. Las líneas se generan a partir de las ventas existentes en
 * estadisticas (tipo='venta') de cada día/turno.
 *
 * Idempotente: upsert por (restaurante_id, fecha, turno). Si un parte ya
 * existe lo conserva (no reescribe líneas para no duplicar).
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-casa-marisma-partes.mjs            # dry-run
 *   node --env-file=.env.local scripts/seed-casa-marisma-partes.mjs --apply    # escribe
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

const TARGET_ID      = '65d26545-7c7e-424c-9c29-33bfe8bbaafa'
const TARGET_NAME_LC = 'casa marisma'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.')
  console.error('Lanza con: node --env-file=.env.local scripts/seed-casa-marisma-partes.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

// ── Averigua los últimos días con ventas (no crea fechas posteriores) ───────
const { data: ultimas, error: errU } = await supa
  .from('estadisticas')
  .select('created_at, detalle')
  .eq('restaurante_id', TARGET_ID)
  .eq('tipo', 'venta')
  .order('created_at', { ascending: false })
  .limit(500)
if (errU) { console.error('ERROR leyendo estadisticas:', errU.message); process.exit(1) }

if (!ultimas || ultimas.length === 0) {
  console.log('No hay ventas en estadisticas. Sin ventas no se pueden generar partes coherentes. Abortando sin tocar nada.')
  process.exit(0)
}

function fechaMadrid(iso) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(iso))
  return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`
}
function horaMadrid(iso) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour:'2-digit', hour12:false }).formatToParts(new Date(iso))
  return Number(h.find(x=>x.type==='hour').value)
}
function parseDetalle(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

// Agrupa ventas por fecha + turno (mediodía 06-17, noche 17-06).
const porFechaTurno = new Map() // key=fecha|turno → [{vino_id, tipo, cantidad, precio_unitario}]
for (const row of ultimas) {
  const fecha = fechaMadrid(row.created_at)
  const hora  = horaMadrid(row.created_at)
  const turno = (hora >= 6 && hora < 17) ? 'mediodia' : 'noche'
  const det = parseDetalle(row.detalle)
  if (det.resultado && det.resultado !== 'vendida') continue
  if (!det.vino_id) continue
  const key = `${fecha}|${turno}`
  if (!porFechaTurno.has(key)) porFechaTurno.set(key, [])
  porFechaTurno.get(key).push({
    vino_id: det.vino_id,
    tipo: det.formato_venta === 'copa' ? 'venta_copa' : 'venta_botella',
    cantidad: Math.max(1, Number(det.cantidad) || 1),
    precio_unitario: Number(det.importe_vino_estimado) || null,
  })
}

// Selecciona los 6 días/turno más recientes con al menos 2 líneas útiles.
const keysOrdenadas = [...porFechaTurno.entries()]
  .filter(([, lineas]) => lineas.length >= 2)
  .sort(([a], [b]) => (a < b ? 1 : -1))  // fecha desc, noche > mediodia por string
  .slice(0, 6)

if (keysOrdenadas.length === 0) {
  console.log('No hay suficientes ventas por turno para crear partes coherentes. Abortando.')
  process.exit(0)
}

// ── Construye payloads ──────────────────────────────────────────────────────
const partesPayload = keysOrdenadas.map(([key]) => {
  const [fecha, turno] = key.split('|')
  return {
    restaurante_id: TARGET_ID,
    fecha,
    turno,
    estado: 'cerrado',
    cerrado_at: new Date(`${fecha}T22:30:00+01:00`).toISOString(),
  }
})

console.log(`\n[seed Partes de Servicio Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`Partes a upsert: ${partesPayload.length}`)
for (const [k, lins] of keysOrdenadas) console.log(`  - ${k.replace('|', ' ')} → ${lins.length} líneas`)

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── Upsert cabeceras ────────────────────────────────────────────────────────
const { data: upsertedPartes, error: errP } = await supa
  .from('partes_servicio')
  .upsert(partesPayload, { onConflict: 'restaurante_id,fecha,turno' })
  .select('id, fecha, turno')
if (errP) { console.error('ERROR upsert partes_servicio:', errP.message); process.exit(1) }
console.log(`✓ partes_servicio: ${upsertedPartes.length} filas upserted.`)

// ── Líneas: solo crea si el parte no tenía ninguna (evita duplicar) ────────
const parteIndex = new Map(upsertedPartes.map(p => [`${p.fecha}|${p.turno}`, p.id]))
let totalLineasCreadas = 0

for (const [key, lineas] of keysOrdenadas) {
  const parteId = parteIndex.get(key)
  if (!parteId) continue
  const { count } = await supa
    .from('partes_servicio_lineas')
    .select('id', { count: 'exact', head: true })
    .eq('parte_id', parteId)
  if ((count || 0) > 0) {
    console.log(`  ↷ parte ${key} ya tenía ${count} líneas, no se duplican.`)
    continue
  }
  const payload = lineas.map(l => ({
    parte_id: parteId,
    restaurante_id: TARGET_ID,
    vino_id: l.vino_id,
    tipo: l.tipo,
    cantidad: l.cantidad,
    copas_vendidas: l.tipo === 'venta_copa' ? l.cantidad : null,
    precio_unitario: l.precio_unitario,
  }))
  const { error: errL } = await supa.from('partes_servicio_lineas').insert(payload)
  if (errL) { console.warn(`(aviso) ${key}: no se pudieron insertar líneas: ${errL.message}`); continue }
  totalLineasCreadas += payload.length
  console.log(`  ✓ parte ${key}: ${payload.length} líneas creadas.`)
}

console.log(`\n✓ partes_servicio_lineas: ${totalLineasCreadas} líneas creadas en total.`)
console.log('[seed Partes de Servicio Casa Marisma] completado.')
