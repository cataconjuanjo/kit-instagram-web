/**
 * FASE K — tests de contrato / degradación de la ficha.
 *
 * La lección de fases anteriores: las páginas se caen si un campo que
 * el JSX consume llega undefined. Aquí comprobamos que los helpers
 * nuevos no rompen cuando las tablas aún no están aplicadas en
 * Supabase (array vacío) y que la ficha sigue referenciando los
 * campos esperados.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { diasDesdeUltimoContacto } from '../app/lib/consultorContactos.js'
import { agregarSeguimiento, indiceSeguimiento } from '../app/lib/propuestasSeguimiento.js'

const FICHA = path.join(process.cwd(), 'app', 'admin', 'restaurante', '[id]', 'page.js')
const RADAR = path.join(process.cwd(), 'app', 'admin', 'consultoria', 'page.js')

describe('Degradación: la ficha funciona con tablas vacías (migración pendiente)', () => {
  it('diasDesdeUltimoContacto([]) devuelve null (no NaN, no explota)', () => {
    assert.equal(diasDesdeUltimoContacto([]), null)
  })
  it('agregarSeguimiento([]) devuelve objeto con la forma esperada', () => {
    const r = agregarSeguimiento([])
    assert.equal(typeof r.porEstado, 'object')
    assert.equal(r.estimado, 0)
    assert.equal(r.capturado, 0)
    assert.equal(r.total, 0)
    for (const k of ['propuesta', 'enviada', 'aceptada', 'implantada', 'rechazada']) {
      assert.ok(k in r.porEstado)
    }
  })
  it('indiceSeguimiento([]) devuelve {}', () => {
    assert.deepEqual(indiceSeguimiento([]), {})
  })
})

describe('Contrato: la ficha consume los helpers esperados', () => {
  const src = fs.readFileSync(FICHA, 'utf8')
  it('importa diasDesdeUltimoContacto, indiceSeguimiento, PASOS_UI y construirInformeCliente', () => {
    assert.ok(/diasDesdeUltimoContacto/.test(src))
    assert.ok(/indiceSeguimiento/.test(src))
    assert.ok(/PASOS_UI/.test(src))
    assert.ok(/construirInformeCliente/.test(src))
  })
  it('renderiza bloque de registro de contactos en la pestaña Resumen', () => {
    assert.ok(/ws-contactos-block/.test(src))
    assert.ok(/Registrar contacto/.test(src))
  })
  it('renderiza línea de pasos de seguimiento en propuestas', () => {
    assert.ok(/ws-seguimiento-paso/.test(src))
    assert.ok(/guardarSeguimiento/.test(src))
  })
  it('el botón "Informe para el cliente" está en la cabecera', () => {
    assert.ok(/Informe para el cliente/.test(src))
    assert.ok(/imprimirInformeCliente/.test(src))
  })
  it('la sección del informe de cliente se monta con la clase is-visible condicional', () => {
    assert.ok(/ws-informe-cliente/.test(src))
    assert.ok(/modoInformeCliente \? ' is-visible'/.test(src))
  })
})

describe('Radar: último contacto ya no es proxy a propuestasAbiertas+incidenciasStock', () => {
  const src = fs.readFileSync(RADAR, 'utf8')
  it('ya no usa Math.max(1, informe.propuestasAbiertas.length + informe.incidenciasStock.length)', () => {
    assert.ok(!/Último contacto: hace \{Math\.max\(1, informe\.propuestasAbiertas\.length \+ informe\.incidenciasStock\.length\) \} días/.test(src),
      'El proxy anterior sigue en el código')
  })
  it('usa diasDesdeUltimoContacto con los contactos filtrados por restaurante', () => {
    assert.ok(/diasDesdeUltimoContacto\(propios\)/.test(src))
  })
  it('monta bloque radar-propuestas-seguimiento y usa agregarSeguimiento', () => {
    assert.ok(/radar-propuestas-seguimiento/.test(src))
    assert.ok(/agregarSeguimiento\(seguimientos/.test(src))
  })
})
