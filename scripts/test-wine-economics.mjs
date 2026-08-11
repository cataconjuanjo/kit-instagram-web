/**
 * Test unitario de margenBrutoPct (wineEconomics.js)
 * Ejecutar: node scripts/test-wine-economics.mjs
 */
import assert from 'assert/strict'
import { margenBrutoPct } from '../app/lib/wineEconomics.js'

// wineEconomics no exporta margenDisplay — es una helper local de bodega/page.js.
// Lo reimplementamos aquí para probar el contrato de la celda de tabla.
function margenDisplayLocal(pvp, coste) {
  const p = Number(pvp) || 0
  const c = Number(coste) || 0
  if (!p || !c) return null
  return margenBrutoPct(pvp, coste)
}

let passed = 0

function ok(cond, label) {
  assert(cond, label)
  console.log(`  ✓ ${label}`)
  passed++
}

function approx(actual, expected, label, delta = 0.5) {
  assert(Math.abs(actual - expected) <= delta, `${label}: expected ≈${expected}, got ${actual}`)
  console.log(`  ✓ ${label} (${actual})`)
  passed++
}

console.log('\nmargenBrutoPct — casos límite\n')

// Caso normal: PVP 20 €, coste 6 €
// pvpNeto = 20/1.1 ≈ 18.18  →  margen = (18.18-6)/18.18 ≈ 67.0 %
approx(margenBrutoPct(20, 6), 67.0, 'normal (pvp=20, coste=6)')

// PVP 0 → 0, no NaN, no crash
ok(margenBrutoPct(0, 6) === 0,    'PVP 0 → devuelve 0')
ok(margenBrutoPct(null, 6) === 0, 'PVP null → devuelve 0')
ok(!isNaN(margenBrutoPct(0, 6)), 'PVP 0 → no NaN')

// Coste 0 → margen ~100 % (el PVP íntegro es beneficio)
approx(margenBrutoPct(20, 0), 100, 'coste 0 → ~100 %')

// Ambos 0/null → 0
ok(margenBrutoPct(0, 0) === 0,       'ambos 0 → 0')
ok(margenBrutoPct(null, null) === 0, 'ambos null → 0')
ok(!isNaN(margenBrutoPct(null, null)), 'null/null → no NaN')

// Coste > PVP → margen negativo (es un estado real en la BD)
const mNegativo = margenBrutoPct(10, 12)
ok(mNegativo < 0, `coste>PVP → negativo (${mNegativo})`)
ok(!isNaN(mNegativo), 'coste>PVP → no NaN')

// NaN string inputs → trata como 0
ok(margenBrutoPct('abc', 'xyz') === 0, 'strings no numéricos → 0')

console.log('\nmargenDisplay (contrato celda tabla)\n')

// null cuando falta pvp o coste
ok(margenDisplayLocal(0, 6) === null,  'pvp=0 → null (celda pinta "—")')
ok(margenDisplayLocal(20, 0) === null, 'coste=0 → null (celda pinta "—")')
ok(margenDisplayLocal(null, null) === null, 'null/null → null')

// valor cuando ambos presentes
ok(typeof margenDisplayLocal(20, 6) === 'number', 'pvp+coste → número')
ok(margenDisplayLocal(10, 12) < 0, 'coste>PVP → negativo visible en tabla')

console.log(`\n✓ ${passed} tests pasan\n`)
