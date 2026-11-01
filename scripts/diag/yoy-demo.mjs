/**
 * yoy-demo.mjs — SOLO LECTURA. Imprime los cálculos YoY que vería la
 * pestaña Histórico de analitica-somm para la demo Casa Marisma.
 *
 * Dos columnas: ANTES (algoritmo in-line actual de analitica-somm) y
 * DESPUÉS (helper puro app/lib/yoyAgregacion.js). El refactor debe
 * dejar las cifras IDÉNTICAS para los perfiles existentes.
 *
 * Uso: node --env-file=.env.local scripts/diag/yoy-demo.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { calcularYoY, mesesComparables } from '../../app/lib/yoyAgregacion.js'

const DEMO = '00000002-ca5a-4000-0000-000000000001'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: hist } = await s.from('historico_mensual')
  .select('anio,mes,ingresos,consumo_mp,pct_mp,gastos_fijos,margen_explotacion')
  .eq('restaurante_id', DEMO)
  .order('anio').order('mes')

const anios = [...new Set((hist || []).map(h => h.anio))].sort()
const porAnioMes = {}
for (const h of hist || []) porAnioMes[`${h.anio}-${h.mes}`] = h

// ── Replicar EXACTO el algoritmo in-line de analitica-somm/page.js:201-213 ──
function antesYoYIngresosAnual(anio) {
  const metros = (porAnioMes_set, anio) => {
    const m = new Set()
    for (const k of Object.keys(porAnioMes_set)) {
      const [a, mes] = k.split('-')
      if (parseInt(a) === anio) m.add(parseInt(mes))
    }
    return m
  }
  const dSet  = metros(porAnioMes, anio)
  const daSet = metros(porAnioMes, anio - 1)
  const commonMeses = [...dSet].filter(m => daSet.has(m)).sort((a, b) => a - b)
  if (!commonMeses.length) return { yoy: null, meses: commonMeses }
  const ingN   = commonMeses.reduce((s, m) => s + (porAnioMes[`${anio}-${m}`]?.ingresos || 0), 0)
  const ingAnt = commonMeses.reduce((s, m) => s + (porAnioMes[`${anio - 1}-${m}`]?.ingresos || 0), 0)
  const yoy = ingAnt ? Math.round(((ingN - ingAnt) / ingAnt) * 1000) / 10 : null
  return { yoy, ingN, ingAnt, meses: commonMeses }
}

// ── Replicar el YoY por mes de analitica-somm/page.js:131,150 ──
function antesYoYPorMes(anio) {
  const salida = []
  for (let m = 1; m <= 12; m++) {
    const actual   = porAnioMes[`${anio}-${m}`]
    const anterior = porAnioMes[`${anio - 1}-${m}`]
    if (!actual) continue
    const ing  = actual.ingresos
    const ingP = anterior?.ingresos
    const yoyIng = ingP ? Math.round(((ing - ingP) / ingP) * 1000) / 10 : null
    const margen       = actual.margen_explotacion ?? (actual.ingresos - actual.consumo_mp - actual.gastos_fijos)
    const margenPrev   = anterior ? (anterior.margen_explotacion ?? anterior.ingresos - anterior.consumo_mp - anterior.gastos_fijos) : null
    const yoyMargen = margenPrev ? Math.round(((margen - margenPrev) / Math.abs(margenPrev)) * 1000) / 10 : null
    salida.push({ mes: m, ingresos: ing, yoyIng, margen, yoyMargen })
  }
  return salida
}

// ── Preparar inputs para el helper ────────────────────────────────────────
function filas(anio) {
  return (hist || []).filter(h => h.anio === anio).map(h => ({
    anio: h.anio, mes: h.mes,
    ingresos:            Number(h.ingresos)            || 0,
    consumo_mp:          Number(h.consumo_mp)          || 0,
    pct_mp:              Number(h.pct_mp)              || 0,
    margen_explotacion:  Number(h.margen_explotacion ?? h.ingresos - h.consumo_mp - h.gastos_fijos) || 0,
  }))
}

const ANIO_ACTUAL  = 2026
const ANIO_PREVIO  = 2025
const HOY = { anio: 2026, mes: 10 }   // mes en curso en el demo (sep cerrado, oct abierto)

const DESPUES = calcularYoY({
  actual: filas(ANIO_ACTUAL),
  prev:   filas(ANIO_PREVIO),
  metricas: [
    { key: 'ingresos',           tipo: 'importe' },
    { key: 'consumo_mp',         tipo: 'importe' },
    { key: 'margen_explotacion', tipo: 'importe' },
    { key: 'pct_mp',             tipo: 'ratio'   },
  ],
  mesActualHoy: HOY,
})

// ── Imprimir ───────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════')
console.log(` YoY Demo Casa Marisma — ${ANIO_ACTUAL} vs ${ANIO_PREVIO}`)
console.log(`  mesActualHoy = ${HOY.anio}-${String(HOY.mes).padStart(2,'0')} (excluido del YTD)`)
console.log('═══════════════════════════════════════════════════════════════════\n')

const antesAnual = antesYoYIngresosAnual(ANIO_ACTUAL)
console.log('── Resumen anual YoY sobre meses comunes ─────────────────────────')
console.log(`  ANTES:   meses = [${antesAnual.meses.join(',')}]`)
console.log(`  DESPUÉS: meses = [${DESPUES.meses.join(',')}]`)
console.log(`  mesesComparables helper:`, mesesComparables(filas(ANIO_ACTUAL), filas(ANIO_PREVIO), { mesActualHoy: HOY }))
console.log(`\n  ANTES   YoY ingresos anual: ${antesAnual.yoy}%  (actual=${antesAnual.ingN}, prev=${antesAnual.ingAnt})`)
console.log(`  DESPUÉS YoY ingresos YTD:  delta=${DESPUES.ytd.ingresos.delta} €  deltaPct=${DESPUES.ytd.ingresos.deltaPct}%`)
console.log(`  DESPUÉS YTD actual  = ${DESPUES.ytd.ingresos.valor} €`)
console.log(`  DESPUÉS YTD previo  = ${DESPUES.ytd.ingresos.valorPrev} €`)
if (DESPUES.ytd.ingresos.deltaPct !== antesAnual.yoy) {
  console.log('  ⚠ DIFERENCIA en el YoY anual de ingresos')
} else {
  console.log('  ✓ YoY anual de ingresos IDÉNTICO')
}

console.log('\n── YoY por mes (ingresos y margen) ───────────────────────────────')
const antesMes = antesYoYPorMes(ANIO_ACTUAL)
const fmtPct = v => v == null ? '    —  ' : (v >= 0 ? '+' : '') + v.toFixed(1).padStart(5) + '%'
const fmtEur = v => (v == null ? '  —' : v.toLocaleString('es-ES')).padStart(10)
console.log('  mes | ANTES ing / yoy      | DESPUÉS ing / yoy    | ANTES marg / yoy    | DESPUÉS marg / yoy')
console.log('  ----+----------------------+----------------------+---------------------+--------------------')
let diffs = 0
for (const r of antesMes) {
  const d = DESPUES.porMes.ingresos[r.mes]
  const dM = DESPUES.porMes.margen_explotacion[r.mes]
  const antYoyIng    = r.yoyIng
  const despYoyIng   = d?.deltaPct
  const antYoyMargen = r.yoyMargen
  const despYoyMarg  = dM?.deltaPct
  // Comparar con pequeña tolerancia por redondeo r2 vs round*1000/10
  const diffIng  = (antYoyIng == null) !== (despYoyIng == null) || Math.abs((antYoyIng ?? 0) - (despYoyIng ?? 0)) > 0.1
  const diffMarg = (antYoyMargen == null) !== (despYoyMarg == null) || Math.abs((antYoyMargen ?? 0) - (despYoyMarg ?? 0)) > 0.1
  if (diffIng || diffMarg) diffs++
  console.log(`  ${String(r.mes).padStart(3)} | ${fmtEur(r.ingresos)} ${fmtPct(antYoyIng)} | ${fmtEur(d?.valor)} ${fmtPct(despYoyIng)} | ${fmtEur(r.margen)} ${fmtPct(antYoyMargen)} | ${fmtEur(dM?.valor)} ${fmtPct(despYoyMarg)} ${diffIng||diffMarg?' ⚠':''}`)
}
console.log(`\n  → ${diffs} mes(es) con diferencias por-mes. ${diffs === 0 ? '✓ IDÉNTICO.' : '⚠ REVISAR.'}`)

console.log('\n── KPI YTD DESPUÉS (todas las métricas) ──────────────────────────')
for (const k of ['ingresos','consumo_mp','margen_explotacion','pct_mp']) {
  const y = DESPUES.ytd[k]
  const unidad = y.tipo === 'ratio' ? ' pp' : (k === 'pct_mp' ? ' pp' : ' €')
  const pctStr = y.deltaPct == null ? '—' : (y.deltaPct >= 0 ? '+' : '') + y.deltaPct + '%'
  console.log(`  ${k.padEnd(22)}: ${String(y.valor).padStart(10)} vs ${String(y.valorPrev).padStart(10)}  Δ=${String(y.delta).padStart(8)}${unidad}  Δ%=${pctStr}`)
}
console.log(`\n  Etiqueta meses YTD: Ene–${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][DESPUES.meses[DESPUES.meses.length-1]-1]}  (${DESPUES.meses.length} meses)`)

console.log('\n── Mes en curso (visible por-mes, EXCLUIDO del YTD) ─────────────')
const mesAbierto = HOY.mes
const abierto = DESPUES.porMes.ingresos[mesAbierto]
if (abierto) {
  console.log(`  ${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][mesAbierto-1]} en curso (parcial):`)
  console.log(`    ingresos:   ${abierto.valor} € (prev: ${abierto.valorPrev ?? '—'})`)
  console.log(`    consumo_mp: ${DESPUES.porMes.consumo_mp[mesAbierto]?.valor} €`)
} else {
  console.log(`  ${mesAbierto} no tiene fila en historico_mensual (todavía sin dato en el mes abierto).`)
}
