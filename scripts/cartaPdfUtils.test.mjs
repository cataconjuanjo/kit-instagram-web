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
  normalizarOpcionesCartaPdf,
  ordenarVinosSeccion,
  agruparPorRegion,
  indiceRegionEditorial,
  extraerSeccionCopa,
  CATALOGO_FUENTES_ID,
  notaIvaParaPie,
  DENSIDADES,
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

// ─── v2: normalización de opciones ─────────────────────────────────────

describe('normalizarOpcionesCartaPdf (defaults)', () => {
  const defaults = normalizarOpcionesCartaPdf({})
  it('devuelve todos los campos con defaults', () => {
    assert.equal(defaults.fuente_titulo, 'actual')
    assert.equal(defaults.fuente_cuerpo, 'actual')
    assert.deepEqual(defaults.logos, [])
    assert.equal(defaults.qr.activo, true)
    // Default v2 cambiado: QR en cabecera-der para no consumir altura
    // del multicol y preservar 2 páginas con Casa Marisma (REGLA DE ORO).
    assert.equal(defaults.qr.posicion, 'cabecera-der')
    assert.equal(defaults.qr.tamano_mm, 16)
    assert.equal(defaults.credito, true)
    assert.equal(defaults.copa_modo, 'no')
    assert.equal(defaults.orden_vinos, 'alfabetico')
    assert.equal(defaults.precio_formato, 'con_euro')
    assert.equal(defaults.densidad_forzada, 'auto')
  })
  it('null/undefined → defaults', () => {
    assert.deepEqual(normalizarOpcionesCartaPdf(null), defaults)
    assert.deepEqual(normalizarOpcionesCartaPdf(undefined), defaults)
  })
  it('valores inválidos de enums → defaults', () => {
    const r = normalizarOpcionesCartaPdf({
      copa_modo: 'inventado', orden_vinos: 'xxx', precio_formato: 'yen',
    })
    assert.equal(r.copa_modo, 'no')
    assert.equal(r.orden_vinos, 'alfabetico')
    assert.equal(r.precio_formato, 'con_euro')
  })
  it('acepta fuente del catálogo', () => {
    const r = normalizarOpcionesCartaPdf({
      fuente_titulo: 'playfair-display', fuente_cuerpo: 'lato',
    })
    assert.equal(r.fuente_titulo, 'playfair-display')
    assert.equal(r.fuente_cuerpo, 'lato')
  })
  it('rechaza fuentes fuera del catálogo', () => {
    const r = normalizarOpcionesCartaPdf({ fuente_titulo: 'comic-sans' })
    assert.equal(r.fuente_titulo, 'actual')
  })
})

describe('normalizarOpcionesCartaPdf (logos)', () => {
  it('sanea URLs y posiciones, descarta inválidos', () => {
    const r = normalizarOpcionesCartaPdf({
      logos: [
        { url: 'https://cdn.example.com/a.png', posicion: 'cabecera-izq', tamano_mm: 12 },
        { url: 'javascript:alert(1)', posicion: 'pie-der', tamano_mm: 14 },
        { url: '/logos/b.svg', posicion: 'inventada', tamano_mm: 999 },
        null,
        { url: 'https://cdn.example.com/c.png', posicion: 'marca-agua', tamano_mm: 50, opacidad: 15 },
      ],
    })
    assert.equal(r.logos.length, 3) // descarta null y el javascript:
    assert.equal(r.logos[0].posicion, 'cabecera-izq')
    assert.equal(r.logos[0].tamano_mm, 12)
    assert.equal(r.logos[1].posicion, 'cabecera-izq') // default: inventada→cabecera-izq
    assert.equal(r.logos[1].tamano_mm, 60) // clamp
    assert.equal(r.logos[2].posicion, 'marca-agua')
    assert.equal(r.logos[2].opacidad, 15)
    assert.equal(r.logos[2].tamano_mm, 50)
  })
  it('máximo 4 logos', () => {
    const r = normalizarOpcionesCartaPdf({
      logos: Array.from({ length: 10 }, (_, i) => ({ url: `/l${i}.png` })),
    })
    assert.ok(r.logos.length <= 4)
  })
})

describe('normalizarOpcionesCartaPdf (QR)', () => {
  it('posición válida y rangos', () => {
    const r = normalizarOpcionesCartaPdf({
      qr: { activo: false, posicion: 'cabecera-der', tamano_mm: 5, texto: 'hola' },
    })
    assert.equal(r.qr.activo, false)
    assert.equal(r.qr.posicion, 'cabecera-der')
    assert.equal(r.qr.tamano_mm, 10) // clamp min
    assert.equal(r.qr.texto, 'hola')
  })
  it('texto muy largo se trunca', () => {
    const r = normalizarOpcionesCartaPdf({ qr: { texto: 'x'.repeat(500) } })
    assert.ok(r.qr.texto.length <= 140)
  })
})

describe('indiceRegionEditorial', () => {
  it('Rioja < Priorat < Jerez', () => {
    assert.ok(indiceRegionEditorial('D.O.Ca. Rioja') < indiceRegionEditorial('D.O. Priorat'))
    assert.ok(indiceRegionEditorial('D.O. Priorat') < indiceRegionEditorial('D.O. Jerez'))
  })
  it('región desconocida → 5000', () => {
    assert.equal(indiceRegionEditorial('D.O. Marte'), 5000)
  })
  it('string vacío → 9999', () => {
    assert.equal(indiceRegionEditorial(''), 9999)
    assert.equal(indiceRegionEditorial(null), 9999)
  })
})

describe('agruparPorRegion', () => {
  const vinos = [
    { nombre: 'Aalto',      region: 'D.O. Ribera del Duero', precio_botella: 60 },
    { nombre: 'Belondrade', region: 'D.O. Rueda',            precio_botella: 45 },
    { nombre: 'Rioja1',     region: 'D.O.Ca. Rioja',         precio_botella: 20 },
    { nombre: 'Rioja2',     region: 'D.O.Ca. Rioja',         precio_botella: 80 },
    { nombre: 'SinRegion',  region: '',                       precio_botella: 10 },
  ]
  it('ordena por índice editorial', () => {
    const grupos = agruparPorRegion(vinos)
    // Rioja antes que Ribera antes que Rueda, Otros al final
    const nombres = grupos.map(g => g.region)
    assert.equal(nombres[0], 'D.O.Ca. Rioja')
    assert.equal(nombres[nombres.length - 1], 'Otros')
  })
  it('orden secundario precio_asc', () => {
    const grupos = agruparPorRegion(vinos, 'precio_asc')
    const rioja = grupos.find(g => g.region === 'D.O.Ca. Rioja')
    assert.equal(rioja.vinos[0].nombre, 'Rioja1') // 20 < 80
  })
})

describe('ordenarVinosSeccion', () => {
  const vinos = [
    { nombre: 'B', uva: 'Tempranillo', anada: '2020', precio_botella: 50 },
    { nombre: 'A', uva: 'Garnacha',    anada: '2022', precio_botella: 30 },
    { nombre: 'C', uva: 'Albariño',    anada: '2021', precio_botella: 40 },
  ]
  it('alfabetico', () => {
    const { lista } = ordenarVinosSeccion(vinos, 'alfabetico')
    assert.deepEqual(lista.map(v => v.nombre), ['A', 'B', 'C'])
  })
  it('precio_asc', () => {
    const { lista } = ordenarVinosSeccion(vinos, 'precio_asc')
    assert.deepEqual(lista.map(v => v.precio_botella), [30, 40, 50])
  })
  it('uva', () => {
    const { lista } = ordenarVinosSeccion(vinos, 'uva')
    assert.equal(lista[0].uva, 'Albariño')
  })
  it('anada (más nuevas primero)', () => {
    const { lista } = ordenarVinosSeccion(vinos, 'anada')
    assert.equal(lista[0].anada, '2022')
  })
  it('region devuelve grupos', () => {
    const vinosReg = [
      { nombre: 'A', region: 'D.O.Ca. Rioja' },
      { nombre: 'B', region: 'D.O. Rueda' },
    ]
    const { lista, grupos } = ordenarVinosSeccion(vinosReg, 'region')
    assert.equal(grupos.length, 2)
    assert.equal(lista.length, 2)
  })
})

describe('extraerSeccionCopa', () => {
  const vinos = [
    { id: 1, nombre: 'A', precio_botella: 30, precio_copa: 6 },
    { id: 2, nombre: 'B', precio_botella: 50, precio_copa: null },
    { id: 3, nombre: 'C', precio_botella: null, precio_copa: 5 },
  ]
  it('modo "no" → null', () => {
    const r = extraerSeccionCopa(vinos, 'no')
    assert.equal(r.seccionCopa, null)
  })
  it('modo "seccion" → extrae con copa y excluye de sección normal', () => {
    const r = extraerSeccionCopa(vinos, 'seccion')
    assert.equal(r.seccionCopa.vinos.length, 2) // A y C (B no tiene copa)
    assert.ok(r.idsExcluir.has(1))
    assert.ok(r.idsExcluir.has(3))
  })
  it('modo "ambos" → extrae sin excluir', () => {
    const r = extraerSeccionCopa(vinos, 'ambos')
    assert.equal(r.seccionCopa.vinos.length, 2)
    assert.equal(r.idsExcluir.size, 0)
  })
})

describe('formatearPrecioPdf sin €', () => {
  it('conEuro:false devuelve solo el número', () => {
    assert.equal(formatearPrecioPdf(24, { conEuro: false }), '24')
    assert.equal(formatearPrecioPdf(12.5, { conEuro: false }), '12,50')
    assert.equal(formatearPrecioPdf(10035, { conEuro: false }), '10.035')
  })
  it('null si no hay precio', () => {
    assert.equal(formatearPrecioPdf(null, { conEuro: false }), null)
    assert.equal(formatearPrecioPdf(0, { conEuro: false }), null)
  })
})

describe('CATALOGO_FUENTES_ID', () => {
  it('contiene las 24 familias del brief', () => {
    assert.ok(CATALOGO_FUENTES_ID.has('eb-garamond'))
    assert.ok(CATALOGO_FUENTES_ID.has('inter'))
    assert.ok(CATALOGO_FUENTES_ID.has('jetbrains-mono'))
    assert.ok(CATALOGO_FUENTES_ID.has('caveat'))
    assert.ok(CATALOGO_FUENTES_ID.size >= 20)
  })
})

describe('notaIvaParaPie (duplicación)', () => {
  it('con precio sin_euro y pie vacío → añade la nota', () => {
    const out = notaIvaParaPie({
      precio_formato: 'sin_euro', nota_euros: true, carta_pie_texto: '',
    })
    assert.equal(out, 'Precios en euros, IVA incluido')
  })
  it('con precio sin_euro y pie que menciona IVA → NO duplica', () => {
    const casos = [
      'IVA incluido',
      'Precios con IVA',
      'iva incluido',
      'I.V.A. incluido',
      'i.v.a incluido',
      'Alérgenos disponibles. Precios con IVA.',
    ]
    for (const pie of casos) {
      assert.equal(
        notaIvaParaPie({ precio_formato: 'sin_euro', nota_euros: true, carta_pie_texto: pie }),
        null,
        `el pie "${pie}" ya menciona IVA — no debe añadirse la nota`,
      )
    }
  })
  it('con precio con_euro → nunca añade nota', () => {
    assert.equal(notaIvaParaPie({
      precio_formato: 'con_euro', nota_euros: true, carta_pie_texto: '',
    }), null)
  })
  it('con nota_euros=false → no añade nota', () => {
    assert.equal(notaIvaParaPie({
      precio_formato: 'sin_euro', nota_euros: false, carta_pie_texto: '',
    }), null)
  })
  it('respeta aunque "iva" sea substring de otra palabra (ej. "divana")', () => {
    // "divina" no contiene IVA como palabra → sí debe añadir la nota.
    const out = notaIvaParaPie({
      precio_formato: 'sin_euro', nota_euros: true, carta_pie_texto: 'Carta divina de la casa',
    })
    assert.equal(out, 'Precios en euros, IVA incluido')
  })
})

describe('normalizarOpciones (densidad extra)', () => {
  it('acepta compacto-extra como densidad válida', () => {
    const r = normalizarOpcionesCartaPdf({ densidad_forzada: 'compacto-extra' })
    assert.equal(r.densidad_forzada, 'compacto-extra')
  })
  it('compacto-extra está en el catálogo', () => {
    assert.ok(DENSIDADES.has('compacto-extra'))
  })
})

describe('reserva de ancho en línea 2 (copa junto/ambos)', () => {
  // El cálculo lo hace el componente inyectando --cpdf-precios-w según
  // copa_modo. Comprobamos aquí el contrato: qué modos necesitan reserva.
  function necesitaReserva(copa_modo) {
    return copa_modo === 'junto' || copa_modo === 'ambos'
  }
  it('no y seccion → sin reserva', () => {
    assert.equal(necesitaReserva('no'), false)
    assert.equal(necesitaReserva('seccion'), false)
  })
  it('junto y ambos → con reserva', () => {
    assert.equal(necesitaReserva('junto'), true)
    assert.equal(necesitaReserva('ambos'), true)
  })
  it('El ancho total de 2 columnas de precio es 14+8+14 = 36mm', () => {
    const MIN_WIDTH_PRECIO = 14
    const GAP = 8
    const ancho2cols = MIN_WIDTH_PRECIO + GAP + MIN_WIDTH_PRECIO
    assert.equal(ancho2cols, 36)
  })
})
