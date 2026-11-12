/**
 * Diagnóstico SOLO LECTURA: cuenta cómo viene el campo formato_venta en
 * las ventas de Casa Marisma de los últimos 7 y 30 días (zona Madrid).
 *
 * Ayuda a confirmar por qué la tarjeta "Ventas de los últimos 7 días" del
 * dashboard no muestra el desglose copa/botella: si las ventas llegan con
 * formato_venta='desconocido' o null (típico en imports POS sin match
 * fiable), los contadores salen a 0 y la UI cae al fallback de solo euros.
 *
 * NO escribe. Dry-run obligatorio. Lanza con:
 *   node --env-file=.env.local scripts/diag-ventas-formato-casa-marisma.mjs
 */
import { createClient } from '@supabase/supabase-js'

const TARGET_ID      = '65d26545-7c7e-424c-9c29-33bfe8bbaafa'
const TARGET_NAME_LC = 'casa marisma'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.')
  console.error('Lanza con: node --env-file=.env.local scripts/diag-ventas-formato-casa-marisma.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

function haceDiasIso(n) {
  // yesterday-boundary en Europe/Madrid; comparamos como ISO UTC sin TZ.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date())
  const y = Number(parts.find(p => p.type === 'year').value)
  const m = Number(parts.find(p => p.type === 'month').value)
  const d = Number(parts.find(p => p.type === 'day').value)
  const dt = new Date(Date.UTC(y, m - 1, d - n, 0))
  return dt.toISOString()
}

async function cargarVentas(desdeIso) {
  const PAGE = 1000
  let offset = 0
  const out = []
  while (true) {
    const { data, error } = await supa
      .from('estadisticas')
      .select('created_at, detalle')
      .eq('restaurante_id', TARGET_ID)
      .eq('tipo', 'venta')
      .gte('created_at', desdeIso)
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

function parseDet(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return {} }
}

async function resumen(rangoLabel, desdeIso) {
  const filas = await cargarVentas(desdeIso)
  const buckets = { copa: 0, botella: 0, desconocido: 0, otro: 0, vacio: 0 }
  let vendidas = 0
  let ventasConPrecioUnit = 0
  let eurosTotal = 0
  const samples = { otro: [], vacio: [] }
  for (const row of filas) {
    const det = parseDet(row.detalle)
    if (det.resultado !== 'vendida') continue
    vendidas += 1
    const fv = det.formato_venta
    const key = fv === 'copa' ? 'copa'
              : fv === 'botella' ? 'botella'
              : fv === 'desconocido' ? 'desconocido'
              : (fv == null || fv === '') ? 'vacio'
              : 'otro'
    buckets[key] += Number(det.cantidad) || 1
    if (Number(det.precio_unidad) > 0) ventasConPrecioUnit += 1
    if (Number(det.importe_vino_estimado) > 0) eurosTotal += Number(det.importe_vino_estimado)
    if (key === 'otro' && samples.otro.length < 3) samples.otro.push(fv)
    if (key === 'vacio' && samples.vacio.length < 3) samples.vacio.push({ precio_unidad: det.precio_unidad, precio_recomendado: det.precio_recomendado, precio_copa_recomendado: det.precio_copa_recomendado })
  }
  console.log(`\n── ${rangoLabel} ──  (filas 'venta' totales: ${filas.length}, 'vendida': ${vendidas})`)
  console.log(`  copas registradas:          ${buckets.copa}`)
  console.log(`  botellas registradas:       ${buckets.botella}`)
  console.log(`  formato 'desconocido':      ${buckets.desconocido}`)
  console.log(`  formato VACÍO (null/''):    ${buckets.vacio}`)
  console.log(`  formato OTRO (${samples.otro.join('/') || '—'}):${' '.repeat(Math.max(1, 15 - (samples.otro.join('/').length || 1)))}${buckets.otro}`)
  console.log(`  ventas con precio_unidad:   ${ventasConPrecioUnit}  (habilita el fallback por precio)`)
  console.log(`  importe en vino estimado:   ${eurosTotal.toFixed(2)} €`)
  if (samples.vacio.length) {
    console.log(`  ejemplo precios en ventas sin formato:`)
    for (const s of samples.vacio) console.log(`    · precio_unidad=${s.precio_unidad} precio_recomendado=${s.precio_recomendado} precio_copa_recomendado=${s.precio_copa_recomendado}`)
  }
}

console.log(`[diag] destino: ${rest.nombre} (${TARGET_ID})`)
await resumen('últimos 7 días',  haceDiasIso(7))
await resumen('últimos 30 días', haceDiasIso(30))
console.log(`\nInterpretación:`)
console.log(`  · Si copas+botellas > 0 en 7d, la tarjeta debería mostrar el desglose tras este PR.`)
console.log(`  · Si copas+botellas = 0 pero ventas con precio_unidad > 0, el fallback por precio del PR las clasificará.`)
console.log(`  · Si ambos a 0, la tarjeta mostrará '{N} uds. · formato sin registrar en TPV' debajo del importe.`)
