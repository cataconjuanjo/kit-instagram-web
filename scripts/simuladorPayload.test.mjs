// Tests de la matriz plan → claves del payload de /api/simulador.
//
// Comprueba que un restaurante con plan pro/bodega/sumiller NUNCA recibe
// catalogo_vino_id, proveedor_id, proveedor_nombre, pvp_recomendado_catalogo
// ni pvp_copa_catalogo. El coste_compra propio sí viaja (es su snapshot).
//
// Ejecutar: node --test scripts/simuladorPayload.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  proyectarLineaSimulador,
  proyectarLineasSimulador,
  CLAVES_CATALOGO_CONSULTOR,
} from '../app/lib/simuladorPayload.js'

const LINEA_REAL = {
  id: 'linea-1',
  restaurante_id: 'rest-1',
  vino_id: 'vino-1',
  nombre: 'Vino Demo',
  bodega: 'Bodega Demo',
  tipo: 'tinto',
  region: 'Rioja',
  anada: '2021',
  precio_botella: 28,
  precio_copa: 5.5,
  coste_compra: 9.5,           // snapshot propio del restaurante
  estado: 'actual',
  // Columnas que vienen del catálogo privado:
  catalogo_vino_id: 'cat-99',
  proveedor_id: 'prov-7',
  proveedor_nombre: 'Distribuidora Z',
  pvp_recomendado_catalogo: 30,
  pvp_copa_catalogo: 6,
}

test('premium (puedeVerCatalogo=true): la línea viaja entera', () => {
  const r = proyectarLineaSimulador(LINEA_REAL, { puedeVerCatalogo: true })
  for (const clave of CLAVES_CATALOGO_CONSULTOR) {
    assert.ok(Object.prototype.hasOwnProperty.call(r, clave), `premium debe mantener ${clave}`)
  }
  assert.equal(r.coste_compra, 9.5)
})

test('pro (puedeVerCatalogo=false): se eliminan todas las claves del catálogo', () => {
  const r = proyectarLineaSimulador(LINEA_REAL, { puedeVerCatalogo: false })
  for (const clave of CLAVES_CATALOGO_CONSULTOR) {
    assert.equal(r[clave], undefined, `pro NO debe recibir ${clave}`)
    assert.ok(!Object.prototype.hasOwnProperty.call(r, clave), `pro NO debe tener la propiedad ${clave}`)
  }
})

test('pro: coste_compra propio se conserva (es snapshot del restaurante)', () => {
  const r = proyectarLineaSimulador(LINEA_REAL, { puedeVerCatalogo: false })
  assert.equal(r.coste_compra, 9.5)
})

test('pro: campos operativos propios siguen intactos', () => {
  const r = proyectarLineaSimulador(LINEA_REAL, { puedeVerCatalogo: false })
  assert.equal(r.nombre, 'Vino Demo')
  assert.equal(r.bodega, 'Bodega Demo')
  assert.equal(r.precio_botella, 28)
  assert.equal(r.precio_copa, 5.5)
  assert.equal(r.region, 'Rioja')
  assert.equal(r.anada, '2021')
  assert.equal(r.estado, 'actual')
})

test('sumiller equivale a pro/bodega: puedeVerCatalogo=false por plan', () => {
  // La función es agnóstica al nombre del plan; solo depende del flag
  // puedeVerCatalogo. Las rutas /api/simulador* lo calculan con
  // puedeUsar(restaurante, 'catalogo_consultor'). Aquí verificamos la
  // simetría: mismo input → mismo output.
  const pro      = proyectarLineaSimulador(LINEA_REAL, { puedeVerCatalogo: false })
  const bodega   = proyectarLineaSimulador(LINEA_REAL, { puedeVerCatalogo: false })
  const sumiller = proyectarLineaSimulador(LINEA_REAL, { puedeVerCatalogo: false })
  assert.deepEqual(pro, bodega)
  assert.deepEqual(bodega, sumiller)
})

test('lista vacía o null no rompen', () => {
  assert.deepEqual(proyectarLineasSimulador(null,  { puedeVerCatalogo: false }), [])
  assert.deepEqual(proyectarLineasSimulador([],    { puedeVerCatalogo: false }), [])
  assert.deepEqual(proyectarLineasSimulador([LINEA_REAL], { puedeVerCatalogo: true })[0].catalogo_vino_id, 'cat-99')
})

test('matriz canónica: CLAVES_CATALOGO_CONSULTOR es la fuente única', () => {
  assert.deepEqual([...CLAVES_CATALOGO_CONSULTOR].sort(), [
    'catalogo_vino_id',
    'proveedor_id',
    'proveedor_nombre',
    'pvp_copa_catalogo',
    'pvp_recomendado_catalogo',
  ])
})
