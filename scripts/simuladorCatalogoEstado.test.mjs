/**
 * FASE J2-fix — tests estáticos del simulador-cartas:
 *  (a) Los botones 'Generar simulación' y 'Guardar propuestas' quedan
 *      desactivados hasta que el catálogo haya cargado.
 *  (b) Hay un indicador visible "Cargando catálogo…".
 *  (c) El catálogo se carga en segundo plano (scope=full) tras la primera
 *      pintura y se marca setCatalogoListo(true) al terminar.
 *
 * Ejecuta: node --test scripts/simuladorCatalogoEstado.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const FICHERO = path.join(process.cwd(), 'app', 'admin', 'simulador-cartas', 'page.js')

describe('Simulador: estado de carga del catálogo bloquea los botones', () => {
  const src = fs.readFileSync(FICHERO, 'utf8')

  it('el botón "Generar simulación" se desactiva si !catalogoListo', () => {
    assert.ok(/disabled=\{!catalogoListo\}/.test(src),
      'Falta disabled={!catalogoListo} en Generar simulación.')
  })

  it('el botón "Guardar propuestas" se desactiva si !catalogoListo', () => {
    assert.ok(/!simulacionEditada\s*\|\|\s*guardando\s*\|\|\s*!catalogoListo/.test(src),
      'Falta la condición !catalogoListo en el disabled de Guardar propuestas.')
  })

  it('muestra indicador "Cargando catálogo… las altas aparecerán en unos segundos"', () => {
    assert.ok(src.includes('Cargando catálogo del fondo común… las altas aparecerán en unos segundos.'),
      'Falta el texto del indicador de carga del catálogo.')
  })

  it('el catálogo se carga tras la primera pintura con scope=full y marca listo', () => {
    assert.ok(/setCatalogoCargando\(true\)/.test(src),
      'El flag catalogoCargando no se activa al empezar la carga en background.')
    assert.ok(/proveedores\?scope=full/.test(src),
      'El fetch del catálogo no usa scope=full.')
    assert.ok(/setCatalogoListo\(true\)/.test(src),
      'El flag catalogoListo no se activa al terminar la carga.')
  })

  it('el estado se declara al inicio del componente', () => {
    assert.ok(/const \[catalogoListo, setCatalogoListo\] = useState\(false\)/.test(src))
    assert.ok(/const \[catalogoCargando, setCatalogoCargando\] = useState\(false\)/.test(src))
  })
})

describe('Simulador: comportamiento con y sin catálogo (sin negocio alterado)', () => {
  const src = fs.readFileSync(FICHERO, 'utf8')

  it('generarSimulacion sigue existiendo como función pura con los mismos campos', () => {
    assert.ok(/function generarSimulacion\(\{\s*vinosRestaurante,\s*vinosCatalogo,\s*proveedoresPorId/.test(src),
      'La función generarSimulacion ha cambiado de firma.')
  })

  it('sin catálogo cargado (catalogoListo=false) no se puede disparar la simulación — el botón está bloqueado', () => {
    // Verificación indirecta: el botón sin catálogoListo lleva el texto
    // 'Cargando catálogo…' en vez de 'Generar simulación'.
    assert.ok(/catalogoListo\s*\?\s*'Generar simulación'\s*:\s*'Cargando catálogo…'/.test(src),
      'El label del botón no refleja el estado de carga.')
  })

  it('REGRESIÓN preview b356bafa: ya no se dispara sólo el fetch por proveedor', () => {
    // El useEffect([proveedorId]) que cargaba sólo el proveedor
    // seleccionado fue el que dejaba altas en 0 porque el catálogo del
    // resto nunca llegaba. Ahora se descarta en favor de la carga full.
    assert.ok(!/useEffect\(\(\) => \{\s*if \(!proveedorId\) return[\s\S]{0,400}scope.*proveedor_id/.test(src),
      'El useEffect de carga por proveedor seguía activo y bloqueaba las altas.')
  })
})
