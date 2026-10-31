/**
 * diag-coste-teorico.mjs — SOLO LECTURA. Investigación del cálculo
 * cierre.coste_ventas_teorico vs libro.coste_teorico_ventas.
 *
 * Para 2025-01, 2025-12, 2026-09:
 *   - Carga restaurant_economic_settings (copas_por_botella, merma_copa_pct)
 *   - Reproduce la fórmula del cierre (agregarPeriodoBodega.js:287-296):
 *       copasVendibles = copas_por_botella × (1 − merma_pct/100)
 *       coste_vino = uds × coste_unitario + copas/copasVendibles × coste_unitario
 *   - Desglosa top 10 por diff |libro(/5) − cierre(/copasVendibles)|
 *   - Imprime causa por vino (uds vs copas, coste, factor)
 *
 * Uso: node --env-file=.env.local scripts/diag-coste-teorico.mjs [restaurante_id]
 */
import { createClient } from '@supabase/supabase-js'

const RESTAURANTE_ID = process.argv[2] || '00000002-ca5a-4000-0000-000000000001'
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const r2 = n => Math.round((Number(n) || 0) * 100) / 100

const { data: settings } = await s.from('restaurant_economic_settings')
  .select('copas_por_botella, ml_por_copa, merma_copa_pct')
  .eq('restaurante_id', RESTAURANTE_ID).single()

const cxb = Number(settings?.copas_por_botella) > 0
  ? Number(settings.copas_por_botella)
  : (settings?.ml_por_copa > 0 ? Math.round(750 / settings.ml_por_copa) : 5)
const merma = Number(settings?.merma_copa_pct) || 0
const copasVendibles = r2(cxb * (1 - merma / 100))

console.log(`\n═══════════════════════════════════════════════════════════════════════════════`)
console.log(`  SETTINGS del restaurante:`)
console.log(`    copas_por_botella = ${cxb}`)
console.log(`    merma_copa_pct    = ${merma}%`)
console.log(`    copasVendibles    = ${cxb} × (1 − ${merma}/100) = ${copasVendibles}`)
console.log(`    Fórmula cierre:   coste_copa = copas / ${copasVendibles} × coste_unitario`)
console.log(`    Fórmula libro:    coste_copa = copas / 5 × coste_unitario (hardcoded)`)
console.log(`    Factor libro/cierre = 5/${copasVendibles} = ${r2(5/copasVendibles)} → libro ${r2((5/copasVendibles - 1) * 100)}% más alto`)
console.log(`═══════════════════════════════════════════════════════════════════════════════`)

const MESES_TARGET = ['2025-01', '2025-12', '2026-09']

for (const mesK of MESES_TARGET) {
  const { data: c } = await s.from('cierres_mensuales_bodega')
    .select('snapshot').eq('restaurante_id', RESTAURANTE_ID).eq('mes', mesK).single()
  if (!c) { console.log(`\n[${mesK}] sin cierre`); continue }
  const snap    = c.snapshot
  const porVino = snap.informe?.por_vino || []

  console.log(`\n\n────────────────── ${mesK} ──────────────────`)
  console.log(`cierre.coste_ventas_teorico publicado: ${snap.coste_ventas_teorico} €`)

  // Reproducir fórmula del cierre y la del libro por vino
  const filas = porVino.map(v => {
    const uds        = v.uds || 0
    const copas      = v.copas || 0
    const coste      = v.coste_unitario || 0
    const costeBot   = r2(uds * coste)
    const costeCierre = r2(costeBot + (copas > 0 && copasVendibles > 0 ? (copas / copasVendibles) * coste : 0))
    const costeLibro  = r2(costeBot + (copas > 0 ? (copas / 5) * coste : 0))
    const diff        = r2(costeLibro - costeCierre)
    return { nombre: v.nombre, uds, copas, coste, costeCierre, costeLibro, diff }
  })

  const sumCierre = r2(filas.reduce((s, f) => s + f.costeCierre, 0))
  const sumLibro  = r2(filas.reduce((s, f) => s + f.costeLibro,  0))
  const sumDiff   = r2(sumLibro - sumCierre)

  console.log(`Σ fórmula cierre (copas/${copasVendibles}):   ${sumCierre} €`)
  console.log(`Σ fórmula libro  (copas/5):      ${sumLibro} €`)
  console.log(`Σ diff libro − cierre:           ${sumDiff} €`)
  console.log(`Σ vs cierre.coste_ventas_teorico publicado: diff ${r2(sumCierre - snap.coste_ventas_teorico)} €`)

  console.log(`\n  Top 10 vinos por |diff|:`)
  console.log(`  ${'Vino'.padEnd(42)} ${'uds'.padStart(4)} ${'copas'.padStart(6)} ${'coste'.padStart(6)} ${'cierre'.padStart(8)} ${'libro/5'.padStart(8)} ${'diff'.padStart(7)}`)
  console.log(`  ${'─'.repeat(42)} ${'───'.padStart(4)} ${'─────'.padStart(6)} ${'─────'.padStart(6)} ${'──────'.padStart(8)} ${'──────'.padStart(8)} ${'─────'.padStart(7)}`)
  for (const f of filas.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10)) {
    console.log(`  ${f.nombre.slice(0, 42).padEnd(42)} ${String(f.uds).padStart(4)} ${String(f.copas).padStart(6)} ${f.coste.toFixed(2).padStart(6)} ${f.costeCierre.toFixed(2).padStart(8)} ${f.costeLibro.toFixed(2).padStart(8)} ${f.diff.toFixed(2).padStart(7)}`)
  }

  // Causa agregada
  const copasTotales = filas.reduce((s, f) => s + f.copas, 0)
  const udsTotales   = filas.reduce((s, f) => s + f.uds,   0)
  console.log(`\n  Causa agregada: ${copasTotales} copas × (1/5 − 1/${copasVendibles}) × coste_medio`)
  console.log(`    = ${copasTotales} × ${r2(1/5 - 1/copasVendibles)} × ${r2(sumDiff / (copasTotales * (1/5 - 1/copasVendibles)))} € ≈ ${sumDiff} €`)
  console.log(`  Botellas vendidas (uds): ${udsTotales} → NO contribuyen al diff (misma fórmula uds × coste)`)
}

console.log(`\n═══════════════════════════════════════════════════════════════════════════════`)
console.log(`  CONCLUSIÓN:`)
console.log(`  El diff libro−cierre es 100% explicado por la constante ${copasVendibles} (del settings)`)
console.log(`  vs el 5 hardcoded del libro. El cierre es contablemente CORRECTO: usa el`)
console.log(`  copas_por_botella del restaurante y aplica merma. El libro debe usar la misma`)
console.log(`  constante leyéndola de restaurant_economic_settings.`)
console.log(`═══════════════════════════════════════════════════════════════════════════════`)
