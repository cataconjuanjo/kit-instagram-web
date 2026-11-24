/**
 * FASE L — Cambio 1: desglose de la oportunidad económica por palanca.
 *
 * Verifica que calcPalancasOportunidad cumple el contrato que el
 * informe para el cliente necesita:
 *   - Suma de palancas == total.
 *   - Palanca 'propuestas_abiertas' marcada como esInterna (la filtra el
 *     informe del cliente).
 *   - Si una palanca no aporta euros, no aparece.
 *   - Si hay persistido, las palancas se escalan para que sumen exacto.
 *
 * Ejecuta: node --test scripts/palancasOportunidad.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calcPalancasOportunidad } from '../app/lib/consultoriaMetricas.js'

describe('calcPalancasOportunidad', () => {
  it('sin datos, total 0 y sin palancas', () => {
    const r = calcPalancasOportunidad({})
    assert.equal(r.total, 0)
    assert.deepEqual(r.palancas, [])
  })

  it('suma heurística cuando no hay persistido', () => {
    const r = calcPalancasOportunidad({
      metricas: { vinos: 100, copa: 5, margenBajo: 3, sinCoste: 2 },
      propuestasAbiertas: 1,
    })
    // margenBajo 3*180 = 540; sinCoste 2*60 = 120;
    // copaFaltante = floor(100*0.12) - 5 = 12 - 5 = 7 → 7*90 = 630;
    // propuestas 1*120 = 120. Total = 1410.
    const suma = r.palancas.reduce((s, p) => s + p.euros, 0)
    assert.equal(r.total, 1410)
    assert.equal(suma, 1410)
  })

  it('la palanca propuestas_abiertas viene marcada como esInterna', () => {
    const r = calcPalancasOportunidad({
      metricas: { vinos: 50, copa: 2, margenBajo: 0, sinCoste: 0 },
      propuestasAbiertas: 2,
    })
    const propuestas = r.palancas.find(p => p.id === 'propuestas_abiertas')
    assert.ok(propuestas, 'debe existir la palanca de propuestas abiertas')
    assert.equal(propuestas.esInterna, true)
  })

  it('las 3 palancas de carta no están marcadas como internas', () => {
    const r = calcPalancasOportunidad({
      metricas: { vinos: 100, copa: 5, margenBajo: 3, sinCoste: 2 },
      propuestasAbiertas: 0,
    })
    for (const p of r.palancas) {
      assert.equal(p.esInterna, false, `${p.id} no debería ser interna`)
    }
  })

  it('no incluye palancas con euros = 0', () => {
    const r = calcPalancasOportunidad({
      metricas: { vinos: 10, copa: 2, margenBajo: 0, sinCoste: 0 },
      propuestasAbiertas: 0,
    })
    // copaFaltante = round(10*0.12)=1 - 2 = -1 → 0 → 0€. Resto también 0.
    assert.equal(r.palancas.length, 0)
    assert.equal(r.total, 0)
  })

  it('con persistido, las palancas se escalan para que sumen el total exacto', () => {
    const r = calcPalancasOportunidad({
      metricas: { vinos: 100, copa: 5, margenBajo: 3, sinCoste: 2 },
      propuestasAbiertas: 1,
      persistidoTotal: 2820, // doble de la heurística 1410
    })
    const suma = r.palancas.reduce((s, p) => s + p.euros, 0)
    assert.equal(r.total, 2820)
    assert.equal(suma, 2820)
  })

  it('con persistido pero sin palancas heurísticas, total = persistido y palancas vacías', () => {
    const r = calcPalancasOportunidad({
      metricas: { vinos: 0, copa: 0 },
      propuestasAbiertas: 0,
      persistidoTotal: 2000,
    })
    assert.equal(r.total, 2000)
    assert.equal(r.palancas.length, 0)
  })

  it('FASE L-fix: sin_coste viene marcada como soloDatos:true', () => {
    const r = calcPalancasOportunidad({
      metricas: { vinos: 50, copa: 2, margenBajo: 0, sinCoste: 80 },
      propuestasAbiertas: 0,
    })
    const sc = r.palancas.find(p => p.id === 'sin_coste')
    assert.ok(sc, 'sin_coste debería aparecer')
    assert.equal(sc.soloDatos, true)
  })

  it('FASE L-fix: las palancas recuperables son soloDatos:false', () => {
    const r = calcPalancasOportunidad({
      metricas: { vinos: 100, copa: 5, margenBajo: 3, sinCoste: 2 },
      propuestasAbiertas: 2,
    })
    for (const p of r.palancas) {
      if (p.id === 'sin_coste') continue
      assert.equal(p.soloDatos, false, `${p.id} no debería ser soloDatos`)
    }
  })

  it('FASE L-fix: el escalado con persistido NO toca la palanca soloDatos', () => {
    // Caso Lo de Carmen-like: sinCoste alto (80*60=4800), margen bajo (8*180=1440),
    // copa faltante 1*90=90. SumaCruda = 6330. Persistido = 4890 (valor del preview).
    const r = calcPalancasOportunidad({
      metricas: { vinos: 100, copa: 11, margenBajo: 8, sinCoste: 80 },
      propuestasAbiertas: 0,
      persistidoTotal: 4890,
    })
    const sc = r.palancas.find(p => p.id === 'sin_coste')
    assert.equal(sc.euros, 4800, 'sin_coste debe conservar su euros crudo (80 * 60)')
    // El total devuelto sigue siendo el persistido (no se cambia el Radar).
    assert.equal(r.total, 4890)
  })

  it('FASE L-fix: las con-importe siguen ordenadas por euros desc; soloDatos al final', () => {
    const r = calcPalancasOportunidad({
      metricas: { vinos: 80, copa: 2, margenBajo: 5, sinCoste: 80 },
      propuestasAbiertas: 1,
    })
    // Los no-soloDatos deben ir antes que sin_coste.
    const indiceSinCoste = r.palancas.findIndex(p => p.id === 'sin_coste')
    const indiceMargenBajo = r.palancas.findIndex(p => p.id === 'margen_bajo')
    assert.ok(indiceMargenBajo < indiceSinCoste, 'margen_bajo debe ir antes que sin_coste')
  })

  it('las palancas vienen ordenadas por euros desc DENTRO de cada grupo', () => {
    // FASE L-fix: las soloDatos pueden tener más € que las con-importe
    // pero SIEMPRE van al final. Dentro de cada grupo, euros desc.
    const r = calcPalancasOportunidad({
      metricas: { vinos: 200, copa: 1, margenBajo: 10, sinCoste: 50 },
      propuestasAbiertas: 0,
    })
    const conImp = r.palancas.filter(p => !p.soloDatos)
    const datos = r.palancas.filter(p => p.soloDatos)
    for (let i = 1; i < conImp.length; i++) {
      assert.ok(conImp[i].euros <= conImp[i - 1].euros, 'con-importe mal ordenado')
    }
    for (let i = 1; i < datos.length; i++) {
      assert.ok(datos[i].euros <= datos[i - 1].euros, 'soloDatos mal ordenado')
    }
    // Y las soloDatos tras las con-importe.
    const posPrimeraDato = r.palancas.findIndex(p => p.soloDatos)
    const posUltimaConImp = r.palancas.map(p => p.soloDatos).lastIndexOf(false)
    if (posPrimeraDato >= 0 && posUltimaConImp >= 0) {
      assert.ok(posPrimeraDato > posUltimaConImp, 'soloDatos deben ir al final')
    }
  })
})
