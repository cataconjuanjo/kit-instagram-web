// scripts/margenCanonico.test.mjs
//
// Verifica que la funcion canonica margenBrutoPct de wineEconomics
// devuelve el valor de margen SOBRE PVP SIN IVA (10% venta por defecto)
// que pueden consumir Inicio, Sala, Cierre, Simulador, Bodega,
// Rentabilidad y Previsualizacion de PVP sin divergir entre pantallas.
//
// Ejemplo de referencia (del informe de auditoria pre-demo 16/11):
//   Alto Los Zorros · PVP 17 € · coste 5,30 € · IVA venta 10 %
//   PVP neto = 17 / 1.10 = 15,4545
//   Beneficio = 15,4545 − 5,30 = 10,1545
//   margenBrutoPct = 10,1545 / 15,4545 × 100 = 65,70 %
//
// Ejecutar: node --test scripts/margenCanonico.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { margenBrutoPct, beneficioBruto, precioNetoVenta } from '../app/lib/wineEconomics.js'

test('Alto Los Zorros: PVP 17, coste 5.30, IVA 10 → 65.70%', () => {
  const pvp = 17
  const coste = 5.30
  const neto = precioNetoVenta(pvp)
  assert.ok(Math.abs(neto - 15.4545) < 0.01, `neto ${neto} ~ 15.4545`)
  const beneficio = beneficioBruto(pvp, coste)
  assert.ok(Math.abs(beneficio - 10.15) < 0.02, `beneficio ${beneficio} ~ 10.15`)
  const margen = margenBrutoPct(pvp, coste)
  assert.ok(Math.abs(margen - 65.70) < 0.1, `margen ${margen} ~ 65.70`)
})

test('coste 0 → ~100 % de margen (limite con redondeo interno)', () => {
  // precioNetoVenta(17) ≈ 15.4545; beneficio = redondear(15.4545, 2) = 15.45
  // 15.45 / 15.4545 × 100 ≈ 99.97 (aceptable)
  const m = margenBrutoPct(17, 0)
  assert.ok(m >= 99.5 && m <= 100, `margen sin coste ${m} entre 99.5 y 100`)
})

test('PVP 0 → 0 (evitar NaN)', () => {
  assert.equal(margenBrutoPct(0, 5), 0)
})

test('config pvpIncluyeIva=false: margen sobre precio bruto', () => {
  const margen = margenBrutoPct(17, 5.30, { pvpIncluyeIva: false, ivaVentaPct: 10 })
  // sin quitar IVA: (17 − 5.30) / 17 × 100 = 68.82
  assert.ok(Math.abs(margen - 68.82) < 0.1, `margen bruto ${margen} ~ 68.82`)
})

test('Simulador antes: 68.82 (bruto) → ahora: 65.70 (canonico, IVA 10)', () => {
  // Documenta el cambio esperado en pantalla
  const antes = ((17 - 5.30) / 17) * 100            // 68.82
  const ahora = margenBrutoPct(17, 5.30)            // 65.70
  assert.ok(antes > ahora, 'canonico es mas bajo porque quita IVA del PVP')
})
