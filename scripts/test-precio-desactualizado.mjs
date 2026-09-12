/**
 * test-precio-desactualizado.mjs
 * Importa la función real de app/lib/precioDesactualizado.js y la prueba
 * contra los dos casos conocidos del bloque 2.
 *
 * Uso: node scripts/test-precio-desactualizado.mjs
 */

import assert from 'assert/strict'
import { normTexto, construirHermanosMap, esPrecioDesactualizado } from '../app/lib/precioDesactualizado.js'

const PID = 'proveedor-test'

// ── PASO 0: diagnóstico normTexto sobre los formatos de Tondonia ──────────────
console.log('── normTexto diagnóstico ────────────────────────────────────────')
const formatos = ['75cl · 6 u/c', '150cl · 6 u/c', '150cl · 1 u/c Est. Mad']
for (const f of formatos) {
  console.log(`  "${f}"  →  "${normTexto(f)}"`)
}
console.log(`  "Viña Tondonia Reserva 2013"   →  "${normTexto('Viña Tondonia Reserva 2013')}"`)
console.log(`  "Viña Tondonia Reserva* 2013"  →  "${normTexto('Viña Tondonia Reserva* 2013')}"`)
console.log('')

// ── CASO A: Ube El Carrascal 2019 ─────────────────────────────────────────────
// favorito: coste 33.35 / hermano mismo formato coste 64.90 → debe dar true
const hermanos_ube = [
  { proveedor_id: PID, nombre: 'Ube El Carrascal 2019', bodega: 'COTA 45', formato: 'botella 75 cl', coste_estimado: 64.90 },
]
const favorito_ube = { proveedor_id: PID, nombre: 'Ube El Carrascal 2019', bodega: 'COTA 45', formato: 'botella 75 cl', coste_estimado: 33.35 }
const mapa_ube = construirHermanosMap(hermanos_ube)
const result_ube = esPrecioDesactualizado(favorito_ube, mapa_ube)
assert.equal(result_ube, true, 'Ube El Carrascal 2019: esperado true')
console.log(`✓  Caso A — Ube El Carrascal 2019 (fav 33.35€ / hermano 64.90€, mismo formato)  →  ${result_ube}`)

// ── CASO B1: Tondonia — hermanos solo 150cl (formato distinto) ────────────────
// El favorito es 75cl; los hermanos que tienen el mismo nombre son 150cl.
// Con formato distinto no debe haber match → false.
const hermanos_tondonia_solo150 = [
  { proveedor_id: PID, nombre: 'Viña Tondonia Reserva 2013', bodega: 'LÓPEZ DE HEREDIA', formato: '150cl · 6 u/c',          coste_estimado: 59.95 },
  { proveedor_id: PID, nombre: 'Viña Tondonia Reserva 2013', bodega: 'LÓPEZ DE HEREDIA', formato: '150cl · 1 u/c Est. Mad', coste_estimado: 68.95 },
]
const favorito_tondonia = { proveedor_id: PID, nombre: 'Viña Tondonia Reserva 2013', bodega: 'LÓPEZ DE HEREDIA', formato: '75cl · 6 u/c', coste_estimado: 28.9 }
const mapa_solo150 = construirHermanosMap(hermanos_tondonia_solo150)
const result_solo150 = esPrecioDesactualizado(favorito_tondonia, mapa_solo150)
assert.equal(result_solo150, false, 'Tondonia (solo hermanos 150cl): esperado false')
console.log(`✓  Caso B1 — Tondonia, hermanos solo 150cl (formato distinto)              →  ${result_solo150}`)

// ── CASO B2: Tondonia — incluye el hermano con asterisco en nombre ────────────
// En BD existe "Viña Tondonia Reserva* 2013" (no-favorito, 75cl, coste 62).
// normTexto() elimina el * → mismo nombre_norm que el favorito → match.
// El formato 75cl también coincide → debe dar true.
const hermanos_tondonia_full = [
  ...hermanos_tondonia_solo150,
  { proveedor_id: PID, nombre: 'Viña Tondonia Reserva* 2013', bodega: 'LÓPEZ DE HEREDIA', formato: '75cl · 6 u/c', coste_estimado: 62 },
]
const mapa_full = construirHermanosMap(hermanos_tondonia_full)
const result_full = esPrecioDesactualizado(favorito_tondonia, mapa_full)
assert.equal(result_full, true, 'Tondonia (con hermano asterisco 75cl coste=62): esperado true')
console.log(`✓  Caso B2 — Tondonia, hermano "Reserva* 2013" 75cl coste=62               →  ${result_full}`)
console.log('')
console.log('Diagnóstico Tondonia: el flag dispara porque "Viña Tondonia Reserva* 2013"')
console.log('(no-favorito, 75cl, coste 62 €) y "Viña Tondonia Reserva 2013" (favorito,')
console.log('75cl, coste 28.9 €) tienen el MISMO normTexto (el * se elimina como carácter')
console.log('no alfanumérico). El emparejamiento de formato SÍ funciona — el match no es')
console.log('contra los hermanos 150cl, sino contra el hermano 75cl con asterisco.')
console.log('El flag es correcto: mismo vino, mismo formato, precio distinto.')
console.log('')

console.log('3/3 tests pasaron.')
