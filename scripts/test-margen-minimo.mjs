/**
 * test-margen-minimo.mjs — B6: Tests de fórmulas (sin base de datos)
 *
 * Uso:
 *   node scripts/test-margen-minimo.mjs
 */

import { pvpMinimoBottle, pvpMinimoCopa, descuentoMaximo, estadoFila } from '../app/lib/margenMinimo.js'

let passed = 0, failed = 0

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else       { failed++; console.error(`  ✗ ${msg}`) }
}

function assertEqual(a, b, msg) {
  if (a === b) { passed++; console.log(`  ✓ ${msg}  (${a})`) }
  else         { failed++; console.error(`  ✗ ${msg}  expected=${b} got=${a}`) }
}

// Configuración base de referencia
const DEF = {
  iva_venta_pct: 10,
  pvp_incluye_iva: true,
  coste_incluye_iva: false,
  copas_por_botella: 5,
  merma_copa_pct: 10,
}

// ── 1. Caso canónico: coste 14, margen 60%, IVA 10% ──────────────────────────
console.log('\n── 1. Caso canónico (coste 14, margen 60%, IVA 10%) ───────────────────')
{
  // costeNeto=14, pvpNeto=14/0.40=35, pvpConIva=35×1.10=38.50
  const r = pvpMinimoBottle(14, 60, DEF)
  assert(r !== null, 'devuelve resultado (no null)')
  assertEqual(r.exacto, 38.50, 'PVP mínimo exacto = 38,50')
  // Math.ceil(38.50/1.00)×1.00 = 39
  assertEqual(r.redondeado, 39, 'PVP mínimo redondeado = 39 (Math.ceil hacia el euro)')
}

// ── 2. Coste 0 → null ────────────────────────────────────────────────────────
console.log('\n── 2. Coste cero o nulo ───────────────────────────────────────────────')
{
  assert(pvpMinimoBottle(0, 60, DEF) === null, 'coste=0 → null')
  assert(pvpMinimoBottle(null, 60, DEF) === null, 'coste=null → null')
  assert(pvpMinimoBottle('', 60, DEF) === null, 'coste="" → null')
}

// ── 3. Margen en los límites ──────────────────────────────────────────────────
console.log('\n── 3. Límites de margen ───────────────────────────────────────────────')
{
  assert(pvpMinimoBottle(14, 0, DEF) === null, 'margen=0 → null (no válido, debe ser > 0)')
  assert(pvpMinimoBottle(14, 100, DEF) === null, 'margen=100 → null (división por cero, debe ser < 100)')
  const r999 = pvpMinimoBottle(14, 99.9, DEF)
  assert(r999 !== null, 'margen=99.9 → válido')
  assert(r999.exacto > 1000, `margen=99.9 → PVP muy alto (${r999.exacto}) — factor 0.001`)
  // margen=null → null
  assert(pvpMinimoBottle(14, null, DEF) === null, 'margen=null → null')
}

// ── 4. Copa con merma ─────────────────────────────────────────────────────────
console.log('\n── 4. Copa con merma (coste 14, 5 copas, merma 10%, margen 60%, IVA 10%) ─')
{
  // copasVendibles = 5×0.9 = 4.5
  // costeCopa = 14/4.5 ≈ 3.1111...
  // pvpNeto = 3.1111.../0.40 ≈ 7.7777...
  // pvpConIva ≈ 7.7777...×1.10 ≈ 8.5555...  → redondear(8.5555,2) = 8.56
  // redondeado: Math.ceil(8.5555.../0.50)×0.50 = Math.ceil(17.111)×0.50 = 18×0.50 = 9.00
  const r = pvpMinimoCopa(14, 60, DEF)
  assert(r !== null, 'copa con merma → no null')
  assertEqual(r.exacto, 8.56, 'copa PVP exacto = 8,56')
  assertEqual(r.redondeado, 9.00, 'copa PVP redondeado = 9,00 (Math.ceil al tramo 0,50)')
}

// ── 5. Sin merma (merma_copa_pct=0): copasVendibles = copas_por_botella ───────
console.log('\n── 5. Copa sin merma (merma_copa_pct=0) ───────────────────────────────')
{
  // costeCopa = 14/5 = 2.8; pvpNeto = 2.8/0.40 = 7; pvpConIva = 7×1.10 = 7.70
  const r = pvpMinimoCopa(14, 60, { ...DEF, merma_copa_pct: 0 })
  assert(r !== null, 'copa sin merma → no null')
  assertEqual(r.exacto, 7.70, 'copa sin merma: exacto = 7,70')
  // Math.ceil(7.70/0.50)×0.50 = Math.ceil(15.4)×0.50 = 16×0.50 = 8.00
  assertEqual(r.redondeado, 8.00, 'copa sin merma: redondeado = 8,00')
}

// ── 6. Descuento máximo ───────────────────────────────────────────────────────
console.log('\n── 6. Descuento máximo ────────────────────────────────────────────────')
{
  // pvpActual=50, pvpMin=38.50 → margen=(50-38.50)/50×100=23%; €=11.50
  const r = descuentoMaximo(50, 38.50)
  assert(!r.porDebajo, 'pvpActual > pvpMin → porDebajo=false')
  assertEqual(r.eur, 11.50, 'descuento máx en euros = 11,50')
  // 23.0%: redondear((11.50/50)*100, 1) = redondear(23, 1) = 23
  assertEqual(r.pct, 23, 'descuento máx en % = 23')
}

// ── 7. Descuento máximo negativo → "ya por debajo" ────────────────────────────
console.log('\n── 7. Descuento máximo negativo ───────────────────────────────────────')
{
  const r = descuentoMaximo(35, 38.50)
  assert(r.porDebajo, 'pvpActual < pvpMin → porDebajo=true')
  assert(r.pct === null, 'porDebajo: pct=null (no mostrar %)')
  assert(r.eur === null, 'porDebajo: eur=null')
}

// ── 8. estadoFila ─────────────────────────────────────────────────────────────
console.log('\n── 8. estadoFila ──────────────────────────────────────────────────────')
{
  assertEqual(estadoFila(50, 38.50, true),  'ok',          'pvpActual>pvpMin → ok')
  assertEqual(estadoFila(35, 38.50, true),  'por_debajo',  'pvpActual<pvpMin → por_debajo')
  assertEqual(estadoFila(0,  38.50, true),  'sin_pvp',     'pvpActual=0 → sin_pvp')
  assertEqual(estadoFila(null, 38.50, true), 'sin_pvp',    'pvpActual=null → sin_pvp')
  assertEqual(estadoFila(50,  38.50, false), 'sin_coste',  'sin coste → sin_coste')
  assertEqual(estadoFila(50,  null,  true),  'sin_coste',  'pvpMin=null (sin coste) → sin_coste')
}

// ── 9. Redondeo hacia arriba con valor no entero ──────────────────────────────
console.log('\n── 9. Redondeo hacia arriba (Math.ceil, no Math.round) ────────────────')
{
  // coste=14.5, margen=60%, IVA=10%
  // pvpNeto = 14.5/0.40 = 36.25; pvpConIva = 36.25×1.10 = 39.875
  // redondear(39.875, 2) = 39.88
  // Math.ceil(39.875/1.00)×1.00 = Math.ceil(39.875) = 40  (Math.round daría 40 también aquí)
  const r = pvpMinimoBottle(14.5, 60, DEF)
  assertEqual(r.exacto, 39.88, 'exacto = 39,88 (redondear al 2dp)')
  assertEqual(r.redondeado, 40, 'redondeado = 40 (ceil 39.875 → 40)')

  // Verificar diferencia ceil vs round: coste=14.4
  // pvpNeto=14.4/0.40=36, pvpConIva=36×1.10=39.60
  // Math.ceil(39.60/1)=40; Math.round(39.60/1)=40 → igual aquí
  // coste tal que pvpConIva = 39.20 (exactamente .20 → ceil=40, round=39)
  // pvpConIva = 39.20 → pvpNeto = 39.20/1.10 ≈ 35.636... → costeNeto = 35.636×0.40 ≈ 14.254...
  const r2 = pvpMinimoBottle(14.254, 60, DEF)
  // pvpNeto ≈ 14.254/0.40 = 35.635; pvpConIva ≈ 39.1985 → exacto ≈ 39.20
  // Math.ceil(39.20) = 40; Math.round(39.20) = 39 ← diferencia importante
  assert(r2.redondeado === 40, `ceil garantiza suelo: 39.20 → 40 (round daría 39) [got ${r2.redondeado}]`)
}

// ── 10. Sin IVA (pvp_incluye_iva=false) ──────────────────────────────────────
console.log('\n── 10. Sin IVA en PVP ─────────────────────────────────────────────────')
{
  // pvpNeto = 14/0.40 = 35; sin IVA en PVP → exacto = 35; redondeado = 35
  const r = pvpMinimoBottle(14, 60, { ...DEF, pvp_incluye_iva: false })
  assertEqual(r.exacto, 35, 'sin IVA: exacto = 35')
  assertEqual(r.redondeado, 35, 'sin IVA: redondeado = 35 (ya múltiplo de 1)')
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`Tests: ${passed} ✓  ${failed} ✗  total ${passed + failed}`)
if (failed > 0) process.exitCode = 1
