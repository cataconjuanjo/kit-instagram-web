// Test de regresión del fix C en /api/proveedores-catalogo.
// Lee el fichero fuente y verifica:
//   1. Existe una proyección "restaurante" que NO contiene coste_estimado.
//   2. El decorador condiciona la salida sobre esConsultor.
// Fixture: Casa Marisma.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const routeSrc = readFileSync(
  resolve(here, '..', '..', 'app', 'api', 'proveedores-catalogo', 'route.js'),
  'utf8'
)

test('existe una proyección restaurante que omite coste_estimado', () => {
  const match = routeSrc.match(/catalogoSelectRestaurante\s*=\s*'([^']+)'/)
  assert.ok(match, 'catalogoSelectRestaurante debe estar declarada')
  const proyeccion = match[1]
  assert.ok(!proyeccion.includes('coste_estimado'), 'restaurante no debe recibir coste_estimado')
  assert.ok(!proyeccion.includes('notas'), 'restaurante no debe recibir notas internas')
  assert.ok(proyeccion.includes('pvp_recomendado'), 'restaurante sí debe recibir pvp_recomendado')
})

test('la proyección consultor sí contiene coste_estimado', () => {
  const match = routeSrc.match(/catalogoSelectConsultor\s*=\s*'([^']+)'/)
  assert.ok(match, 'catalogoSelectConsultor debe estar declarada')
  assert.ok(match[1].includes('coste_estimado'), 'consultor debe recibir coste_estimado')
})

test('el import de isConsultor está presente', () => {
  assert.ok(routeSrc.includes("from '../_lib/isConsultor'"), 'debe importar isConsultor')
})

test('el decorador elimina coste_estimado cuando no es consultor', () => {
  assert.ok(routeSrc.includes('delete safe.coste_estimado'), 'debe eliminarse coste_estimado para restaurante')
})

test('los proveedores restaurante no reciben email ni telefono', () => {
  const match = routeSrc.match(/proveedoresSelectRestaurante\s*=\s*'([^']+)'/)
  assert.ok(match, 'proveedoresSelectRestaurante debe estar declarada')
  const proyeccion = match[1]
  assert.ok(!proyeccion.includes('email'), 'restaurante no debe recibir email del proveedor')
  assert.ok(!proyeccion.includes('telefono'), 'restaurante no debe recibir telefono del proveedor')
})
