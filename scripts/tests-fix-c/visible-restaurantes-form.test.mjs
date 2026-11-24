// Chain test (B1): asegura que el checkbox "Privado — solo consultor" del
// formulario de edición de proveedor queda sincronizado con la columna
// `visible_restaurantes` tanto en lectura (binding) como en escritura
// (payload del PATCH + handler del endpoint).

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')

function leer(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('page.js binde el checkbox "Privado" a !proveedorForm.visible_restaurantes', () => {
  const src = leer('app/admin/proveedores/page.js')
  assert.match(
    src,
    /checked=\{!proveedorForm\.visible_restaurantes\}/,
    'El checkbox debe estar marcado cuando el proveedor es privado (!visible_restaurantes).',
  )
  assert.match(
    src,
    /cambiarProveedor\('visible_restaurantes', !e\.target\.checked\)/,
    'onChange debe negar el valor del checkbox al escribir visible_restaurantes.',
  )
})

test('guardarProveedor envía visible_restaurantes en el payload', () => {
  const src = leer('app/admin/proveedores/page.js')
  const match = src.match(/async function guardarProveedor[\s\S]*?\}\s*\n/)
  assert.ok(match, 'Debe existir guardarProveedor en el componente.')
  // El payload serializa `...proveedorForm`, que contiene visible_restaurantes.
  assert.match(
    match[0],
    /\.\.\.proveedorForm/,
    'El body del PATCH debe hacer spread de proveedorForm.',
  )
  // Y el estado del form incluye el campo explícitamente.
  assert.match(
    src,
    /visible_restaurantes:\s*(?:false|Boolean\()/,
    'proveedorForm inicializa visible_restaurantes.',
  )
})

test('endpoint admin/proveedores recoge body.visible_restaurantes en PATCH', () => {
  const src = leer('app/api/admin/proveedores/route.js')
  assert.match(
    src,
    /visible_restaurantes:\s*Boolean\(body\.visible_restaurantes\)/,
    'payloadProveedor debe leer body.visible_restaurantes.',
  )
})

test('listado y botón "Marcar todos" leen la misma columna visible_restaurantes', () => {
  const src = leer('app/admin/proveedores/page.js')
  // Badge del listado:
  assert.match(src, /proveedor\.visible_restaurantes \? 'Visible' : 'Privado'/)
  // Conteo + acción masiva:
  assert.match(src, /proveedores\.filter\(p => !p\.visible_restaurantes\)/)
})
