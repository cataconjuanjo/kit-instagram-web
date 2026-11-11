/**
 * Desplaza las fechas de actividad de la demo Casa Marisma para que la
 * última venta sea AYER (zona Europe/Madrid). Bloque 10.
 *
 * Diseñado para lanzarse el día de la demo (domingo noche o lunes 16/11
 * antes de las 9:00).
 *
 * Requisito previo: aplicar sql/0011_shift_demo_activity.sql (tabla de log
 * + función RPC) y luego sql/0014_shift_demo_activity_v2.sql (v2 que
 * excluye libro_compras por el desacople periodo ↔ facturas[].fecha).
 *
 * Uso:
 *   node --env-file=.env.local scripts/shift-casa-marisma-activity.mjs             # dry-run
 *   node --env-file=.env.local scripts/shift-casa-marisma-activity.mjs --apply     # escribe
 *
 * Comportamiento:
 *   - Calcula delta = ayer_madrid - max(created_at::date) de ventas.
 *   - Si delta <= 0, no hace nada (idempotente).
 *   - Llama a la RPC shift_demo_activity_dates(target, delta, dry_run).
 *   - Tras APPLY, reescala la fila del mes en curso de historico_mensual
 *     (parcial hasta ayer) para mantener coherencia con Analítica/Bonus
 *     y la mes anterior si ha quedado parcial.
 *   - Deja registro en public.demo_activity_shift_log (lo hace la RPC).
 *
 * Seguridad:
 *   - Blindado al UUID de Casa Marisma (aborta en RPC si otro).
 *   - No lee .env.local; usa process.env (lanzar con --env-file).
 *   - Dry-run por defecto.
 *   - NO toca stock actual, catálogo, suscripción ni configuración.
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

const TARGET_ID      = '65d26545-7c7e-424c-9c29-33bfe8bbaafa'
const TARGET_NAME_LC = 'casa marisma'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.')
  console.error('Lanza con: node --env-file=.env.local scripts/shift-casa-marisma-activity.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Blindaje local ───────────────────────────────────────────────────────────
const { data: rest, error: errRest } = await supa
  .from('restaurantes')
  .select('id, nombre, slug')
  .eq('id', TARGET_ID)
  .maybeSingle()
if (errRest || !rest) { console.error('ERROR: destino no encontrado.', errRest?.message || ''); process.exit(1) }
if (String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: nombre inesperado "${rest.nombre}" para ${TARGET_ID}.`); process.exit(1)
}

const r2 = n => Math.round(Number(n) * 100) / 100

function hoyAyerMadrid() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' })
    .formatToParts(new Date())
  const y = Number(parts.find(p => p.type === 'year').value)
  const m = Number(parts.find(p => p.type === 'month').value)
  const d = Number(parts.find(p => p.type === 'day').value)
  const hoy = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  // ayer en UTC noon para evitar DST edge
  const dt = new Date(Date.UTC(y, m - 1, d - 1, 12))
  const ay = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`
  return { hoy, ayer: ay, hoyY: y, hoyM: m, hoyD: d }
}

const { hoy, ayer, hoyY, hoyM, hoyD } = hoyAyerMadrid()

// ── 1. Última venta actual ──────────────────────────────────────────────────
const { data: ultima, error: errUlt } = await supa
  .from('estadisticas')
  .select('created_at')
  .eq('restaurante_id', TARGET_ID)
  .eq('tipo', 'venta')
  .order('created_at', { ascending: false })
  .limit(1)
if (errUlt) { console.error('ERROR leyendo última venta:', errUlt.message); process.exit(1) }

const lastSaleRaw = ultima?.[0]?.created_at
if (!lastSaleRaw) {
  console.log(`[shift Casa Marisma] No hay ventas en estadisticas para ${TARGET_ID}. Nada que desplazar.`)
  process.exit(0)
}

// Convertimos created_at a fecha Madrid
const lastSaleMadrid = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' })
  .formatToParts(new Date(lastSaleRaw))
const lsY = Number(lastSaleMadrid.find(p => p.type === 'year').value)
const lsM = Number(lastSaleMadrid.find(p => p.type === 'month').value)
const lsD = Number(lastSaleMadrid.find(p => p.type === 'day').value)
const lastSale = `${lsY}-${String(lsM).padStart(2,'0')}-${String(lsD).padStart(2,'0')}`

// delta_dias = ayer - lastSale
const msDia = 86400000
const deltaDias = Math.round((Date.UTC(hoyY, hoyM - 1, hoyD - 1) - Date.UTC(lsY, lsM - 1, lsD)) / msDia)

console.log(`\n[shift Casa Marisma] ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo:                 ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`Hoy (Madrid):         ${hoy}`)
console.log(`Ayer (objetivo):      ${ayer}`)
console.log(`Última venta actual:  ${lastSale}`)
console.log(`delta_dias calculado: ${deltaDias}`)

if (deltaDias <= 0) {
  console.log(`\nNo hay nada que desplazar (delta ≤ 0). Idempotente OK.`)
  // Aun así registra en log para auditar la ejecución.
  const { error } = await supa.rpc('shift_demo_activity_dates', {
    p_target_id: TARGET_ID, p_delta_dias: deltaDias, p_dry_run: !APPLY,
  })
  if (error) console.warn('(aviso) no se pudo registrar log:', error.message)
  process.exit(0)
}

// ── 2. Llama RPC ────────────────────────────────────────────────────────────
const { data: rpcOut, error: errRpc } = await supa.rpc('shift_demo_activity_dates', {
  p_target_id: TARGET_ID,
  p_delta_dias: deltaDias,
  p_dry_run: !APPLY,
})
if (errRpc) { console.error('ERROR RPC shift_demo_activity_dates:', errRpc.message); process.exit(1) }

console.log('\nResultado RPC:')
console.log(JSON.stringify(rpcOut, null, 2))

// v2: libro_compras queda intencionalmente FUERA del shift para evitar
// desacoplar `periodo` (YYYY-MM) de `facturas[].fecha`. El seed del
// Bloque 2 ya lo dejó con fechas verosímiles dentro de cada periodo
// de los últimos 6 meses. Si en la UI ves un aviso de "futuro" en el
// Libro de Compras, significa que estás ejecutando la v1 (0011 sin 0014):
// aplica sql/0014_shift_demo_activity_v2.sql para corregirlo.
const lcNote = rpcOut?.notes?.libro_compras
if (lcNote) console.log(`\nNota libro_compras: ${lcNote}`)

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── 3. Reescala filas de historico_mensual afectadas ────────────────────────
// Tras el shift, el mes-en-curso debe seguir siendo parcial hasta "ayer".
// Si el shift cruza un fin de mes, el mes anterior puede haber quedado
// con datos reales incompletos. Aquí NO leemos ventas; reescalamos el
// agregado proporcional al día del mes para que cuadre visualmente.

const PERFIL = { 1:0.78,2:0.80,3:0.92,4:1.02,5:1.08,6:1.18,7:1.32,8:1.38,9:1.22,10:1.00,11:0.88,12:1.12 }
const INGRESOS_MEDIOS_MES = 48500   // mismo valor que Block 6 para hoyY
const RATIO_MP = 0.32, RATIO_FIJOS = 0.48

function filaParcialHistorico(anio, mes, diaCorte) {
  const factor = PERFIL[mes] ?? 1
  const ingresosMes = INGRESOS_MEDIOS_MES * factor
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const prop = Math.max(0, Math.min(1, (diaCorte - 1) / diasMes))
  return {
    restaurante_id: TARGET_ID, anio, mes,
    ingresos:     r2(ingresosMes * prop),
    consumo_mp:   r2(ingresosMes * RATIO_MP * prop),
    gastos_fijos: r2(ingresosMes * RATIO_FIJOS * prop),
  }
}

// Mes en curso parcial hasta día (hoyD - 1) = ayer.
const filaActual = filaParcialHistorico(hoyY, hoyM, hoyD)

// Mes anterior: lo dejamos COMPLETO si ya está cerrado (día 1 del mes actual
// implica que el mes anterior está entero). Si delta ha desplazado datos
// al mes anterior parcialmente no lo tocamos aquí: se mantiene lo que
// pusiera el seed Block 6 (cerrado completo).

const { error: errHist } = await supa
  .from('historico_mensual')
  .upsert([filaActual], { onConflict: 'restaurante_id,anio,mes' })
if (errHist) { console.error('ERROR upsert historico_mensual (mes en curso):', errHist.message); process.exit(1) }
console.log(`\n✓ historico_mensual[${hoyY}-${String(hoyM).padStart(2,'0')}] reescalado a parcial (día ${hoyD - 1}).`)

// Reescala también parametros_explotacion[mes en curso] proporcional.
const { data: paramRow } = await supa
  .from('parametros_explotacion')
  .select('id, facturacion_total, consumo_mp')
  .eq('restaurante_id', TARGET_ID)
  .eq('periodo', `${hoyY}-${String(hoyM).padStart(2,'0')}`)
  .maybeSingle()

if (paramRow) {
  const diasMes = new Date(Date.UTC(hoyY, hoyM, 0)).getUTCDate()
  const prop = Math.max(0, Math.min(1, (hoyD - 1) / diasMes))
  const facMes = r2(INGRESOS_MEDIOS_MES * (PERFIL[hoyM] ?? 1) * prop)
  const consMes = r2(INGRESOS_MEDIOS_MES * (PERFIL[hoyM] ?? 1) * RATIO_MP * prop)
  const { error: errP } = await supa
    .from('parametros_explotacion')
    .update({ facturacion_total: facMes, consumo_mp: consMes })
    .eq('restaurante_id', TARGET_ID)
    .eq('periodo', `${hoyY}-${String(hoyM).padStart(2,'0')}`)
  if (errP) console.warn('(aviso) no se pudo reescalar parametros_explotacion:', errP.message)
  else console.log(`✓ parametros_explotacion[${hoyY}-${String(hoyM).padStart(2,'0')}] reescalado parcial.`)
}

console.log('\n[shift Casa Marisma] completado. Log en public.demo_activity_shift_log.')
