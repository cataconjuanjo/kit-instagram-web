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
// 1) Localiza la última venta (max created_at, hora Madrid) de tipo='venta'
//    y resultado='vendida'.
// 2) Pagina con .range() para sumar importe_vino_estimado en los 30 y 90
//    días anteriores a esa fecha (sin tope de 1 000 filas de PostgREST).
// 3) Compara con el último mes cerrado del histórico sin IVA (/1.10) y
//    avisa si la desviación supera el 25 %.
try {
  function fechaMadridIso(iso) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(iso))
    return `${p.find(x=>x.type==='year').value}-${p.find(x=>x.type==='month').value}-${p.find(x=>x.type==='day').value}`
  }
  function restarDias(fechaYmd, n) {
    const [y, m, d] = fechaYmd.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d - n, 12))
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`
  }

  // 1) Última venta vendida. Pagina hasta encontrar una.
  let ultimaFechaMadrid = null
  {
    const PAGE = 1000
    let offset = 0
    while (!ultimaFechaMadrid) {
      const { data, error } = await supa
        .from('estadisticas')
        .select('created_at, detalle')
        .eq('restaurante_id', TARGET_ID)
        .eq('tipo', 'venta')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      if (!data || data.length === 0) break
      for (const row of data) {
        let det = row.detalle
        if (typeof det === 'string') { try { det = JSON.parse(det) } catch { det = {} } }
        if (!det || (det.resultado && det.resultado !== 'vendida')) continue
        ultimaFechaMadrid = fechaMadridIso(row.created_at)
        break
      }
      if (data.length < PAGE) break
      offset += PAGE
    }
  }

  if (!ultimaFechaMadrid) {
    console.log(`\nContraste con ventas reales: no hay ventas 'vendida' en estadisticas. Saltado.`)
  } else {
    // 2) Suma paginada en una ventana [fechaInicioIso, fechaFinExclusivoIso).
    async function sumarVentana(fechaInicioYmd, fechaFinExclYmd) {
      // fechas en YYYY-MM-DD; created_at se compara como ISO; incluimos todo
      // el día de inicio y excluimos el día fin.
      const desde = `${fechaInicioYmd}T00:00:00+00:00`
      const hasta = `${fechaFinExclYmd}T00:00:00+00:00`
      const PAGE = 1000
      let offset = 0
      let total = 0
      let n = 0
      while (true) {
        const { data, error } = await supa
          .from('estadisticas')
          .select('created_at, detalle')
          .eq('restaurante_id', TARGET_ID)
          .eq('tipo', 'venta')
          .gte('created_at', desde)
          .lt('created_at', hasta)
          .order('created_at', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        for (const row of data) {
          let det = row.detalle
          if (typeof det === 'string') { try { det = JSON.parse(det) } catch { det = {} } }
          if (!det || (det.resultado && det.resultado !== 'vendida')) continue
          const imp = Number(det.importe_vino_estimado) || 0
          if (imp > 0) { total += imp; n += 1 }
        }
        if (data.length < PAGE) break
        offset += PAGE
      }
      return { total: r2(total), n }
    }

    // Ventana 30d: (última - 30, última]. Usamos [última-30, última+1) para
    // incluir la última venta completa en UTC.
    const fin30Excl = restarDias(ultimaFechaMadrid, -1)   // última + 1 día
    const ini30     = restarDias(ultimaFechaMadrid, 30)
    const ini90     = restarDias(ultimaFechaMadrid, 90)

    const w30 = await sumarVentana(ini30, fin30Excl)
    const w90 = await sumarVentana(ini90, fin30Excl)

    const runRate30d_de30  = w30.total                                    // ya son 30 días
    const runRate30d_de90  = r2((w90.total / 90) * 30)
    const ultimoMesSinIVA  = r2(ultimoCerrado.ingresos / 1.10)
    const delta30 = runRate30d_de30 > 0 ? Math.abs(ultimoMesSinIVA - runRate30d_de30) / runRate30d_de30 : 0
    const delta90 = runRate30d_de90 > 0 ? Math.abs(ultimoMesSinIVA - runRate30d_de90) / runRate30d_de90 : 0

    console.log(`\nContraste con ventas reales (tipo='venta', resultado='vendida'):`)
    console.log(`  última venta (Madrid):             ${ultimaFechaMadrid}`)
    console.log(`  ventana 30 días (${ini30} → ${ultimaFechaMadrid}):`)
    console.log(`    ventas contadas:                 ${w30.n}`)
    console.log(`    suma PVP:                        ${w30.total} €`)
    console.log(`    run-rate 30d:                    ${runRate30d_de30} €`)
    console.log(`  ventana 90 días (${ini90} → ${ultimaFechaMadrid}) normalizada a 30:`)
    console.log(`    ventas contadas:                 ${w90.n}`)
    console.log(`    suma PVP:                        ${w90.total} €`)
    console.log(`    run-rate 30d (sum/90*30):        ${runRate30d_de90} €`)
    console.log(`  último mes cerrado histórico sin IVA (/1.10): ${ultimoMesSinIVA} €`)
    console.log(`  desviación vs 30d:                 ${(delta30 * 100).toFixed(1)}%`)
    console.log(`  desviación vs 90d normalizado:     ${(delta90 * 100).toFixed(1)}%  (orientativo: mitiga estacionalidad)`)
    if (delta30 > 0.25) {
      console.log(`  ⚠ AVISO: desviación 30d > 25 %. Revisa INGRESOS_MEDIOS_MES[${hoyY}] antes de --apply.`)
    } else {
      console.log(`  ✓ 30d dentro del margen esperado (≤ 25 %).`)
    }
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
