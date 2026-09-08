import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparOfertasCatalogo,
  costePorBotella,
  ofertaMasBarata,
  resumenAgrupacionCatalogo,
} from '../app/lib/catalogoGrouping.mjs'

function oferta(id, overrides = {}) {
  return {
    id,
    nombre: 'Manzanilla Maruja',
    bodega: 'Juan Piñero',
    tipo: 'Generoso',
    region: 'Sanlúcar',
    anada: 'Saca 2025',
    formato: 'Botella 75 cl',
    coste_estimado: 15,
    proveedor: { id: `p-${id}`, nombre: `Proveedor ${id}` },
    ...overrides,
  }
}

test('agrupa ofertas del mismo vino y conserva todos sus ids', () => {
  const grupos = agruparOfertasCatalogo([
    oferta('a', { coste_estimado: 15 }),
    oferta('b', { coste_estimado: 25 }),
  ])
  assert.equal(grupos.length, 1)
  assert.deepEqual(grupos[0].ofertas.map(item => item.id), ['a', 'b'])
  assert.equal(grupos[0].ofertaPorDefecto.id, 'a')
})

test('no agrupa distinto productor, añada o formato', () => {
  const grupos = agruparOfertasCatalogo([
    oferta('same'),
    oferta('producer', { bodega: 'Otra bodega' }),
    oferta('vintage', { anada: '2024' }),
    oferta('format', { formato: 'Botella 50 cl' }),
  ])
  assert.equal(grupos.length, 4)
})

test('un nombre sin metadatos no se fusiona automáticamente', () => {
  const grupos = agruparOfertasCatalogo([
    { id: 'a', nombre: 'Vino X', coste_estimado: 15 },
    { id: 'b', nombre: 'Vino X', coste_estimado: 25 },
  ])
  assert.equal(grupos.length, 2)
})

test('normaliza cajas a coste por botella', () => {
  assert.equal(costePorBotella({ coste_estimado: 90, formato: 'Caja 6 x 75 cl' }), 15)
  assert.equal(costePorBotella({ coste_estimado: 90, formato: 'Caja 6 × 75 cl' }), 15)
})

test('no marca sin precio como mejor precio', () => {
  const grupo = agruparOfertasCatalogo([
    oferta('no-price', { coste_estimado: 0 }),
    oferta('priced', { coste_estimado: 25 }),
  ])[0]
  assert.equal(ofertaMasBarata(grupo).id, 'priced')
})

test('tolera una oferta o grupo inexistente sin romper el simulador', () => {
  assert.equal(costePorBotella(null), null)
  assert.equal(ofertaMasBarata(null), null)
})

test('el cambio manual conserva la identidad de la línea y solo cambia oferta y coste', () => {
  const grupos = agruparOfertasCatalogo([
    oferta('a', { coste_estimado: 15 }),
    oferta('b', { coste_estimado: 25 }),
  ])
  const linea = { id: 'linea-1', nombre: 'Manzanilla Maruja', precio_botella: 45, catalogo_vino_id: 'a', coste_compra: 15 }
  const nuevaOferta = grupos[0].ofertas.find(item => item.id === 'b')
  const actualizada = {
    ...linea,
    catalogo_vino_id: nuevaOferta.id,
    coste_compra: costePorBotella(nuevaOferta),
  }
  assert.equal(actualizada.id, linea.id)
  assert.equal(actualizada.precio_botella, linea.precio_botella)
  assert.equal(actualizada.catalogo_vino_id, 'b')
  assert.equal(actualizada.coste_compra, 25)
})

test('la concentración y el pedido cuentan la oferta elegida, no sus alternativas', () => {
  const lineas = [
    { id: 'l1', nombre: 'Vino X', proveedor_id: 'a', proveedor_nombre: 'Proveedor A', coste_compra: 15 },
    { id: 'l2', nombre: 'Vino Y', proveedor_id: 'b', proveedor_nombre: 'Proveedor B', coste_compra: 20 },
  ]
  const porProveedor = lineas.reduce((acc, linea) => {
    const key = linea.proveedor_id || linea.proveedor_nombre
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const pedido = lineas.reduce((acc, linea) => {
    const key = linea.proveedor_id || linea.proveedor_nombre
    acc[key] = (acc[key] || 0) + linea.coste_compra * 6
    return acc
  }, {})
  assert.deepEqual(porProveedor, { a: 1, b: 1 })
  assert.deepEqual(pedido, { a: 90, b: 120 })
})

test('conserva ofertas ambiguas separadas', () => {
  const grupos = agruparOfertasCatalogo([
    oferta('a', { nombre: 'Vino X', bodega: null, tipo: null, region: null, anada: null, formato: null }),
    oferta('b', { nombre: 'Vino X', bodega: null, tipo: null, region: null, anada: null, formato: null }),
  ])
  assert.equal(grupos.length, 2)
})

test('caso real El Espejo: dos nombres de proveedor forman un grupo con dos ofertas', () => {
  const grupos = agruparOfertasCatalogo([
    {
      id: 'espejo-vdd',
      nombre: 'Cantalapiedra El Espejo 2023',
      bodega: 'Cantalapiedra Viticultores',
      tipo: 'blanco',
      region: 'España',
      anada: '2023',
      referencia: 'VDD-0820',
      formato: 'botella 75 cl',
      coste_estimado: 27.5,
      disponibilidad: 'Vins Des Dieux julio 2026',
      proveedor_id: 'vins-des-dieux',
      proveedor: { id: 'vins-des-dieux', nombre: 'Vins Des Dieux' },
    },
    {
      id: 'espejo-somm',
      nombre: 'Majuelo El Espejo 2023',
      bodega: 'CANTALAPIEDRA',
      tipo: 'blanco',
      region: 'CASTILLA Y LEÓN',
      anada: '2023',
      referencia: null,
      formato: 'botella 75 cl',
      coste_estimado: 23.75,
      disponibilidad: null,
      proveedor_id: 'sommeliervinos',
      proveedor: { id: 'sommeliervinos', nombre: 'Sommeliervinos' },
    },
  ])

  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].ofertas.length, 2)
  assert.equal(grupos[0].numeroProveedores, 2)
  assert.equal(grupos[0].costeMinimo, 23.75)
  assert.deepEqual(grupos[0].ofertas.map(item => item.id).sort(), ['espejo-somm', 'espejo-vdd'])
  assert.equal(grupos[0].ofertas.find(item => item.id === 'espejo-vdd').referencia, 'VDD-0820')
})

test('la trazabilidad informa lineas originales, grupos, ofertas y proveedores', () => {
  const ofertas = [
    oferta('a', { proveedor_id: 'proveedor-a', proveedor: { id: 'proveedor-a', nombre: 'A' } }),
    oferta('b', { proveedor_id: 'proveedor-b', proveedor: { id: 'proveedor-b', nombre: 'B' }, coste_estimado: 20 }),
  ]
  const grupos = agruparOfertasCatalogo(ofertas)
  const resumen = resumenAgrupacionCatalogo(ofertas, grupos)

  assert.equal(resumen.lineasOriginales, 2)
  assert.equal(resumen.gruposCreados, 1)
  assert.deepEqual(resumen.grupos[0].ofertas, 2)
  assert.equal(resumen.grupos[0].proveedoresDistintos, 2)
})

test('no fusiona dos productos distintos del mismo productor', () => {
  const grupos = agruparOfertasCatalogo([
    {
      id: 'espejo',
      nombre: 'Majuelo El Espejo 2023',
      bodega: 'Cantalapiedra Viticultores',
      tipo: 'blanco',
      anada: '2023',
      formato: 'botella 75 cl',
      coste_estimado: 23.75,
      proveedor_id: 'a',
    },
    {
      id: 'chiviritero',
      nombre: 'Majuelo del Chiviritero 2023',
      bodega: 'Cantalapiedra',
      tipo: 'blanco',
      anada: '2023',
      formato: 'botella 75 cl',
      coste_estimado: 19.5,
      proveedor_id: 'b',
    },
  ])

  assert.equal(grupos.length, 2)
})

test('cuenta proveedores por identificador aunque compartan nombre visible', () => {
  const grupos = agruparOfertasCatalogo([
    oferta('a', { proveedor_id: 'a', proveedor: { id: 'a', nombre: 'Distribuidor' } }),
    oferta('b', { proveedor_id: 'b', proveedor: { id: 'b', nombre: 'Distribuidor' } }),
  ])
  assert.equal(grupos.length, 1)
  assert.equal(grupos[0].numeroProveedores, 2)
})
