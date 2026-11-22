/**
 * Fase G2 — lógica de autogenerate del slug al escribir el nombre.
 *
 * Reproduce el bucle de `actualizarCampo` del admin:
 *   - slugEditadoManualmente === false → el slug sigue al nombre
 *     en cada keystroke.
 *   - Si el usuario toca el campo slug a mano → se bloquea.
 *
 * El bug observado: al escribir "Prueba Slug Uno", el slug se
 * quedaba en "p" (preexistente en main, línea 380: condición
 * `!prev.slug` se volvía false tras la primera letra).
 *
 * Ejecutar: node --test scripts/slugAutogenerate.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

function slugDesdeNombre(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+/, '')
    .slice(0, 48)
}

// Mini modelo del admin: dos estados (form + slugEditadoManualmente)
// con los dos handlers que se usan en producción.
function hacerAdmin() {
  let form = { nombre: '', slug: '' }
  let slugEditadoManualmente = false
  function actualizarCampo(campo, valor) {
    form = {
      ...form,
      [campo]: valor,
      ...(campo === 'nombre' && !slugEditadoManualmente
        ? { slug: slugDesdeNombre(valor) }
        : {}),
    }
  }
  function actualizarSlugManual(valor) {
    slugEditadoManualmente = true
    actualizarCampo('slug', slugDesdeNombre(valor))
  }
  return {
    get form() { return form },
    get slugEditadoManualmente() { return slugEditadoManualmente },
    actualizarCampo,
    actualizarSlugManual,
  }
}

describe('autogenerate: el slug sigue al nombre letra a letra', () => {
  it('"Prueba Slug Uno" → slug termina en "prueba-slug-uno" (bug preexistente arreglado)', () => {
    const admin = hacerAdmin()
    let acumulado = ''
    for (const letra of 'Prueba Slug Uno') {
      acumulado += letra
      admin.actualizarCampo('nombre', acumulado)
    }
    assert.equal(admin.form.nombre, 'Prueba Slug Uno')
    assert.equal(admin.form.slug,   'prueba-slug-uno')
  })

  it('tras la PRIMERA letra el slug NO se queda en "p"', () => {
    const admin = hacerAdmin()
    admin.actualizarCampo('nombre', 'P')
    assert.equal(admin.form.slug, 'p')
    admin.actualizarCampo('nombre', 'Pr')
    assert.equal(admin.form.slug, 'pr', 'el slug debe actualizarse tras la segunda letra')
    admin.actualizarCampo('nombre', 'Pru')
    assert.equal(admin.form.slug, 'pru')
  })

  it('"Casa Marisma" → "casa-marisma"', () => {
    const admin = hacerAdmin()
    admin.actualizarCampo('nombre', 'Casa Marisma')
    assert.equal(admin.form.slug, 'casa-marisma')
  })

  it('acentos y ñ se normalizan correctamente mientras se escribe', () => {
    const admin = hacerAdmin()
    admin.actualizarCampo('nombre', 'La Peña del Niño')
    assert.equal(admin.form.slug, 'la-pena-del-nino')
  })
})

describe('bloqueo manual del slug', () => {
  it('cuando el usuario edita el slug a mano, deja de seguir al nombre', () => {
    const admin = hacerAdmin()
    admin.actualizarCampo('nombre', 'Casa Marisma')
    assert.equal(admin.form.slug, 'casa-marisma')
    // Usuario cambia el slug a mano:
    admin.actualizarSlugManual('cm-pepe')
    assert.equal(admin.form.slug, 'cm-pepe')
    assert.equal(admin.slugEditadoManualmente, true)
    // Sigue escribiendo el nombre:
    admin.actualizarCampo('nombre', 'Casa Marisma 2')
    assert.equal(admin.form.nombre, 'Casa Marisma 2')
    // El slug NO se sobrescribe:
    assert.equal(admin.form.slug, 'cm-pepe')
  })

  it('el flag de bloqueo manual es monotónico: no se desbloquea al vaciar', () => {
    const admin = hacerAdmin()
    admin.actualizarSlugManual('cm-pepe')
    assert.equal(admin.slugEditadoManualmente, true)
    admin.actualizarSlugManual('')   // el usuario vacía el campo
    assert.equal(admin.slugEditadoManualmente, true,
      'una vez tocado, el slug sigue bloqueado aunque quede vacío')
    admin.actualizarCampo('nombre', 'Nuevo Nombre')
    assert.equal(admin.form.slug, '', 'el slug permanece vacío (bloqueado)')
  })
})

describe('contract — slug válido tras una sesión de tipeo típica', () => {
  it('no deja slug con guiones iniciales ni dobles', () => {
    const admin = hacerAdmin()
    // Múltiples espacios consecutivos, símbolos:
    admin.actualizarCampo('nombre', '  Casa / Marisma  ')
    assert.ok(!admin.form.slug.startsWith('-'), 'no debe empezar con guion')
    assert.ok(!admin.form.slug.includes('--'), 'no debe tener dobles guiones')
  })
})
