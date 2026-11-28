// Smoke test estático de la matriz endpoint → guard de catálogo privado.
//
// Verifica, leyendo el fichero, que cada endpoint que lee de las tablas
// proveedor_catalogo_vinos / proveedores_vino exige o bien
// `catalogo_consultor` (plan premium) o bien el email del admin. Esto
// evita regresiones si alguien quita el gate: el test lee el texto del
// handler y comprueba que el string canónico está presente.
//
// Ejecutar: node --test scripts/catalogoGateMatrix.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function leer(ruta) {
  return readFileSync(resolve(root, ruta), 'utf8')
}

// Rutas públicas (pide bearer de propietario O admin) que leen catálogo
// privado: deben tener gate explícito de catalogo_consultor.
const ENDPOINTS_CATALOGO = [
  'app/api/catalogo-consultor/route.js',
  'app/api/proveedores-catalogo/route.js',
  'app/api/proveedores-visibles/route.js',
  'app/api/simulador/anadir-catalogo/route.js',
  'app/api/simulador/sustituir/route.js',
  'app/api/simulador/sugerir-carta/route.js',
  'app/api/simulador/pedidos/route.js',
  'app/api/simulador/proveedores-breakdown/route.js',
  'app/api/simulador/seleccionar-oferta/route.js',
  'app/api/simulador/descartar-sugerencias/route.js',
  'app/api/simulador/recalcular-copa-catalogo/route.js',
]

for (const ruta of ENDPOINTS_CATALOGO) {
  test(`${ruta}: exige catalogo_consultor (o admin)`, () => {
    const src = leer(ruta)
    const gate = src.includes("'catalogo_consultor'")
    assert.ok(
      gate,
      `${ruta} debe comprobar puedeUsar(..., 'catalogo_consultor')`
    )
    // Debe responder 403 si no cumple
    assert.ok(
      /status:\s*403/.test(src),
      `${ruta} debe responder 403 cuando falta el plan`
    )
  })
}

// Rutas admin-only del catálogo privado: deben validar email admin.
const ENDPOINTS_ADMIN = [
  'app/api/admin/proveedores/route.js',
  'app/api/admin/normalizar-catalogo/route.js',
]
for (const ruta of ENDPOINTS_ADMIN) {
  test(`${ruta}: admin-only`, () => {
    const src = leer(ruta)
    const adminGate = /adminEmail|ADMIN_EMAIL|getAdminEmail/.test(src)
    assert.ok(adminGate, `${ruta} debe validar el email admin`)
  })
}

// GET /api/simulador (operación general): editor_carta + strip de claves
// del catálogo cuando falta catalogo_consultor.
test('GET /api/simulador usa CLAVES_CATALOGO_CONSULTOR para strip', () => {
  const src = leer('app/api/simulador/route.js')
  assert.ok(src.includes('puedeUsarEditorCarta'), 'editor_carta gate')
  assert.ok(src.includes('CLAVES_CATALOGO_CONSULTOR'), 'usa la lista canónica de claves')
})
