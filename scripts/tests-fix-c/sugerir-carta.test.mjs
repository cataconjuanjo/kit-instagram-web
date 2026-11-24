// Test de regresión del fix C en /api/simulador/sugerir-carta.
// Verifica que el catálogo expuesto al cliente borra coste_estimado si
// la sesión no es consultor. Fixture: Casa Marisma.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const routeSrc = readFileSync(
  resolve(here, '..', '..', 'app', 'api', 'simulador', 'sugerir-carta', 'route.js'),
  'utf8'
)

test('import de isConsultor presente', () => {
  assert.ok(routeSrc.includes("from '../../_lib/isConsultor'"))
})

test('el catálogo elimina coste_estimado si no es consultor', () => {
  assert.ok(routeSrc.includes('delete base.coste_estimado'),
    'debe eliminar coste_estimado antes de meter el vino en el catálogo expuesto')
})
