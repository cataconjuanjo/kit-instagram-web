/**
 * Unit tests for app/lib/cartaPdfUtils.js
 * Ejecutar: node --test scripts/cartaPdfUtils.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatearPrecioPdf,
  agruparVinosPorSeccion,
  lineaOrigenVino,
  colorTextoSegunFondo,
  ratioContraste,
} from '../app/lib/cartaPdfUtils.js'

// El helper usa U+00A0 (NBSP) entre número y € para que no se partan de línea.
const NBSP = ' '

describe('formatearPrecioPdf', () => {
  it('entero sin decimales ni separador', () => {
    assert.equal(formatearPrecioPdf(47), `47${NBSP}€`)
    assert.equal(formatearPrecioPdf(9), `9${NBSP}€`)
  })
  it('céntimos con coma y dos decimales', () => {
    assert.equal(formatearPrecioPdf(12.5), `12,50${NBSP}€`)
    assert.equal(formatearPrecioPdf(8.99), `8,99${NBSP}€`)
  })
  it('4 cifras sin separador, 5+ con separador', () => {
    assert.equal(formatearPrecioPdf(1234), `1234${NBSP}€`)
    assert.equal(formatearPrecioPdf(10035), `10.035${NBSP}€`)
  })
  it('acepta string con coma', () => {
    assert.equal(formatearPrecioPdf('47,5'), `47,50${NBSP}€`)
  })
  it('devuelve null para valores no válidos o ≤ 0', () => {
    assert.equal(formatearPrecioPdf(null), null)
    assert.equal(formatearPrecioPdf(undefined), null)
    assert.equal(formatearPrecioPdf(''), null)
    assert.equal(formatearPrecioPdf(0), null)
    assert.equal(formatearPrecioPdf(-5), null)
    assert.equal(formatearPrecioPdf('abc'), null)
  })
  it('siempre incluye el símbolo €', () => {
    for (const val of [1, 9.9, 47, 1234, 99999]) {
      const out = formatearPrecioPdf(val)
      assert.ok(out && out.includes('€'), `"${out}" debería contener "€"`)
    }
  })
})

describe('agruparVinosPorSeccion', () => {
  const sample = [
    { nombre: 'Aalto',             tipo: 'tinto',  precio_botella: 60, activo: true },
    { nombre: 'Belondrade',        tipo: 'blanco', precio_botella: 45, activo: true },
    { nombre: 'Chivite',           tipo: 'rosado', precio_botella: 22, activo: true },
    { nombre: 'Vega Sicilia',      tipo: 'tinto',  precio_botella: 180, activo: true },
    { nombre: 'Gramona Imperial',  tipo: 'espumoso', precio_botella: 35, activo: true },
    { nombre: 'Inactivo',          tipo: 'tinto',  precio_botella: 20, activo: false },
    { nombre: 'Sin precio',        tipo: 'tinto',  precio_botella: null, activo: true },
    { nombre: 'Vermut Casa',       tipo: 'vermut', precio_botella: 18, activo: true }, // extra no canónico
  ]

  it('respeta orden canónico de tipos: tinto > blanco > rosado > espumoso > ...', () => {
    const { secciones } = agruparVinosPorSeccion(sample)
    const tipos = secciones.map(s => s.tipo)
    // Canónicos primero en orden, extras después
    assert.deepEqual(tipos.slice(0, 4), ['tinto', 'blanco', 'rosado', 'espumoso'])
    // Vermut (no canónico) va al final
    assert.ok(tipos.includes('vermut'))
    assert.equal(tipos[tipos.length - 1], 'vermut')
  })

  it('ordena alfabéticamente por nombre dentro de la sección', () => {
    const { secciones } = agruparVinosPorSeccion(sample)
    const tintos = secciones.find(s => s.tipo === 'tinto')
    assert.deepEqual(tintos.vinos.map(v => v.nombre), ['Aalto', 'Vega Sicilia'])
  })

  it('omite inactivos y sin precio_botella', () => {
    const { secciones, total, omitidos } = agruparVinosPorSeccion(sample)
    const nombres = secciones.flatMap(s => s.vinos.map(v => v.nombre))
    assert.ok(!nombres.includes('Inactivo'))
    assert.ok(!nombres.includes('Sin precio'))
    // 8 entradas, 1 inactiva (descartada) y 1 sin precio (omitida) → 6 visibles
    assert.equal(total, 6)
    assert.equal(omitidos.length, 1)
    assert.equal(omitidos[0].nombre, 'Sin precio')
  })

  it('label plural en español', () => {
    const { secciones } = agruparVinosPorSeccion(sample)
    const tintos = secciones.find(s => s.tipo === 'tinto')
    assert.equal(tintos.label, 'Tintos')
    const blancos = secciones.find(s => s.tipo === 'blanco')
    assert.equal(blancos.label, 'Blancos')
  })

  it('entrada no array devuelve estructura vacía', () => {
    const r = agruparVinosPorSeccion(null)
    assert.deepEqual(r.secciones, [])
    assert.equal(r.total, 0)
    assert.deepEqual(r.omitidos, [])
  })
})

describe('lineaOrigenVino', () => {
  it('uva · región (por defecto, sin bodega ni añada)', () => {
    assert.equal(
      lineaOrigenVino({ uva: 'Tempranillo', region: 'D.O. Rioja', bodega: 'Pago X', anada: '2019' }),
      'Tempranillo · D.O. Rioja'
    )
  })
  it('solo uva si no hay región', () => {
    assert.equal(lineaOrigenVino({ uva: 'Garnacha' }), 'Garnacha')
  })
  it('solo región si no hay uva', () => {
    assert.equal(lineaOrigenVino({ region: 'Jerez' }), 'Jerez')
  })
  it('vacío si no hay datos', () => {
    assert.equal(lineaOrigenVino({}), '')
    assert.equal(lineaOrigenVino(null), '')
  })
  it('con incluirBodega/incluirAnada añade ambos al final en su posición', () => {
    assert.equal(
      lineaOrigenVino(
        { uva: 'Tempranillo', region: 'D.O. Rioja', bodega: 'Pago X', anada: '2019' },
        { incluirBodega: true, incluirAnada: true }
      ),
      'Pago X · Tempranillo · D.O. Rioja · 2019'
    )
  })
})

describe('colorTextoSegunFondo', () => {
  it('fondo oscuro → texto claro', () => {
    assert.equal(colorTextoSegunFondo('#1a1a2e'), '#f6f4f0')
    assert.equal(colorTextoSegunFondo('#000000'), '#f6f4f0')
    assert.equal(colorTextoSegunFondo('#7B2D2D'), '#f6f4f0') // tinto corporativo
  })
  it('fondo claro → texto oscuro', () => {
    assert.equal(colorTextoSegunFondo('#ffffff'), '#111111')
    assert.equal(colorTextoSegunFondo('#f6f4f0'), '#111111') // crema del repo
  })
  it('hex inválido → texto oscuro por defecto', () => {
    assert.equal(colorTextoSegunFondo('nope'), '#111111')
    assert.equal(colorTextoSegunFondo(null), '#111111')
  })
})

describe('ratioContraste', () => {
  it('negro sobre blanco ≈ 21', () => {
    const r = ratioContraste('#000000', '#ffffff')
    assert.ok(r > 20.9 && r < 21.1)
  })
  it('mismo color = 1', () => {
    assert.equal(ratioContraste('#808080', '#808080'), 1)
  })
})
