/**
 * FASE J — tests del helper único de métricas del panel de consultor.
 * Garantizan que Radar, ficha e informe devuelven el mismo valor para los
 * mismos datos de entrada.
 *
 * Ejecuta: node --test scripts/consultoriaMetricas.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcPuntuacion,
  calcCapitalLiberable,
  calcAlertasCriticas,
  calcCandidatosCopa,
  describirFotos,
  seleccionarTareasMiDia,
  seleccionarMatchesAutoaplicables,
  esExcluidoDeAgregado,
  limpiarRutasTecnicas,
  deduplicarAcciones,
} from '../app/lib/consultoriaMetricas.js'

// Entrada común que simula a Casa Marisma con sus 36 "MEDIA".
const casaMarismaAnalisis = {
  score: 36,
  prioridad: 'Media',
  alertas: [
    { peso: 14, titulo: 'Carta corta', servicio: 'A' },
    { peso: 12, titulo: 'Poca estrategia por copa', servicio: 'B' },
    { peso: 10, titulo: 'Stock', servicio: 'C' },
  ],
}

describe('calcPuntuacion (fuente única)', () => {
  it('devuelve lo mismo si se le pasa el mismo análisis desde Radar o ficha', () => {
    const a = calcPuntuacion(casaMarismaAnalisis)
    const b = calcPuntuacion({ ...casaMarismaAnalisis })
    assert.deepEqual(a, b)
    assert.equal(a.score, 36)
    assert.equal(a.prioridad, 'Media')
    assert.equal(a.etiqueta, 'MEDIA')
  })
  it('deriva prioridad si falta', () => {
    assert.equal(calcPuntuacion({ score: 70 }).prioridad, 'Alta')
    assert.equal(calcPuntuacion({ score: 40 }).prioridad, 'Media')
    assert.equal(calcPuntuacion({ score: 10 }).prioridad, 'Baja')
  })
  it('acota score a [0,100]', () => {
    assert.equal(calcPuntuacion({ score: 999 }).score, 100)
    assert.equal(calcPuntuacion({ score: -5 }).score, 0)
  })
})

describe('calcCapitalLiberable (una sola verdad)', () => {
  it('snapshot persistido pisa cualquier estimación', () => {
    const r = calcCapitalLiberable({
      snapshotOportunidad: { capital_liberable_estimado: 1200 },
      resumenEjecutivo: { capital_liberable_estimado: 50 },
      metricas: { valorCoste: 100000, vinos: 100, margenBajo: 10, bajoMinimo: 5, sinProveedor: 10 },
    })
    assert.deepEqual(r, { valor: 1200, fuente: 'persistido' })
  })
  it('sin snapshot, usa resumenEjecutivo', () => {
    const r = calcCapitalLiberable({
      snapshotOportunidad: null,
      resumenEjecutivo: { capital_liberable_estimado: 296 },
      metricas: { valorCoste: 100, vinos: 10 },
    })
    assert.deepEqual(r, { valor: 296, fuente: 'persistido' })
  })
  it('sin persistido, estima a partir de metricas', () => {
    const r = calcCapitalLiberable({
      snapshotOportunidad: null,
      resumenEjecutivo: null,
      metricas: { valorCoste: 10000, vinos: 50, margenBajo: 10, bajoMinimo: 0, sinProveedor: 0 },
    })
    assert.equal(r.fuente, 'estimado')
    assert.ok(r.valor > 0)
  })
  it('Radar y ficha devuelven lo mismo con los mismos datos', () => {
    const entradas = {
      snapshotOportunidad: { capital_liberable_estimado: 296 },
      resumenEjecutivo: null,
      metricas: null,
    }
    assert.deepEqual(calcCapitalLiberable(entradas), calcCapitalLiberable(entradas))
  })
})

describe('calcAlertasCriticas (fuente única = tabla alerts)', () => {
  it('cuenta críticas abiertas desde alertas de BD', () => {
    const alertasDb = [
      { severidad: 'critica', estado: 'abierta' },
      { severidad: 'critica', estado: 'en_progreso' },
      { severidad: 'critica', estado: 'resuelta' }, // no cuenta
      { severidad: 'aviso', estado: 'abierta' },     // no cuenta
    ]
    const r = calcAlertasCriticas({ alertasDb })
    assert.equal(r.valor, 2)
    assert.equal(r.fuente, 'persistido')
  })
  it('fallback: si no hay tabla, usa pesos >= 12 del análisis', () => {
    const r = calcAlertasCriticas({ analisis: casaMarismaAnalisis })
    assert.equal(r.valor, 2) // peso 14 y peso 12
    assert.equal(r.fuente, 'estimado')
  })
  it('restaurante sin críticas devuelve 0', () => {
    const r = calcAlertasCriticas({ alertasDb: [{ severidad: 'aviso', estado: 'abierta' }] })
    assert.equal(r.valor, 0)
  })
})

describe('calcCandidatosCopa (una sola verdad)', () => {
  it('snapshot copa suma los 3 cubos', () => {
    const r = calcCandidatosCopa({
      snapshotCopa: { candidatos_copa: 30, candidatos_copa_premium: 15, candidatos_coravin: 9 },
    })
    assert.deepEqual(r, { valor: 54, fuente: 'persistido' })
  })
  it('sin snapshot, usa resumenEjecutivo', () => {
    const r = calcCandidatosCopa({
      snapshotCopa: null,
      resumenEjecutivo: { candidatos_copa: 40 },
    })
    assert.deepEqual(r, { valor: 40, fuente: 'persistido' })
  })
  it('sin persistido, estima: floor(vinos*0.12) - copaActuales', () => {
    const r = calcCandidatosCopa({
      metricas: { vinos: 100, copa: 5 },
    })
    assert.equal(r.fuente, 'estimado')
    assert.equal(r.valor, 7) // 12 - 5
  })
  it('Radar e informe devuelven lo mismo', () => {
    const entradas = {
      snapshotCopa: { candidatos_copa: 30, candidatos_copa_premium: 15, candidatos_coravin: 9 },
    }
    assert.equal(calcCandidatosCopa(entradas).valor, calcCandidatosCopa(entradas).valor)
  })
})

describe('describirFotos', () => {
  it('devuelve los 3 campos siempre, con nombres distintos', () => {
    const r = describirFotos({ semanal: { delivery: { status: 'sent' } }, snapshotMotor: {}, defensa: { tiene_foto: true } })
    assert.ok(r.envio_semanal && r.datos_radar && r.defensa_cliente)
    assert.notEqual(r.envio_semanal.label, r.datos_radar.label)
    assert.notEqual(r.datos_radar.label, r.defensa_cliente.label)
    assert.equal(r.envio_semanal.ok, true)
    assert.equal(r.datos_radar.ok, true)
    assert.equal(r.defensa_cliente.ok, true)
  })
  it('todo apagado si no hay nada', () => {
    const r = describirFotos({})
    assert.equal(r.envio_semanal.ok, false)
    assert.equal(r.datos_radar.ok, false)
    assert.equal(r.defensa_cliente.ok, false)
  })
})

describe('seleccionarTareasMiDia', () => {
  const base = (over) => ({
    restaurante: { id: 'r1', nombre: 'R1' },
    propuestasInteresan: 0,
    alertasCriticas: 0,
    capitalLiberable: 0,
    costesBloqueantes: 0,
    isDemoAgregado: false,
    ...over,
  })

  it('cliente caliente con propuestas gana prioridad', () => {
    const res = seleccionarTareasMiDia([
      base({ restaurante: { id: 'a', nombre: 'A' }, alertasCriticas: 3 }),
      base({ restaurante: { id: 'b', nombre: 'B' }, propuestasInteresan: 2 }),
    ])
    assert.equal(res.length, 2)
    assert.equal(res[0].restaurante.id, 'b')
    assert.equal(res[0].tipo, 'cerrar_propuesta')
  })
  it('excluye demos agregadas', () => {
    const res = seleccionarTareasMiDia([
      base({ restaurante: { id: 'demo', nombre: 'Demo' }, propuestasInteresan: 5, isDemoAgregado: true }),
      base({ restaurante: { id: 'ok', nombre: 'OK' }, alertasCriticas: 1 }),
    ])
    assert.equal(res.length, 1)
    assert.equal(res[0].restaurante.id, 'ok')
  })
  it('respeta limite', () => {
    const contextos = Array.from({ length: 10 }).map((_, i) => base({
      restaurante: { id: `r${i}`, nombre: `R${i}` },
      alertasCriticas: 1,
    }))
    assert.equal(seleccionarTareasMiDia(contextos, { limite: 3 }).length, 3)
  })
  it('sin nada urgente devuelve lista vacía (no rellena)', () => {
    const res = seleccionarTareasMiDia([base({})])
    assert.equal(res.length, 0)
  })
})

describe('seleccionarMatchesAutoaplicables', () => {
  it('solo acepta score >= umbral', () => {
    const matches = [
      { wineId: '1', score: 98 },
      { wineId: '2', score: 95 },
      { wineId: '3', score: 94.9 },
      { wineId: '4', score: 10 },
    ]
    const res = seleccionarMatchesAutoaplicables(matches)
    assert.deepEqual(res.map(r => r.wineId), ['1', '2'])
    assert.equal(res[0].score, 98)
  })
  it('umbral configurable', () => {
    const matches = [{ wineId: '1', score: 85 }, { wineId: '2', score: 50 }]
    assert.equal(seleccionarMatchesAutoaplicables(matches, { umbral: 80 }).length, 1)
  })
  it('ignora matches sin wineId', () => {
    const matches = [{ score: 99 }, { wineId: '2', score: 99 }]
    assert.equal(seleccionarMatchesAutoaplicables(matches).length, 1)
  })
})

describe('limpiarRutasTecnicas', () => {
  it('sustituye /dashboard/vinos?filtro=pendientes por lenguaje natural', () => {
    const entrada = 'Completar precios. Entra en /dashboard/vinos?filtro=pendientes y actualiza.'
    const salida = limpiarRutasTecnicas(entrada)
    assert.ok(!salida.includes('/dashboard'))
    assert.ok(salida.includes('revisa los precios'))
  })
  it('sustituye /dashboard/platos?filtro=X', () => {
    assert.ok(!limpiarRutasTecnicas('Ve a /dashboard/platos?filtro=sin-foto').includes('/dashboard'))
  })
  it('fallback genérico', () => {
    const r = limpiarRutasTecnicas('Mira /dashboard/otra-cosa-rara ahora')
    assert.ok(r.includes('revisa el panel del restaurante'))
    assert.ok(!r.includes('/dashboard'))
  })
  it('respeta texto sin rutas', () => {
    assert.equal(limpiarRutasTecnicas('Texto normal sin rutas.'), 'Texto normal sin rutas.')
  })
})

describe('deduplicarAcciones', () => {
  it('elimina duplicados por restaurante+tipo+origen', () => {
    const acciones = [
      { restaurante_id: 'r1', tipo: 'costes_pendientes', origen: 'alerts', titulo: 'A' },
      { restaurante_id: 'r1', tipo: 'costes_pendientes', origen: 'alerts', titulo: 'B' }, // duplicado
      { restaurante_id: 'r1', tipo: 'costes_pendientes', origen: 'recomendacion', titulo: 'C' }, // distinto origen
      { restaurante_id: 'r2', tipo: 'costes_pendientes', origen: 'alerts', titulo: 'D' }, // distinto restaurante
    ]
    const res = deduplicarAcciones(acciones)
    assert.equal(res.length, 3)
    assert.equal(res[0].titulo, 'A') // mantiene el primero
  })
  it('acepta array vacío', () => {
    assert.deepEqual(deduplicarAcciones([]), [])
  })
  it('ignora entradas falsy', () => {
    assert.deepEqual(deduplicarAcciones([null, undefined, { restaurante_id: 'r', tipo: 't', origen: 'o' }]).length, 1)
  })
})

describe('esExcluidoDeAgregado', () => {
  it('Araboka se excluye por slug', () => {
    assert.equal(esExcluidoDeAgregado({ slug: 'araboka' }), true)
  })
  it('Sumiller Casa Marisma se excluye por slug', () => {
    assert.equal(esExcluidoDeAgregado({ slug: 'sumiller-casa-marisma' }), true)
  })
  it('Casa Marisma (slug casa-marisma) NO se excluye del agregado del consultor', () => {
    // Casa Marisma está en DEMO_IDS pero no en EXCLUIR_AGREGADO_SLUGS.
    assert.equal(esExcluidoDeAgregado({ slug: 'casa-marisma', id: '65d26545-7c7e-424c-9c29-33bfe8bbaafa' }), false)
  })
  it('restaurante real no se excluye', () => {
    assert.equal(esExcluidoDeAgregado({ slug: 'lo-de-carmen', id: 'xyz' }), false)
  })
})
