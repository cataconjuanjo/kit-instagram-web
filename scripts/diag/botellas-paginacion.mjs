#!/usr/bin/env node
/**
 * botellas-paginacion.mjs — SOLO LECTURA. Verificación del hotfix de
 * paginación en calcularMesBodega.
 *
 * Para cada mes 2025-01..2026-10 (o el rango que se pase):
 *   · Recalcula el snapshot con el código corregido (paginado).
 *   · Lo compara con el snapshot almacenado en cierres_mensuales_bodega.
 *   · Imprime una tabla de diferencias por mes para los campos clave:
 *       ventas_neto, compras_netas, coste_ventas_teorico, merma_copa_eur,
 *       diferencias_inventario, stock_inicial, stock_final, resultado.
 *
 * Expectativa (demo Casa Marisma):
 *   · 2026-10: merma_copa_eur sube de ~988€ a ~5452€ (×5.5) por
 *     paginación de botellas_abiertas; resultado baja ~−4464€.
 *   · 2025-01..2026-09: sin diferencias (todos los meses tenían <1000
 *     botellas cerradas por rango de fecha → la paginación no cambia nada).
 *
 * Uso:
 *   node --env-file=.env.local scripts/diag/botellas-paginacion.mjs \
 *        [restaurante_id] [mes_desde] [mes_hasta]
 *
 * Defaults:
 *   restaurante_id = 00000002-ca5a-4000-0000-000000000001 (demo Casa Marisma)
 *   mes_desde      = 2025-01
 *   mes_hasta      = 2026-10
 *
 * NO escribe en BD. Idempotente.
 */

import { createClient } from '@supabase/supabase-js'
import { calcularMesBodega } from '../../app/lib/agregarPeriodoBodega.js'

const RESTAURANTE_ID = process.argv[2] || '00000002-ca5a-4000-0000-000000000001'
const MES_DESDE      = process.argv[3] || '2025-01'
const MES_HASTA      = process.argv[4] || '2026-10'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridas.')
  process.exit(1)
}
const supabase = createClient(url, key)

// ── Helpers ──────────────────────────────────────────────────────────────────
function* mesesEntre(desde, hasta) {
  let [y, m] = desde.split('-').map(Number)
  const [yH, mH] = hasta.split('-').map(Number)
  while (y < yH || (y === yH && m <= mH)) {
    yield `${y}-${String(m).padStart(2, '0')}`
    m++; if (m > 12) { m = 1; y++ }
  }
}

function fmt(n) {
  if (n == null) return '    —  '
  const r = Math.round(Number(n))
  return String(r).padStart(7)
}
function diff(a, b) {
  if (a == null || b == null) return '   —  '
  const d = Math.round(Number(a) - Number(b))
  const str = (d > 0 ? '+' : '') + d
  return str.padStart(6)
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`\n═════════════════════════════════════════════════════════════════════════════`)
console.log(`  DIAG — botellas-paginacion.mjs (SOLO LECTURA)`)
console.log(`  restaurante_id : ${RESTAURANTE_ID}`)
console.log(`  rango           : ${MES_DESDE} → ${MES_HASTA}`)
console.log(`═════════════════════════════════════════════════════════════════════════════\n`)

const meses = [...mesesEntre(MES_DESDE, MES_HASTA)]

// Pre-fetch snapshots almacenados (una query)
const { data: cierres } = await supabase
  .from('cierres_mensuales_bodega')
  .select('mes, snapshot')
  .eq('restaurante_id', RESTAURANTE_ID)
  .in('mes', meses)

const snapByMes = Object.fromEntries((cierres || []).map(c => [c.mes, c.snapshot || {}]))

console.log('mes       ventas_neto       coste_teo        merma_copa      resultado')
console.log('          (bd / recalc)    (bd / recalc)    (bd / recalc)   (bd / recalc)     Δmerma   Δresult')
console.log('─'.repeat(109))

const diferenciasRelevantes = []

for (const mes of meses) {
  // eslint-disable-next-line no-await-in-loop
  const recalc = await calcularMesBodega({ restaurante_id: RESTAURANTE_ID, mes, supabase })
  const bd     = snapByMes[mes] || {}

  const vnB = bd.ventas_neto, vnR = recalc.ventas_neto
  const ctB = bd.coste_ventas_teorico, ctR = recalc.coste_ventas_teorico
  const mcB = bd.merma_copa_eur, mcR = recalc.merma_copa_eur
  const rsB = bd.resultado, rsR = recalc.resultado

  const dMerma = (mcB != null && mcR != null) ? Math.round(mcR - mcB) : null
  const dRes   = (rsB != null && rsR != null) ? Math.round(rsR - rsB) : null

  console.log(
    `${mes}   ${fmt(vnB)} / ${fmt(vnR)}   ${fmt(ctB)} / ${fmt(ctR)}   ` +
    `${fmt(mcB)} / ${fmt(mcR)}   ${fmt(rsB)} / ${fmt(rsR)}   ${diff(mcR, mcB)}  ${diff(rsR, rsB)}`
  )

  // Flagear si hay diferencia material (>1€ en cualquiera de los 4)
  const materiales = [
    ['ventas_neto',          vnB, vnR],
    ['coste_ventas_teorico', ctB, ctR],
    ['merma_copa_eur',       mcB, mcR],
    ['resultado',            rsB, rsR],
    ['compras_netas',        bd.compras_netas,         recalc.compras_netas],
    ['diferencias_inventario', bd.diferencias_inventario, recalc.diferencias_inventario],
    ['stock_inicial',        bd.stock_inicial,         recalc.stock_inicial],
    ['stock_final',          bd.stock_final,           recalc.stock_final],
  ]
  for (const [campo, b, r] of materiales) {
    if (b == null && r == null) continue
    const d = Number(r || 0) - Number(b || 0)
    if (Math.abs(d) > 1) {
      diferenciasRelevantes.push({ mes, campo, bd: b, recalc: r, delta: Math.round(d) })
    }
  }
}

console.log('─'.repeat(109))

if (diferenciasRelevantes.length === 0) {
  console.log('\n✓ Ningún mes del rango presenta diferencias materiales (>1€). Hotfix seguro para meses cerrados.')
} else {
  console.log(`\n⚠ ${diferenciasRelevantes.length} diferencia(s) material(es) detectada(s):\n`)
  console.log('  mes       campo                     bd           recalc       delta')
  console.log('  ' + '─'.repeat(72))
  for (const d of diferenciasRelevantes) {
    console.log(
      `  ${d.mes}   ${String(d.campo).padEnd(22)}  ${fmt(d.bd)}      ${fmt(d.recalc)}    ${String(d.delta).padStart(6)}`
    )
  }
  console.log('\nEsperado tras el hotfix:')
  console.log('  · Diferencias SOLO en los meses donde botellas_abiertas superaba 1000')
  console.log('    cerradas (en la demo: solo 2026-10). Resto debería estar en 0 ±1€.')
  console.log('  · Si aparecen diffs en otros campos (ventas_neto, compras_netas, etc.)')
  console.log('    el bug no es solo paginación — revisar antes de aplicar nada.')
}

process.exit(0)
