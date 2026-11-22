/**
 * FASE K — Bloque 1: tests de los helpers puros del registro de contactos.
 *
 * Ejecuta: node --test scripts/consultorContactos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ultimoContactoPorRestaurante,
  diasDesdeUltimoContacto,
  contactoProgramadoVencido,
  sinContactoDesde,
  construirSenalesDeContacto,
  tareasMiDiaDesdeContactos,
} from '../app/lib/consultorContactos.js'

const DIA = 86400000
const HOY = new Date('2026-11-22T10:00:00Z').getTime()

describe('ultimoContactoPorRestaurante', () => {
  it('devuelve el más reciente por restaurante', () => {
    const contactos = [
      { restaurante_id: 'a', ocurrido_en: '2026-11-20T10:00:00Z', canal: 'llamada' },
      { restaurante_id: 'a', ocurrido_en: '2026-11-21T10:00:00Z', canal: 'email' },
      { restaurante_id: 'b', ocurrido_en: '2026-11-10T10:00:00Z', canal: 'visita' },
    ]
    const r = ultimoContactoPorRestaurante(contactos)
    assert.equal(r.a.canal, 'email')
    assert.equal(r.b.canal, 'visita')
  })
  it('ignora contactos sin restaurante_id o fecha inválida', () => {
    const r = ultimoContactoPorRestaurante([
      { ocurrido_en: '2026-11-22' },
      { restaurante_id: 'x', ocurrido_en: 'basura' },
    ])
    assert.deepEqual(r, {})
  })
})

describe('diasDesdeUltimoContacto', () => {
  it('devuelve null cuando no hay contactos', () => {
    assert.equal(diasDesdeUltimoContacto([], HOY), null)
  })
  it('cuenta días desde el más reciente', () => {
    const contactos = [
      { ocurrido_en: new Date(HOY - 5 * DIA).toISOString() },
      { ocurrido_en: new Date(HOY - 20 * DIA).toISOString() },
    ]
    assert.equal(diasDesdeUltimoContacto(contactos, HOY), 5)
  })
})

describe('contactoProgramadoVencido', () => {
  it('true si proximo_contacto es hoy', () => {
    const hoyIso = new Date(HOY).toISOString().slice(0, 10)
    assert.equal(contactoProgramadoVencido([{ proximo_contacto: hoyIso }], HOY), true)
  })
  it('true si proximo_contacto es ayer', () => {
    const ayerIso = new Date(HOY - DIA).toISOString().slice(0, 10)
    assert.equal(contactoProgramadoVencido([{ proximo_contacto: ayerIso }], HOY), true)
  })
  it('false si proximo_contacto es mañana', () => {
    const manana = new Date(HOY + 2 * DIA).toISOString().slice(0, 10)
    assert.equal(contactoProgramadoVencido([{ proximo_contacto: manana }], HOY), false)
  })
  it('false si no hay proximo_contacto', () => {
    assert.equal(contactoProgramadoVencido([{ proximo_contacto: null }], HOY), false)
  })
})

describe('sinContactoDesde', () => {
  it('true si nunca ha habido contacto', () => {
    assert.equal(sinContactoDesde([], 14, HOY), true)
  })
  it('true si el último fue hace más de 14 días', () => {
    const contactos = [{ ocurrido_en: new Date(HOY - 20 * DIA).toISOString() }]
    assert.equal(sinContactoDesde(contactos, 14, HOY), true)
  })
  it('false si el último fue hace 14 días o menos', () => {
    const contactos = [{ ocurrido_en: new Date(HOY - 10 * DIA).toISOString() }]
    assert.equal(sinContactoDesde(contactos, 14, HOY), false)
  })
})

describe('construirSenalesDeContacto + tareasMiDiaDesdeContactos', () => {
  const base = (over) => ({
    restaurante: { id: 'r1', nombre: 'R1' },
    propuestasInteresan: 0,
    alertasCriticas: 0,
    capitalLiberable: 0,
    costesBloqueantes: 0,
    isDemoAgregado: false,
    ...over,
  })

  it('añade señales contactoVencido y sinContactoReciente al contexto', () => {
    const ctx = base({})
    const propios = [{ proximo_contacto: new Date(HOY - DIA).toISOString().slice(0, 10) }]
    const r = construirSenalesDeContacto(ctx, propios, { ahora: HOY })
    assert.equal(r.contactoVencido, true)
    assert.equal(r.sinContactoReciente, true) // no hay ocurrido_en registrado
  })

  it('emite tarea contacto_vencido cuando corresponde', () => {
    const ctx = base({ restaurante: { id: 'a', nombre: 'A' }, contactoVencido: true, sinContactoReciente: true })
    const t = tareasMiDiaDesdeContactos([ctx])
    assert.equal(t.length, 1)
    assert.equal(t[0].tipo, 'contacto_vencido')
    assert.equal(t[0].urgencia, 85)
  })

  it('emite tarea sin_contacto si >14 días y no hay urgencias previas', () => {
    const ctx = base({ restaurante: { id: 'b', nombre: 'B' }, sinContactoReciente: true })
    const t = tareasMiDiaDesdeContactos([ctx])
    assert.equal(t.length, 1)
    assert.equal(t[0].tipo, 'sin_contacto')
  })

  it('no emite sin_contacto si ya hay alertas críticas o propuestas interesan', () => {
    const ctx1 = base({ restaurante: { id: 'c', nombre: 'C' }, sinContactoReciente: true, alertasCriticas: 2 })
    const ctx2 = base({ restaurante: { id: 'd', nombre: 'D' }, sinContactoReciente: true, propuestasInteresan: 1 })
    assert.equal(tareasMiDiaDesdeContactos([ctx1]).length, 0)
    assert.equal(tareasMiDiaDesdeContactos([ctx2]).length, 0)
  })

  it('excluye demos', () => {
    const ctx = base({ restaurante: { id: 'd', nombre: 'Demo' }, sinContactoReciente: true, isDemoAgregado: true })
    assert.equal(tareasMiDiaDesdeContactos([ctx]).length, 0)
  })
})
