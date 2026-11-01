/**
 * yoy-graficos.mjs — SOLO LECTURA.
 *
 * Para la demo Casa Marisma 2026 vs 2025:
 *   - Reproduce la carga del endpoint /api/graficos-somm con comparar_con
 *     usando cargarAgregadoLibro + agregarGraficosSomm + calcularComparables.
 *   - Imprime las series ventas_neto y cogs_pct de ambos años + la lista
 *     comparables (esperado: [1..9]).
 *   - Mide el tiempo de respuesta con y sin comparar_con.
 *
 * Uso: node --env-file=.env.local scripts/diag/yoy-graficos.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { cargarAgregadoLibro } from '../../app/lib/libroBodegaServer.js'
import { agregarGraficosSomm } from '../../app/lib/graficosSommAgregacion.js'
import { calcularComparables } from '../../app/lib/graficosSommYoY.js'

const DEMO = '00000002-ca5a-4000-0000-000000000001'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function cargar(anio) {
  const ctx = await cargarAgregadoLibro(s, { restaurante_id: DEMO, anio, includeExtras: true })
  return agregarGraficosSomm(ctx)
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  YoY gráficos — Casa Marisma 2026 vs 2025')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

// 1) Modo clásico (solo anio)
console.log('\n── Modo CLÁSICO (solo anio=2026) ──')
const t0 = Date.now()
const serieActual = await cargar(2026)
const tClasico = Date.now() - t0
console.log(`  cargarAgregadoLibro + agregarGraficosSomm = ${tClasico} ms`)

// 2) Modo YoY (dos cargas secuenciales, como hace el route)
console.log('\n── Modo YoY (anio=2026, comparar_con=2025) ──')
const t1 = Date.now()
const sActual2 = await cargar(2026)
const sPrev    = await cargar(2025)
const comparables = calcularComparables(sActual2, sPrev)
const tYoY = Date.now() - t1
console.log(`  cargar(2026) + cargar(2025) + comparables = ${tYoY} ms`)
console.log(`  Δ YoY vs clásico = +${tYoY - tClasico} ms`)
if (tYoY - tClasico > 1500) {
  console.log('  ⚠ Supera 1,5 s; evaluar optimización (cache / fetch paralelo).')
} else {
  console.log('  ✓ Diferencia aceptable, no requiere optimización.')
}

// 3) Series y comparables
console.log('\n── Series y comparables ──')
console.log(`  comparables (meses cerrados en ambos años):`)
console.log(`    [${comparables.join(', ')}]`)

console.log('\n  ventas_neto por mes:')
console.log('  mes | 2026 actual   | 2025 prev     | comparable')
console.log('  ----+---------------+---------------+-----------')
const esc = v => v == null ? '      —  ' : String(v).padStart(10)
const comparablesSet = new Set(comparables)
const mesByMM = s => Number(String(s.mes).split('-')[1])
const sortMes = (a, b) => mesByMM(a) - mesByMM(b)
sActual2.sort(sortMes); sPrev.sort(sortMes)
const mapPrev = new Map(sPrev.map(x => [mesByMM(x), x]))
for (const row of sActual2) {
  const m = mesByMM(row)
  const p = mapPrev.get(m)
  const comp = comparablesSet.has(m) ? '  sí' : '  no'
  console.log(`  ${String(m).padStart(3)} | ${esc(row.ventas_neto)}    | ${esc(p?.ventas_neto)}    | ${comp}`)
}

console.log('\n  cogs_pct por mes:')
console.log('  mes | 2026 actual | 2025 prev   | comparable')
console.log('  ----+-------------+-------------+-----------')
for (const row of sActual2) {
  const m = mesByMM(row)
  const p = mapPrev.get(m)
  const fmt = v => v == null ? '      —  ' : (Number(v).toFixed(1) + ' %').padStart(9)
  const comp = comparablesSet.has(m) ? '  sí' : '  no'
  console.log(`  ${String(m).padStart(3)} | ${fmt(row.cogs_pct)}  | ${fmt(p?.cogs_pct)}  | ${comp}`)
}

console.log('\n✓ Verificación completa.')
