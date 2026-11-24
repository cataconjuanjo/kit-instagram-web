// Test de regresión del fix C en /api/simulador/proveedores-breakdown.
// Verifica que al restaurante no se le exponen coste_por_botella puntual,
// mejor_precio_disponible, diferencia_mejor_precio, ahorro_potencial ni
// contacto comercial del proveedor. Fixture: Casa Marisma.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const routeSrc = readFileSync(
  resolve(here, '..', '..', 'app', 'api', 'simulador', 'proveedores-breakdown', 'route.js'),
  'utf8'
)

test('import de isConsultor presente', () => {
  assert.ok(routeSrc.includes("from '../../_lib/isConsultor'"))
})

test('ofertas_comparacion omite coste_por_botella cuando no es consultor', () => {
  assert.ok(routeSrc.includes('esConsultor\n          ? ofertasRaw') ||
            routeSrc.includes('esConsultor ? ofertasRaw') ||
            routeSrc.match(/esConsultor[\s\S]{0,60}ofertasRaw[\s\S]{0,200}coste_por_botella, \.\.\.resto/),
    'debe existir una rama que remueva coste_por_botella para restaurante')
})

test('mejor_precio_disponible y ahorro_potencial se anulan para restaurante', () => {
  assert.ok(routeSrc.includes('mejor_precio_disponible: esConsultor'),
    'mejor_precio_disponible debe estar gateado')
  assert.ok(routeSrc.includes('ahorro_potencial: esConsultor'),
    'ahorro_potencial debe estar gateado')
  assert.ok(routeSrc.includes('diferencia_mejor_precio: esConsultor'),
    'diferencia_mejor_precio debe estar gateado')
})

test('proveedor_email/telefono/contacto van condicionados a esConsultor', () => {
  // Busca que email/telefono/contacto estén dentro de una ternaria con esConsultor
  assert.ok(routeSrc.match(/proveedor_email:\s+esConsultor\s*\?/),
    'proveedor_email debe estar gateado')
  assert.ok(routeSrc.match(/proveedor_telefono:\s+esConsultor\s*\?/),
    'proveedor_telefono debe estar gateado')
  assert.ok(routeSrc.match(/proveedor_contacto:\s+esConsultor\s*\?/),
    'proveedor_contacto debe estar gateado')
})
