/**
 * FASE J2-fix — tests del agregador de conteos (scope=lite).
 *
 * Garantiza:
 *  - Mismo total/conCoste/sinPrecio que calcularíamos en el cliente con
 *    scope=full (filas descargadas y filtradas en memoria).
 *  - Conteos por proveedor agregan correctamente.
 *  - Filas con coste 0, null o "" cuentan como sinPrecio.
 *
 * Ejecuta: node --test scripts/proveedoresConteos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { agregarConteos } from '../app/lib/proveedoresConteos.js'

describe('agregarConteos', () => {
  it('agrega totales como lo haría la cuenta full en memoria', () => {
    const filas = [
      { proveedor_id: 'a', coste_estimado: 10 },
      { proveedor_id: 'a', coste_estimado: 0 },
      { proveedor_id: 'a', coste_estimado: null },
      { proveedor_id: 'b', coste_estimado: 25 },
      { proveedor_id: 'b', coste_estimado: 15 },
      { proveedor_id: 'c', coste_estimado: '' },
    ]
    const r = agregarConteos(filas)
    assert.equal(r.total, 6)
    assert.equal(r.conCoste, 3)       // a:1, b:2, c:0
    assert.equal(r.sinPrecio, 3)
  })

  it('agrupa por proveedor (coincide con reducir en cliente)', () => {
    const filas = [
      { proveedor_id: 'a', coste_estimado: 1 },
      { proveedor_id: 'a', coste_estimado: 2 },
      { proveedor_id: 'b', coste_estimado: 3 },
    ]
    const r = agregarConteos(filas)
    assert.deepEqual(r.porProveedor, { a: 2, b: 1 })
    assert.deepEqual(r.porProveedorConCoste, { a: 2, b: 1 })
  })

  it('REGRESIÓN (preview b356bafa): sin este agregador el header mostraba 0 referencias', () => {
    // El cliente antes contaba vinos.length en memoria; con scope=lite
    // vinos estaba vacío y salía 0. Ahora los totales vienen del API.
    const filasSimuladas = Array.from({ length: 9097 }, (_, i) => ({
      proveedor_id: `p${i % 10}`,
      coste_estimado: i < 8912 ? 10 : 0,
    }))
    const r = agregarConteos(filasSimuladas)
    assert.equal(r.total, 9097)
    assert.equal(r.conCoste, 8912)
    assert.equal(r.sinPrecio, 185)
  })

  it('escenario lite == full para los mismos datos', () => {
    // El resultado del agregador tiene que ser idéntico a lo que daría
    // procesar las filas en el cliente con scope=full.
    const filas = [
      { proveedor_id: 'a', coste_estimado: 7 },
      { proveedor_id: 'a', coste_estimado: 0 },
      { proveedor_id: 'b', coste_estimado: 3 },
    ]
    const lite = agregarConteos(filas)

    // Simulamos lo que el page hacía con vinos ya cargados:
    const vinos = filas
    const total = vinos.length
    const conCoste = vinos.filter(v => Number(v.coste_estimado) > 0).length
    const sinCoste = total - conCoste
    const porProveedor = vinos.reduce((acc, v) => {
      acc[v.proveedor_id] = (acc[v.proveedor_id] || 0) + 1
      return acc
    }, {})

    assert.equal(lite.total, total)
    assert.equal(lite.conCoste, conCoste)
    assert.equal(lite.sinPrecio, sinCoste)
    assert.deepEqual(lite.porProveedor, porProveedor)
  })

  it('ignora filas falsy', () => {
    const r = agregarConteos([null, undefined, { proveedor_id: 'a', coste_estimado: 1 }])
    assert.equal(r.total, 1)
  })
})
