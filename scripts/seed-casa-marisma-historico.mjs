/**
 * Seed de histórico y Analítica/Bonus de la demo Casa Marisma (Bloque 6).
 *
 *   - Upsertea historico_mensual con 2 años completos + año en curso:
 *     año actual - 1 (12 meses), año actual (enero..mes actual-1 completo
 *     + mes actual parcial hasta ayer).
 *   - Estacionalidad realista (verano alto, invierno bajo) pero SIEMPRE con
 *     margen_explotacion > 0 (salvo el mes en curso, que es parcial).
 *   - Upsertea presupuesto_mensual y configuracion_bonus del año en curso
 *     para que las tabs de Presupuesto y Bonus muestren contenido.
 *
 * Idempotente: upsert por PK natural. Blindado al UUID de Casa Marisma.
 * Dry-run por defecto.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-casa-marisma-historico.mjs             # dry-run
 *   node --env-file=.env.local scripts/seed-casa-marisma-historico.mjs --apply     # escribe
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
  console.error('Lanza con: node --env-file=.env.local scripts/seed-casa-marisma-historico.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: restaurante destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

const r2 = n => Math.round(Number(n) * 100) / 100

const hoyParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' })
  .formatToParts(new Date())
const hoyY = Number(hoyParts.find(p => p.type === 'year').value)
const hoyM = Number(hoyParts.find(p => p.type === 'month').value)
const hoyD = Number(hoyParts.find(p => p.type === 'day').value)

// ── Perfil anual base: ingresos mensuales con estacionalidad realista ────────
// Restaurante mediterráneo con pico de verano y repunte navidad.
// Factor relativo a la media anual (promedio = 1.00).
const PERFIL_ESTACIONAL = {
  1: 0.78, 2: 0.80, 3: 0.92, 4: 1.02, 5: 1.08, 6: 1.18,
  7: 1.32, 8: 1.38, 9: 1.22, 10: 1.00, 11: 0.88, 12: 1.12,
}

// Ingresos medios mensuales objetivo en escala de VINO (no facturación
// total del restaurante). Coherente con el volumen real de ventas de
// vino de la demo Casa Marisma; crecimiento ~10% YoY.
const INGRESOS_MEDIOS_MES = { [hoyY - 1]: 8800, [hoyY]: 9700 }

// Mix de costes sobre ingresos:
//   consumo_mp ≈ 32% ingresos
//   gastos_fijos ≈ 48% ingresos  (asegurando margen ~20%)
const RATIO_MP = 0.32
const RATIO_FIJOS = 0.48

function filaMes(anio, mes, { parcial = false, diaCorte = null } = {}) {
  const base = INGRESOS_MEDIOS_MES[anio] ?? INGRESOS_MEDIOS_MES[hoyY]
  const factor = PERFIL_ESTACIONAL[mes]
  const ingresosMes = base * factor
  const consumo = ingresosMes * RATIO_MP
  const fijos   = ingresosMes * RATIO_FIJOS

  if (parcial) {
    const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
    const d = Math.max(1, Math.min(diasMes, diaCorte || diasMes))
    const prop = (d - 1) / diasMes   // hasta "ayer"
    return {
      restaurante_id: TARGET_ID, anio, mes,
      ingresos:     r2(ingresosMes * prop),
      consumo_mp:   r2(consumo     * prop),
      gastos_fijos: r2(fijos       * prop),
      _parcial: true,
    }
  }
  return {
    restaurante_id: TARGET_ID, anio, mes,
    ingresos:     r2(ingresosMes),
    consumo_mp:   r2(consumo),
    gastos_fijos: r2(fijos),
    _parcial: false,
  }
}

// ── Construye filas ──────────────────────────────────────────────────────────
const filas = []
// Año anterior completo:
for (let m = 1; m <= 12; m++) filas.push(filaMes(hoyY - 1, m))
// Año actual: meses cerrados + mes en curso parcial.
for (let m = 1; m <= hoyM - 1; m++) filas.push(filaMes(hoyY, m))
filas.push(filaMes(hoyY, hoyM, { parcial: true, diaCorte: hoyD }))

// Sanity: ningún mes CERRADO puede quedar con margen <= 0.
let avisos = 0
for (const r of filas) {
  const margen = r.ingresos - r.consumo_mp - r.gastos_fijos
  if (!r._parcial && margen <= 0) {
    console.warn(`AVISO: margen no positivo en ${r.anio}-${r.mes}. Revisa PERFIL_ESTACIONAL/ratios.`)
    avisos++
  }
}

// ── Presupuesto del año en curso (modo YoY) ──────────────────────────────────
// Un único registro-bandera por año: usamos mes=1 con anio_base=hoyY-1 y
// factor_crecimiento_pct=10. La UI lo detecta como "modo YoY".
const presupuestoAnio = Array.from({ length: 12 }, (_, i) => ({
  restaurante_id: TARGET_ID,
  anio: hoyY,
  mes: i + 1,
  anio_base: hoyY - 1,
  factor_crecimiento_pct: 10,
  objetivo_facturacion: null,
  objetivo_mp_pct: null,
  objetivo_margen_pct: null,
}))

// ── Configuración de bonus ──────────────────────────────────────────────────
const bonusConfig = {
  restaurante_id: TARGET_ID,
  anio: hoyY,
  umbral_crecimiento_pct: 10,
  bonus_pct: 5,
  activo: true,
}

// ── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n[seed Histórico y Bonus Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`Hoy (Madrid): ${hoyY}-${String(hoyM).padStart(2,'0')}-${String(hoyD).padStart(2,'0')}`)
console.log(`historico_mensual: ${filas.length} filas (${hoyY-1} completo + ${hoyY} parcial)`)
console.log(`  primer mes:   ${filas[0].anio}-${String(filas[0].mes).padStart(2,'0')} → ingresos=${filas[0].ingresos} margen=${r2(filas[0].ingresos - filas[0].consumo_mp - filas[0].gastos_fijos)}`)
const ultimoCerrado = filas.filter(r => !r._parcial).slice(-1)[0]
console.log(`  último cerrado: ${ultimoCerrado.anio}-${String(ultimoCerrado.mes).padStart(2,'0')} → ingresos=${ultimoCerrado.ingresos} margen=${r2(ultimoCerrado.ingresos - ultimoCerrado.consumo_mp - ultimoCerrado.gastos_fijos)}`)
const mesParcial = filas.find(r => r._parcial)
console.log(`  mes en curso (parcial hasta día ${hoyD - 1}): ingresos=${mesParcial.ingresos} margen=${r2(mesParcial.ingresos - mesParcial.consumo_mp - mesParcial.gastos_fijos)}`)
console.log(`presupuesto_mensual: ${presupuestoAnio.length} filas (YoY ${hoyY}, base=${hoyY-1}, +10%)`)
console.log(`configuracion_bonus: umbral=10% bonus=5% activo=${bonusConfig.activo}`)
if (avisos > 0) console.log(`⚠ ${avisos} aviso(s) de margen. Revisa antes de --apply.`)

// ── Contraste con ventas reales ─────────────────────────────────────────────
// Suma PVP (importe_vino_estimado) de las ventas 'vendida' de la demo en su
// ventana disponible, normalizada a 30 días. Es la mejor aproximación al
// run-rate mensual real de vino.
try {
  const { data: ventasReales } = await supa
    .from('estadisticas')
    .select('created_at, detalle')
    .eq('restaurante_id', TARGET_ID)
    .eq('tipo', 'venta')
  const importes = []
  let minFecha = null, maxFecha = null
  for (const row of (ventasReales || [])) {
    let det = row.detalle
    if (typeof det === 'string') { try { det = JSON.parse(det) } catch { det = {} } }
    if (!det || det.resultado && det.resultado !== 'vendida') continue
    const imp = Number(det.importe_vino_estimado) || 0
    if (imp > 0) importes.push(imp)
    const f = (row.created_at || '').slice(0, 10)
    if (f) {
      if (!minFecha || f < minFecha) minFecha = f
      if (!maxFecha || f > maxFecha) maxFecha = f
    }
  }
  if (importes.length > 0 && minFecha && maxFecha) {
    const total = importes.reduce((s, x) => s + x, 0)
    const dias  = Math.max(1, Math.round((Date.parse(maxFecha) - Date.parse(minFecha)) / 86400000) + 1)
    const runRate30d = r2((total / dias) * 30)
    const ultimoMesSinIVA = r2(ultimoCerrado.ingresos / 1.10)
    const delta = runRate30d > 0 ? Math.abs(ultimoMesSinIVA - runRate30d) / runRate30d : 0
    console.log(`\nContraste con ventas reales (tipo='venta', resultado='vendida'):`)
    console.log(`  ventana real:        ${minFecha} → ${maxFecha} (${dias} días, ${importes.length} ventas)`)
    console.log(`  run-rate 30d PVP:    ${runRate30d} €`)
    console.log(`  último mes cerrado (sin IVA /1.10): ${ultimoMesSinIVA} €`)
    console.log(`  desviación:          ${(delta * 100).toFixed(1)}%`)
    if (delta > 0.25) {
      console.log(`  ⚠ AVISO: desviación > 25 %. Revisa INGRESOS_MEDIOS_MES[${hoyY}] antes de --apply.`)
    } else {
      console.log(`  ✓ dentro del margen esperado (≤ 25 %).`)
    }
  } else {
    console.log(`\nContraste con ventas reales: sin datos suficientes en estadisticas. Saltado.`)
  }
} catch (err) {
  console.log(`\nContraste con ventas reales: no se pudo calcular (${err.message}).`)
}

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── Aplica ───────────────────────────────────────────────────────────────────
// historico_mensual: upsert por PK (restaurante_id, anio, mes).
// Sanea el campo interno _parcial.
const filasDb = filas.map(({ _parcial, ...rest }) => rest)
const { error: errHist } = await supa
  .from('historico_mensual')
  .upsert(filasDb, { onConflict: 'restaurante_id,anio,mes' })
if (errHist) { console.error('ERROR upsert historico_mensual:', errHist.message); process.exit(1) }
console.log(`✓ historico_mensual: ${filasDb.length} filas upserted.`)

const { error: errPres } = await supa
  .from('presupuesto_mensual')
  .upsert(presupuestoAnio, { onConflict: 'restaurante_id,anio,mes' })
if (errPres) { console.error('ERROR upsert presupuesto_mensual:', errPres.message); process.exit(1) }
console.log(`✓ presupuesto_mensual: ${presupuestoAnio.length} filas upserted.`)

const { error: errBonus } = await supa
  .from('configuracion_bonus')
  .upsert(bonusConfig, { onConflict: 'restaurante_id,anio' })
if (errBonus) { console.error('ERROR upsert configuracion_bonus:', errBonus.message); process.exit(1) }
console.log(`✓ configuracion_bonus: upsert ok.`)

console.log('\n[seed Histórico y Bonus Casa Marisma] completado.')
