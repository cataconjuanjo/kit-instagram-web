/**
 * FASE L — Cambio 2: ninguna de las dos páginas pulidas (Quioscos y
 * Proveedores) debe introducir hex hardcodeados nuevos fuera de los
 * tokens declarados en :root y los primitivos aceptados (#fff).
 *
 * Ejecuta: node --test scripts/tokensDiseno.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Hex que SÍ permitimos sin token:
//  - #fff / #ffffff (blanco universal)
//  - El patrón rgba(…) escaped (no es hex). El test ignora rgba.
const HEX_PERMITIDOS = new Set(['#fff', '#ffffff'])

function hexNoTokenizados(file) {
  const src = fs.readFileSync(file, 'utf8')
  const regex = /#[0-9a-fA-F]{3,8}\b/g
  const fuera = []
  for (const m of src.match(regex) || []) {
    const lower = m.toLowerCase()
    if (HEX_PERMITIDOS.has(lower)) continue
    fuera.push(m)
  }
  return fuera
}

describe('FASE L cambio 2: tokens DESIGN.md en Quioscos y Proveedores', () => {
  it('app/admin/kioscos/kioscos.module.css no tiene hex nuevos fuera de los tokens', () => {
    const fuera = hexNoTokenizados(path.join(process.cwd(), 'app', 'admin', 'kioscos', 'kioscos.module.css'))
    assert.deepEqual(fuera, [], `Hex fuera de tokens: ${fuera.join(', ')}`)
  })

  it('app/admin/proveedores/page.js no tiene hex nuevos fuera de los tokens', () => {
    const fuera = hexNoTokenizados(path.join(process.cwd(), 'app', 'admin', 'proveedores', 'page.js'))
    assert.deepEqual(fuera, [], `Hex fuera de tokens: ${fuera.join(', ')}`)
  })

  it('app/globals.css expone los tokens de estado necesarios en :root', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')
    for (const t of ['--estado-exito', '--estado-alerta', '--estado-error']) {
      assert.ok(src.includes(t + ':'), `Falta token ${t} en :root`)
    }
  })

  it('app/globals.css expone los tokens principales de DESIGN.md en :root', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')
    for (const t of ['--ink', '--muted', '--soft', '--paper', '--canvas', '--line', '--wine', '--wine-deep', '--wine-soft', '--gold', '--green', '--charcoal']) {
      assert.ok(src.includes(t + ':'), `Falta token ${t} en :root`)
    }
  })
})
