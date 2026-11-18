/**
 * Unit tests for app/lib/canalesSalidas.js
 * Ejecutar: node --test scripts/canalesSalidas.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CANALES_VENTA,
  CANALES_SALIDA_SIN_VENTA,
  ML_BOTELLA_ESTANDAR,
  ML_COPA_ESTANDAR,
  ML_COPA_FORTIFICADO,
  calcularConsumoDerivado,
  calcularStockFinalTeorico,
  conciliarTeoricoReal,
  copasAUdsBotella,
  copasPorBotella,
  listarCanalesVenta,
  listarSalidasNoVenta,
  udsBotellaACopas,
} from '../app/lib/canalesSalidas.js'

describe('Constantes del dominio', () => {
  it('canales de venta canónicos (orden)', () => {
    assert.deepEqual([...CANALES_VENTA], ['botella', 'copa', 'maridaje', 'evento'])
    assert.ok(Object.isFrozen(CANALES_VENTA))
  })
  it('canales de salida no-venta canónicos (orden)', () => {
    assert.deepEqual([...CANALES_SALIDA_SIN_VENTA], [
      'invitacion_botella', 'invitacion_copa',
      'cocina', 'grupo_evento', 'maridaje', 'rotura', 'cata',
    ])
    assert.ok(Object.isFrozen(CANALES_SALIDA_SIN_VENTA))
  })
  it('ml de referencia', () => {
    assert.equal(ML_BOTELLA_ESTANDAR, 750)
    assert.equal(ML_COPA_ESTANDAR,    125)
    assert.equal(ML_COPA_FORTIFICADO,  90)
  })
})

describe('copasPorBotella', () => {
  it('estándar 750/125 → 6', () => {
    assert.equal(copasPorBotella(), 6)
  })
  it('fortificado 750/90 → 8', () => {
    assert.equal(copasPorBotella({ ml_copa: ML_COPA_FORTIFICADO }), 8)
  })
  it('media botella 375/125 → 3', () => {
    assert.equal(copasPorBotella({ ml_botella: 375 }), 3)
  })
  it('parámetros inválidos → null', () => {
    assert.equal(copasPorBotella({ ml_botella: 0 }),  null)
    assert.equal(copasPorBotella({ ml_copa: -5 }),    null)
    assert.equal(copasPorBotella({ ml_copa: 1000 }),  null)   // copa > botella
    assert.equal(copasPorBotella({ ml_botella: 'x' }), null)
  })
})

describe('copasAUdsBotella — fracciones', () => {
  it('6 copas estándar → 1 botella exacta', () => {
    assert.equal(copasAUdsBotella(6), 1)
  })
  it('3 copas estándar → 0.5 botellas', () => {
    assert.equal(copasAUdsBotella(3), 0.5)
  })
  it('8 copas de fortificado 90ml → 0.96 botellas (8*90/750)', () => {
    assert.equal(copasAUdsBotella(8, { ml_copa: ML_COPA_FORTIFICADO }), 0.96)
  })
  it('0 copas → 0', () => {
    assert.equal(copasAUdsBotella(0), 0)
    assert.equal(copasAUdsBotella(-5), 0)
  })
  it('null / undefined → null (sin dato, no 0)', () => {
    assert.equal(copasAUdsBotella(null), null)
    assert.equal(copasAUdsBotella(undefined), null)
    assert.equal(copasAUdsBotella(''), null)
  })
})

describe('udsBotellaACopas', () => {
  it('1 botella estándar → 6 copas', () => {
    assert.equal(udsBotellaACopas(1), 6)
  })
  it('1 botella fortificado → 8 copas (floor de 8.33)', () => {
    assert.equal(udsBotellaACopas(1, { ml_copa: ML_COPA_FORTIFICADO }), 8)
  })
  it('3 botellas estándar → 18 copas', () => {
    assert.equal(udsBotellaACopas(3), 18)
  })
  it('null → null', () => {
    assert.equal(udsBotellaACopas(null), null)
  })
})

describe('listarCanalesVenta', () => {
  it('snapshot con los 4 canales → 4 filas con beneficio', () => {
    const r = listarCanalesVenta({
      botella:  { uds: 100, ingresos: 3000, coste: 900 },
      copa:     { uds: 50,  copas: 300, ingresos: 1500, coste: 450 },
      maridaje: { uds: 20,  valor: 800,  coste: 240 },
      evento:   { uds: 15,  valor: 600,  coste: 180 },
    })
    assert.equal(r.length, 4)
    const byCanal = Object.fromEntries(r.map(x => [x.canal, x]))
    assert.equal(byCanal.botella.beneficio,  2100)
    assert.equal(byCanal.copa.beneficio,     1050)
    assert.equal(byCanal.maridaje.beneficio, 560)
    assert.equal(byCanal.evento.beneficio,   420)
    // Las copas se mantienen informativas en la fila de copa.
    assert.equal(byCanal.copa.copas, 300)
  })
  it('snapshot parcial → omite los canales ausentes (no 0 falso)', () => {
    const r = listarCanalesVenta({ botella: { uds: 10, ingresos: 100, coste: 30 } })
    assert.equal(r.length, 1)
    assert.equal(r[0].canal, 'botella')
  })
  it('snapshot vacío / null → []', () => {
    assert.deepEqual(listarCanalesVenta(), [])
    assert.deepEqual(listarCanalesVenta(null), [])
    assert.deepEqual(listarCanalesVenta({}), [])
  })
})

describe('listarSalidasNoVenta', () => {
  it('invitación botella y copa, cocina y rotura (forma canónica)', () => {
    const r = listarSalidasNoVenta({
      invitacion_botella: { uds: 3, coste: 90 },
      invitacion_copa:    { uds: 10, coste: 50 },
      cocina:             { uds: 2, coste: 60 },
      rotura:             { uds: 1, coste: 25 },
    })
    const byCanal = Object.fromEntries(r.map(x => [x.canal, x]))
    assert.equal(byCanal.invitacion_botella.uds, 3)
    assert.equal(byCanal.invitacion_copa.coste,  50)
    assert.equal(byCanal.cocina.coste,           60)
    assert.equal(byCanal.rotura.coste,           25)
  })
  it('legacy: "invitacion" (bloque agregado) con {botella_uds, copa_uds, botella_coste, copa_coste} no aparece — solo canales canónicos separados', () => {
    const r = listarSalidasNoVenta({
      invitacion: { botella_uds: 2, copa_uds: 4, botella_coste: 60, copa_coste: 20 },
    })
    assert.deepEqual(r, [])
  })
})

describe('calcularStockFinalTeorico — método inventario', () => {
  it('escenario del enunciado (copas fraccionarias)', () => {
    // inicial 100, compras 50; vendidas 30 botellas + 12 copas (= 2 botellas);
    // salidas no-venta: 5 (invit + cocina + rotura). Teórico = 100+50−30−2−5 = 113.
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: 100, compras_netas: 50,
      ventas_botella_uds: 30, ventas_copa_copas: 12,
      salidas_no_venta_uds: 5,
    }), 113)
  })
  it('fortificado 8 copas = 0.96 bot.', () => {
    const t = calcularStockFinalTeorico({
      stock_inicial: 10, compras_netas: 0,
      ventas_botella_uds: 0, ventas_copa_copas: 8,
      salidas_no_venta_uds: 0,
      ml_copa: ML_COPA_FORTIFICADO,
    })
    // 10 + 0 − 0 − 0.96 − 0 = 9.04
    assert.equal(t, 9.04)
  })
  it('mes sin compras y con rotura (1 ud)', () => {
    // inicial 50, compras 0, ventas 0, rotura 1 → teorico 49
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: 50, compras_netas: 0,
      ventas_botella_uds: 0, ventas_copa_copas: 0,
      salidas_no_venta_uds: 1,
    }), 49)
  })
  it('invitación de copa cuenta como fracción (3 copas = 0.5 bot)', () => {
    // inicial 20, compras 0, ventas 0, salidas no-venta 0.5 (3 copas invitadas)
    // Caller debe convertir previamente las copas invitadas a uds:
    //   copasAUdsBotella(3) = 0.5
    const salidasSin = copasAUdsBotella(3) // 0.5
    assert.equal(salidasSin, 0.5)
    const t = calcularStockFinalTeorico({
      stock_inicial: 20, compras_netas: 0,
      ventas_botella_uds: 0, ventas_copa_copas: 0,
      salidas_no_venta_uds: salidasSin,
    })
    assert.equal(t, 19.5)
  })
  it('null-safe: stock_inicial null → teorico null (NO "Sin dato ≡ 0")', () => {
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: null, compras_netas: 50,
    }), null)
  })
  it('null-safe: compras null → null', () => {
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: 100, compras_netas: null,
    }), null)
  })
})

describe('calcularConsumoDerivado', () => {
  it('fórmula básica: 100 + 50 − 120 = 30', () => {
    assert.equal(calcularConsumoDerivado({
      stock_inicial: 100, compras_netas: 50, stock_final_real: 120,
    }), 30)
  })
  it('mes sin compras: 100 + 0 − 80 = 20', () => {
    assert.equal(calcularConsumoDerivado({
      stock_inicial: 100, compras_netas: 0, stock_final_real: 80,
    }), 20)
  })
  it('stock final null → consumo null ("Sin dato")', () => {
    assert.equal(calcularConsumoDerivado({
      stock_inicial: 100, compras_netas: 50, stock_final_real: null,
    }), null)
  })
  it('stock inicial null → consumo null', () => {
    assert.equal(calcularConsumoDerivado({
      stock_inicial: null, compras_netas: 50, stock_final_real: 120,
    }), null)
  })
})

describe('conciliarTeoricoReal', () => {
  it('cuadra dentro de tolerancia 0.5 → signo "cuadra"', () => {
    const r = conciliarTeoricoReal({
      stock_inicial: 100, compras_netas: 50,
      ventas_botella_uds: 30, ventas_copa_copas: 12,
      salidas_no_venta_uds: 5,
      stock_final_real: 113,
    })
    assert.equal(r.teorico, 113)
    assert.equal(r.real, 113)
    assert.equal(r.diferencia, 0)
    assert.equal(r.diferencia_pct, 0)
    assert.equal(r.signo, 'cuadra')
  })
  it('faltan 2 uds (merma no registrada)', () => {
    const r = conciliarTeoricoReal({
      stock_inicial: 100, compras_netas: 50,
      ventas_botella_uds: 30, ventas_copa_copas: 0,
      salidas_no_venta_uds: 0,
      stock_final_real: 118,
    })
    // teorico = 100 + 50 − 30 = 120; real 118 → faltan 2
    assert.equal(r.teorico, 120)
    assert.equal(r.diferencia, -2)
    assert.equal(r.signo, 'faltan')
  })
  it('sobran 3 uds (ventas sin registrar o compras olvidadas)', () => {
    const r = conciliarTeoricoReal({
      stock_inicial: 100, compras_netas: 0,
      ventas_botella_uds: 0, ventas_copa_copas: 0,
      salidas_no_venta_uds: 0,
      stock_final_real: 103,
    })
    assert.equal(r.diferencia, 3)
    assert.equal(r.signo, 'sobran')
  })
  it('sin conteo real → todos null salvo teorico', () => {
    const r = conciliarTeoricoReal({
      stock_inicial: 100, compras_netas: 50,
      ventas_botella_uds: 30, stock_final_real: null,
    })
    assert.equal(r.teorico, 120)
    assert.equal(r.real, null)
    assert.equal(r.diferencia, null)
    assert.equal(r.signo, null)
  })
})
