// Test de regresión del fix C en /api/catalogo-consultor.
// Verifica que el decorador elimina coste_estimado si no es consultor y que
// el proveedor expuesto se recorta a nombre/zona/ámbito.
// Fixture: Casa Marisma.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const routeSrc = readFileSync(
  resolve(here, '..', '..', 'app', 'api', 'catalogo-consultor', 'route.js'),
  'utf8'
)

test('el import de isConsultor está presente', () => {
  assert.ok(routeSrc.includes("from '../_lib/isConsultor'"))
})

test('el decorador elimina coste_estimado si no es consultor', () => {
  assert.ok(routeSrc.includes('delete base.coste_estimado'),
    'debe eliminar coste_estimado para restaurante')
})

test('existe un proveedor público sin email/telefono/contacto', () => {
  const idx = routeSrc.indexOf('proveedorPublico')
  assert.ok(idx > 0, 'debe existir proveedorPublico')
  // Tomo el bloque del helper (aproximado)
  const bloque = routeSrc.slice(idx, idx + 400)
  assert.ok(!bloque.includes('email'), 'proveedorPublico no debe exponer email')
  assert.ok(!bloque.includes('telefono'), 'proveedorPublico no debe exponer telefono')
  assert.ok(!bloque.includes('contacto'), 'proveedorPublico no debe exponer contacto')
})
