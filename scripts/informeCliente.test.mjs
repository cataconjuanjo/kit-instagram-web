/**
 * FASE K — Bloque 3: tests del informe de cliente de 1 página.
 *
 * Garantiza:
 *  - No contiene jerga interna (score, snapshot, fase N, /dashboard/).
 *  - Las 3 prioridades vienen limpiadas por limpiarRutasTecnicas.
 *  - La cifra principal se formatea en EUR.
 *  - El seguimiento se renderiza SOLO si hay datos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirInformeCliente, auditarInformeCliente } from '../app/lib/informeCliente.js'

describe('construirInformeCliente', () => {
  it('monta la estructura mínima con la cifra principal', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'Casa Marisma', ciudad: 'Málaga' },
      oportunidadEuros: 2850,
      prioridades: [
        { titulo: 'Poca estrategia por copa', detalle: 'Ve a /dashboard/vinos?filtro=pendientes' },
        { titulo: 'Margen bajo en 12 referencias', detalle: 'Revisar compras' },
      ],
    })
    assert.equal(r.titulo, 'Cata con Juanjo · Informe de carta')
    assert.equal(r.restaurante.nombre, 'Casa Marisma')
    assert.ok(r.cifraPrincipal.valor && r.cifraPrincipal.valor.includes('€'))
    assert.ok(r.cifraPrincipal.frase.length > 0)
    assert.equal(r.prioridades.length, 2)
  })

  it('las prioridades son como máximo 3', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      prioridades: Array.from({ length: 10 }, (_, i) => ({ titulo: `T${i}` })),
    })
    assert.equal(r.prioridades.length, 3)
  })

  it('oportunidad cero o nula se presenta con frase alternativa', () => {
    const r = construirInformeCliente({ restaurante: { nombre: 'X' }, oportunidadEuros: 0 })
    assert.equal(r.cifraPrincipal.valor, null)
    assert.ok(r.cifraPrincipal.frase.includes('pendiente de cuantificar'))
  })

  it('el seguimiento sólo se incluye si viene', () => {
    const r1 = construirInformeCliente({ restaurante: { nombre: 'X' } })
    assert.equal(r1.seguimiento, null)
    const r2 = construirInformeCliente({
      restaurante: { nombre: 'X' },
      seguimiento: { porEstado: { enviada: 1, aceptada: 2, implantada: 1, propuesta: 0, rechazada: 0 }, capturado: 450 },
    })
    assert.equal(r2.seguimiento.enviadas, 4) // enviada + aceptada + implantada
    assert.equal(r2.seguimiento.aceptadas, 3)
    assert.equal(r2.seguimiento.implantadas, 1)
    assert.ok(r2.seguimiento.capturado && r2.seguimiento.capturado.includes('€'))
  })
})

describe('auditarInformeCliente — SIN jerga interna', () => {
  it('no permite "score", "snapshot", "fase N", "/dashboard/" ni "motor persistente"', () => {
    // Un informe limpio pasa.
    const limpio = construirInformeCliente({
      restaurante: { nombre: 'Casa Marisma' },
      oportunidadEuros: 2850,
      prioridades: [{ titulo: 'Carta corta', detalle: 'Añadir 5 referencias' }],
    })
    assert.equal(auditarInformeCliente(limpio).limpio, true)

    // Si se cuela jerga por error, auditar lo detecta.
    const sucio = {
      cifraPrincipal: { frase: 'score 72' },
      prioridades: [{ titulo: 'Ir a /dashboard/vinos' }],
    }
    const r = auditarInformeCliente(sucio)
    assert.equal(r.limpio, false)
    assert.ok(r.banderas.length >= 2)
  })

  it('limpiarTextoCliente elimina las rutas técnicas de .accion/.detalle', () => {
    const r = construirInformeCliente({
      restaurante: { nombre: 'X' },
      prioridades: [{ titulo: 'Entra en /dashboard/vinos?filtro=pendientes', detalle: 'Ver /dashboard/platos?filtro=X' }],
    })
    const txt = JSON.stringify(r)
    assert.ok(!/\/dashboard\//i.test(txt), 'El informe no debe contener /dashboard/')
  })
})

describe('Degradación del informe cuando faltan datos', () => {
  it('sin oportunidad y sin prioridades, sigue produciendo objeto válido', () => {
    const r = construirInformeCliente({ restaurante: { nombre: 'X' } })
    assert.equal(r.prioridades.length, 0)
    assert.equal(typeof r.titulo, 'string')
    assert.equal(typeof r.fecha, 'string')
  })

  it('sin restaurante usa fallback "Restaurante"', () => {
    const r = construirInformeCliente({})
    assert.equal(r.restaurante.nombre, 'Restaurante')
  })
})
