/**
 * test-pricing.mjs
 * Verifica los valores canónicos de PVP botella y copa para los tres casos de
 * referencia del bloque 2.
 *
 * La fórmula está inlined con los defaults de calcularPreciosSugeridos({})
 * porque Node puro no puede resolver los imports sin extensión que usa
 * app/lib/pricingUtils.js (Next.js/webpack los resuelve, Node no).
 * Si se modifica la fórmula en pricingUtils.js, actualizar también aquí.
 *
 * Uso:  node scripts/test-pricing.mjs
 */

import assert from 'assert/strict'

// ── Fórmula canónica con defaults de calcularPreciosSugeridos({}) ─────────────
// Defaults: ivaVentaPct=10, pvpIncluyeIva=true, costeIncluyeIva=false,
//           copasPorBotella=5, mermaCopaPct=10 → copasVendibles = 5×0.9 = 4.5
function calcularConDefaults(coste) {
  const c = Number(coste) || 0
  if (!c) return { botella: 0, copa: 0 }

  // Paso 1: PVP neto según regla de catálogo (calcularPvpNetoBotellaCatalogo)
  let pvpNeto
  if (c <= 6)  pvpNeto = c * 3.5
  else if (c <= 11) pvpNeto = c * 2 + 9
  else pvpNeto = c + 20

  // Paso 2: añadir IVA (pvpIncluyeIva=true, ivaVentaPct=10)
  const baseBotella = pvpNeto * 1.1

  // Paso 3: redondear botella al euro más cercano
  const botella = Math.round(baseBotella)

  // Paso 4: copa = botella / copasVendibles, redondear a 0,50 EUR
  const copasVendibles = 5 * (1 - 10 / 100) // = 4.5
  const baseCopa = botella / copasVendibles
  const copa = Math.round(baseCopa * 2) / 2

  return { botella, copa }
}

// ── Casos de referencia ───────────────────────────────────────────────────────
// Valores verificados en AUDITORIA-CATALOGO.md §3 y confirmados en bloque 2.
// El panel (/admin/proveedores) daba valores distintos porque dividía por 5
// en lugar de 4.5. Tras el parche B, panel y restaurante coinciden.
const casos = [
  { label: 'A Bruxa 2023   (coste 26,65)', coste: 26.65, botella: 51,   copa: 11.5 },
  { label: 'A Cesteira     (coste 23,00)', coste: 23.00, botella: 47,   copa: 10.5 },
  { label: 'A Pedreira     (coste 11,00)', coste: 11.00, botella: 34,   copa: 7.5  },
]

let ok = 0
for (const { label, coste, botella, copa } of casos) {
  const r = calcularConDefaults(coste)
  try {
    assert.equal(r.botella, botella,
      `${label}: botella esperada ${botella} €, obtenida ${r.botella} €`)
    assert.equal(r.copa, copa,
      `${label}: copa esperada ${copa} €, obtenida ${r.copa} €`)
    console.log(`✓  ${label.padEnd(35)}  botella ${r.botella} €  copa ${r.copa} €`)
    ok++
  } catch (e) {
    console.error(`✗  ${e.message}`)
  }
}

if (ok < casos.length) {
  console.error(`\n${casos.length - ok} test(s) fallaron.`)
  process.exit(1)
}
console.log(`\n${ok}/${casos.length} tests pasaron.`)
