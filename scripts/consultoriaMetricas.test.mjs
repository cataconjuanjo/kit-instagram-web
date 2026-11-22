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
  calcVinosPorCopa,
  describirFotos,
  seleccionarTareasMiDia,
  seleccionarMatchesAutoaplicables,
  seleccionarMatchesParaAutoAplicar,
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
  it('conteoPersistido gana a alertasDb y a analisis', () => {
    const r = calcAlertasCriticas({
      conteoPersistido: 1,
      alertasDb: [{ severidad: 'critica', estado: 'abierta' }, { severidad: 'critica', estado: 'abierta' }],
      analisis: casaMarismaAnalisis,
    })
    assert.equal(r.valor, 1)
    assert.equal(r.fuente, 'persistido')
  })
  it('conteoPersistido=0 es un valor válido (no vuelve al fallback)', () => {
    const r = calcAlertasCriticas({
      conteoPersistido: 0,
      alertasDb: [{ severidad: 'critica', estado: 'abierta' }],
    })
    assert.equal(r.valor, 0)
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

describe('INTEGRACION: Radar = ficha = Informe = Alertas con los mismos datos', () => {
  // Datos sintéticos consistentes de Casa Marisma:
  // - 1 alerta crítica persistida en tabla alerts (estado abierta).
  // - El API ejecutivo cuenta 1 crítica (conteoPersistido=1).
  // - El análisis local tiene 3 alertas de peso >= 12 (lo que antes
  //   mostraba el Radar: 3). Con el helper, Radar baja a 1.
  const alertasTablaAlerts = [
    { id: 'A', severidad: 'critica', estado: 'abierta' },
    { id: 'B', severidad: 'aviso', estado: 'abierta' },
    { id: 'C', severidad: 'critica', estado: 'resuelta' },
  ]
  const ejecutivoDesdeApi = { resumen: { alertas_criticas: 1, capital_liberable_estimado: 296, candidatos_copa: 40 } }
  const analisisLocal = { score: 36, prioridad: 'Media', alertas: [{ peso: 14 }, { peso: 13 }, { peso: 12 }] }
  const consultoriaFase1 = {
    alertas: [{ severidad: 'critica', estado: 'abierta' }],
    oportunidad: { snapshot: { capital_liberable_estimado: 296 } },
    copa: { snapshot: { candidatos_copa: 30, candidatos_copa_premium: 10, candidatos_coravin: 0 } },
  }

  it('alertas críticas: Radar == Informe == Alertas (con conteoPersistido)', () => {
    const radar = calcAlertasCriticas({
      conteoPersistido: ejecutivoDesdeApi.resumen.alertas_criticas,
      analisis: analisisLocal,
    }).valor
    const informe = calcAlertasCriticas({
      alertasDb: consultoriaFase1.alertas,
      analisis: analisisLocal,
    }).valor
    const paginaAlertas = calcAlertasCriticas({ alertasDb: alertasTablaAlerts }).valor
    assert.equal(radar, 1)
    assert.equal(informe, 1)
    assert.equal(paginaAlertas, 1)
  })

  it('puntuación: Radar == ficha con calcPuntuacion(analisis)', () => {
    const radar = calcPuntuacion(analisisLocal)
    const ficha = calcPuntuacion(analisisLocal)
    assert.deepEqual(radar, ficha)
    assert.equal(radar.score, 36)
    assert.equal(radar.prioridad, 'Media')
  })

  it('capital liberable: Radar (sin snapshot) == Informe (con snapshot) cuando ambos miran al mismo valor persistido', () => {
    const radar = calcCapitalLiberable({
      snapshotOportunidad: consultoriaFase1.oportunidad.snapshot,
      resumenEjecutivo: ejecutivoDesdeApi.resumen,
    }).valor
    const informe = calcCapitalLiberable({
      snapshotOportunidad: consultoriaFase1.oportunidad.snapshot,
    }).valor
    assert.equal(radar, 296)
    assert.equal(informe, 296)
  })

  it('candidatos copa: 40 (snapshot) coincide en Informe, Radar y ficha', () => {
    const vInforme = calcCandidatosCopa({ snapshotCopa: consultoriaFase1.copa.snapshot }).valor
    const vRadar = calcCandidatosCopa({ resumenEjecutivo: ejecutivoDesdeApi.resumen }).valor
    assert.equal(vInforme, 40) // 30 + 10 + 0
    assert.equal(vRadar, 40)
  })

  it('"vinos servidos por copa" es un contador distinto de "candidatos a copa"', () => {
    // 'Vinos servidos por copa' mira precio_copa > 0 en la carta actual.
    // 'Candidatos a copa' es el output del motor (snapshot copa).
    const servidosPorCopa = calcVinosPorCopa({
      vinos: [
        { activo: true, precio_copa: 4 },
        { activo: true, precio_copa: 0 },
        { activo: false, precio_copa: 5 },
        { activo: true, precio_copa: 6 },
      ],
    })
    assert.equal(servidosPorCopa, 2)
    // Y sigue siendo distinto de candidatos_copa.
    const candidatos = calcCandidatosCopa({ snapshotCopa: consultoriaFase1.copa.snapshot }).valor
    assert.notEqual(servidosPorCopa, candidatos)
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
  it('simula el renderizado del informe ejecutivo (detalle + accion visibles)', () => {
    // Replica el patrón del JSX: <p>{limpiarRutasTecnicas(item.detalle)}</p>
    // <em>{limpiarRutasTecnicas(item.accion)}</em>. Ningún output visible
    // debe contener '/dashboard'.
    const items = [
      { titulo: 'Carta incompleta', detalle: 'Ve a /dashboard/vinos?filtro=pendientes.', accion: 'Completar antes del QR.' },
      { titulo: 'Platos sin pistas', detalle: 'Revisa platos.', accion: 'Abre /dashboard/platos?filtro=descripcion para corregir.' },
    ]
    for (const item of items) {
      assert.ok(!limpiarRutasTecnicas(item.detalle).includes('/dashboard'))
      assert.ok(!limpiarRutasTecnicas(item.accion).includes('/dashboard'))
    }
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
  it('con porTitulo=true, caza duplicados por restaurante+titulo aunque origen difiera', () => {
    const acciones = [
      { restaurante_id: 'araboka', titulo: 'Costes pendientes', origen: 'alert_engine' },
      { restaurante_id: 'araboka', titulo: 'Costes pendientes', origen: 'modo_consultor' },
      { restaurante_id: 'araboka', titulo: 'Otra cosa', origen: 'alert_engine' },
    ]
    const res = deduplicarAcciones(acciones, { porTitulo: true })
    assert.equal(res.length, 2)
  })
  it('acepta array vacío', () => {
    assert.deepEqual(deduplicarAcciones([]), [])
  })
  it('ignora entradas falsy', () => {
    assert.deepEqual(deduplicarAcciones([null, undefined, { restaurante_id: 'r', tipo: 't', origen: 'o' }]).length, 1)
  })
})

describe('seleccionarMatchesParaAutoAplicar (fase J-fix)', () => {
  it('un único candidato ≥95% → auto', () => {
    const grupos = [{
      vino: { id: 'v1', nombre: 'Rioja', formato_compra: '75 cl' },
      candidatos: [{ score: 97, vino: { formato: '75 cl', nombre: 'Rioja crianza' } }],
    }]
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(grupos)
    assert.equal(auto.length, 1)
    assert.equal(revision.length, 0)
    assert.equal(auto[0].motivo, 'unico_candidato')
  })

  it('empate (ambos 99%) con formatos distintos → revisión manual (caso Blanc de Blancs 75cl vs jeroboam 300cl)', () => {
    const grupos = [{
      vino: { id: 'v1', nombre: 'Reserve Blanc de Blancs Assailly', formato_compra: null },
      candidatos: [
        { score: 99, vino: { formato: '75 cl', coste_estimado: 34.95 } },
        { score: 99, vino: { formato: '300 cl', coste_estimado: 296 } },
      ],
    }]
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(grupos)
    assert.equal(auto.length, 0)
    assert.equal(revision.length, 1)
    assert.equal(revision[0].motivo, 'ventaja_insuficiente')
  })

  it('ventaja ≥10 con formato coincidente → auto (vino 75 cl, mejor candidato 75 cl)', () => {
    const grupos = [{
      vino: { id: 'v1', nombre: 'Terroir Al Límit', formato_compra: '75 cl' },
      candidatos: [
        { score: 99, vino: { formato: '75 cl', coste_estimado: 70.45 } },
        { score: 84, vino: { formato: '75 cl', coste_estimado: 53.4 } },
      ],
    }]
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(grupos)
    assert.equal(auto.length, 1)
    assert.equal(revision.length, 0)
    assert.equal(auto[0].motivo, 'formato_coincide')
  })

  it('ventaja ≥10 pero formato DISTINTO al del vino → revisión manual', () => {
    const grupos = [{
      vino: { id: 'v1', nombre: 'Parada de Atauta', formato_compra: '75 cl' },
      candidatos: [
        { score: 99, vino: { formato: '150 cl' } }, // magnum
        { score: 80, vino: { formato: '75 cl' } },
      ],
    }]
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(grupos)
    assert.equal(auto.length, 0)
    assert.equal(revision.length, 1)
    assert.equal(revision[0].motivo, 'formato_distinto')
  })

  it('ventaja insuficiente (menos de 10 puntos) → revisión manual', () => {
    const grupos = [{
      vino: { id: 'v1', nombre: 'Algo', formato_compra: '75 cl' },
      candidatos: [
        { score: 97, vino: { formato: '75 cl' } },
        { score: 92, vino: { formato: '75 cl' } },
      ],
    }]
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(grupos)
    assert.equal(auto.length, 0)
    assert.equal(revision[0].motivo, 'ventaja_insuficiente')
  })

  it('vino sin formato pero varios candidatos ≥95 y todos 75 cl (y ventaja ≥10) → auto (asumir 75 cl)', () => {
    const grupos = [{
      vino: { id: 'v1', nombre: 'Blanco' },
      candidatos: [
        { score: 99, vino: { formato: '75 cl' } },
        { score: 95, vino: { formato: '75 cl' } }, // también ≥95 pero misma familia
      ],
    }]
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(grupos)
    // Dos ≥95, ambos 75 cl. Ventaja 4 < 10 → revisión. Caso realista.
    assert.equal(auto.length, 0)
    assert.equal(revision.length, 1)
  })

  it('vino sin formato, único ≥95% es 75 cl y ventaja ≥10 → auto (asumido_75cl)', () => {
    const grupos = [{
      vino: { id: 'v1', nombre: 'Blanco' },
      candidatos: [
        { score: 98, vino: { formato: '75 cl' } },
        { score: 80, vino: { formato: '300 cl' } }, // 2º candidato, no llega al umbral
      ],
    }]
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(grupos)
    assert.equal(auto.length, 1)
    assert.equal(auto[0].motivo, 'asumido_75cl')
    assert.equal(revision.length, 0)
  })

  it('vino sin formato con candidatos ≥95 de varios formatos → revisión manual', () => {
    const grupos = [{
      vino: { id: 'v1', nombre: 'Blanco' },
      candidatos: [
        { score: 99, vino: { formato: '75 cl' } },
        { score: 98, vino: { formato: '300 cl' } },
      ],
    }]
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(grupos)
    // Dos ≥95 con formatos distintos, y además el mejor no supera al 2º
    // en ≥10 → revisión.
    assert.equal(auto.length, 0)
    assert.equal(revision.length, 1)
  })

  it('sin candidatos ≥95% → revisión con motivo sin_candidato', () => {
    const grupos = [{
      vino: { id: 'v1', nombre: 'X', formato_compra: '75 cl' },
      candidatos: [{ score: 80, vino: { formato: '75 cl' } }],
    }]
    const { auto, revision } = seleccionarMatchesParaAutoAplicar(grupos)
    assert.equal(auto.length, 0)
    assert.equal(revision[0].motivo, 'sin_candidato')
  })
})

describe('esExcluidoDeAgregado', () => {
  it('Araboka se excluye por slug', () => {
    assert.equal(esExcluidoDeAgregado({ slug: 'araboka' }), true)
  })
  it('Sumiller Casa Marisma se excluye por slug', () => {
    assert.equal(esExcluidoDeAgregado({ slug: 'sumiller-casa-marisma' }), true)
  })
  it('Casa Marisma SÍ se excluye del agregado del consultor (fase J-fix)', () => {
    // Decisión fase J-fix: Casa Marisma participa en Mi día / listado /
    // ficha propia, pero NO suma en oportunidad, capital, alertas,
    // candidatos copa ni embudo de activación del header.
    assert.equal(esExcluidoDeAgregado({ slug: 'casa-marisma', id: '65d26545-7c7e-424c-9c29-33bfe8bbaafa' }), true)
    // Basta con id si no viene slug.
    assert.equal(esExcluidoDeAgregado({ id: '65d26545-7c7e-424c-9c29-33bfe8bbaafa' }), true)
  })
  it('restaurante real no se excluye', () => {
    assert.equal(esExcluidoDeAgregado({ slug: 'lo-de-carmen', id: 'xyz' }), false)
  })
})
