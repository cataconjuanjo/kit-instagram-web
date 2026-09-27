/**
 * Unit tests for app/lib/textFilters.mjs
 * Ejecutar: node --test scripts/text-filters.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  limpiarNotasDe,
  extraerTechoPrecio,
  aplicarFiltrosVoz,
  filtrarPalabrasProhibidasPost,
  asegurarMayusculas,
} from '../app/lib/textFilters.mjs'

// ── limpiarNotasDe ───────────────────────────────────────────────────────────

describe('limpiarNotasDe — ES', () => {
  it('elimina "sus notas de X" (caso original del bug)', () => {
    const result = limpiarNotasDe('sus notas de ciruela')
    assert.equal(result, 'ciruela')
  })

  it('no produce "sus X" (regression: el bug del artículo huérfano)', () => {
    const result = limpiarNotasDe('sus notas de ciruela')
    assert.ok(!result.startsWith('sus '), `No debe empezar con "sus ": "${result}"`)
  })

  it('elimina "las notas de X" sin dejar artículo huérfano', () => {
    assert.equal(limpiarNotasDe('las notas de fruta roja'), 'fruta roja')
  })

  it('"con sus notas de X" → "con X"', () => {
    assert.equal(limpiarNotasDe('con sus notas de fruta roja'), 'con fruta roja')
  })

  it('"con notas de X" → "con X"', () => {
    assert.equal(limpiarNotasDe('con notas de frutos secos'), 'con frutos secos')
  })

  it('bare "notas de X" → "X"', () => {
    assert.equal(limpiarNotasDe('notas de vainilla y café'), 'vainilla y café')
  })

  it('texto sin "notas de" pasa sin cambios', () => {
    assert.equal(limpiarNotasDe('vino frutal con fruta roja'), 'vino frutal con fruta roja')
  })

  it('texto vacío no explota', () => {
    assert.equal(limpiarNotasDe(''), '')
    assert.equal(limpiarNotasDe(null), '')
    assert.equal(limpiarNotasDe(undefined), '')
  })
})

describe('limpiarNotasDe — EN', () => {
  it('"with notes of X" → "with X"', () => {
    assert.equal(limpiarNotasDe('with notes of dark fruit'), 'with dark fruit')
  })

  it('"its notes of X" → "X"', () => {
    assert.equal(limpiarNotasDe('its notes of citrus'), 'citrus')
  })

  it('bare "notes of X" → "X"', () => {
    assert.equal(limpiarNotasDe('notes of vanilla and oak'), 'vanilla and oak')
  })
})

// ── extraerTechoPrecio ───────────────────────────────────────────────────────

describe('extraerTechoPrecio', () => {
  it('"hasta 25 euros" → 25', () => {
    assert.equal(extraerTechoPrecio('algo hasta 25 euros'), 25)
  })

  it('"hasta 30€" → 30', () => {
    assert.equal(extraerTechoPrecio('hasta 30€'), 30)
  })

  it('"menos de 40 euros" → 40', () => {
    assert.equal(extraerTechoPrecio('menos de 40 euros'), 40)
  })

  it('"less than 35" → 35', () => {
    assert.equal(extraerTechoPrecio('less than 35'), 35)
  })

  it('"under 20" → 20', () => {
    assert.equal(extraerTechoPrecio('under 20'), 20)
  })

  it('"max 50" → 50', () => {
    assert.equal(extraerTechoPrecio('max 50'), 50)
  })

  it('"algo fresquito sin gastar mucho" → null (señal sin cantidad)', () => {
    assert.equal(extraerTechoPrecio('algo fresquito sin gastar mucho'), null)
  })

  it('"barato" → null', () => {
    assert.equal(extraerTechoPrecio('barato'), null)
  })

  it('texto vacío → null', () => {
    assert.equal(extraerTechoPrecio(''), null)
    assert.equal(extraerTechoPrecio(null), null)
  })

  it('"no más de 25 euros" → 25 (máximo explícito con tilde)', () => {
    assert.equal(extraerTechoPrecio('no más de 25 euros'), 25)
  })
})

// ── filtrarPalabrasProhibidasPost ────────────────────────────────────────────

describe('filtrarPalabrasProhibidasPost', () => {
  it('reemplaza "untuosidad" por "textura grasa"', () => {
    assert.ok(filtrarPalabrasProhibidasPost('su untuosidad').includes('textura grasa'))
  })

  it('reemplaza "unctuousness" por "rich texture" (EN)', () => {
    assert.ok(filtrarPalabrasProhibidasPost('its unctuousness').includes('rich texture'))
  })

  it('reemplaza "fondo oscuro" por "fondo"', () => {
    assert.equal(filtrarPalabrasProhibidasPost('un fondo oscuro intenso'), 'un fondo intenso')
  })
})

// ── aplicarFiltrosVoz (pipeline completo) ────────────────────────────────────

describe('aplicarFiltrosVoz — pipeline completo', () => {
  it('combina filtros sin romper el texto', () => {
    const entrada = 'Vino A — Mi elección: sus notas de ciruela y fondo oscuro acompañan el rabo. 25€'
    const salida = aplicarFiltrosVoz(entrada)
    assert.ok(!salida.includes('notas de'), `No debe contener "notas de": "${salida}"`)
    assert.ok(!salida.includes('fondo oscuro'), `No debe contener "fondo oscuro": "${salida}"`)
    assert.ok(!salida.startsWith('sus '), `No debe empezar con "sus "`)
  })

  it('respeta la mayúscula después del rol', () => {
    const entrada = 'Vino A — Mi elección: va bien con el rabo. 25€'
    const salida = aplicarFiltrosVoz(entrada)
    // "va" → "Va" after "Mi elección: "
    assert.ok(/Mi elección: V/.test(salida) || /Mi elección: [A-ZÁÉÍÓÚÜ]/.test(salida))
  })
})
