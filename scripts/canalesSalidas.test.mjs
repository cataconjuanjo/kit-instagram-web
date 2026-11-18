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
  datosParaPeriodo,
  listarCanalesVenta,
  listarSalidasNoVenta,
  udsBotellaACopas,
} from '../app/lib/canalesSalidas.js'

describe('Constantes del dominio', () => {
  it('canales de venta canónicos = sólo los que llevan facturación por línea TPV', () => {
    assert.deepEqual([...CANALES_VENTA], ['botella', 'copa'])
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
    assert.equal(copasPorBotella({ ml_copa: 1000 }),  null)
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
  it('8 copas de fortificado 90ml → 0.96 botellas', () => {
    assert.equal(copasAUdsBotella(8, { ml_copa: ML_COPA_FORTIFICADO }), 0.96)
  })
  it('0 copas → 0; negativas → 0', () => {
    assert.equal(copasAUdsBotella(0), 0)
    assert.equal(copasAUdsBotella(-5), 0)
  })
  it('null / undefined → null', () => {
    assert.equal(copasAUdsBotella(null), null)
    assert.equal(copasAUdsBotella(undefined), null)
    assert.equal(copasAUdsBotella(''), null)
  })
})

describe('udsBotellaACopas', () => {
  it('1 bot estándar → 6; 1 fortificado → 8; 3 bot → 18', () => {
    assert.equal(udsBotellaACopas(1), 6)
    assert.equal(udsBotellaACopas(1, { ml_copa: ML_COPA_FORTIFICADO }), 8)
    assert.equal(udsBotellaACopas(3), 18)
  })
})

// ── Shape REAL de `por_canal` producida por agregarPeriodoBodega.js ──
//
// canal = {
//   botella:    { uds, ingresos, coste },             // ingresos BRUTO (c/IVA)
//   copa:       { uds, copas, ingresos, coste },      // ingresos BRUTO
//   invitacion: { uds, botella_uds, copa_uds, botella_coste, copa_coste },  // AGREGADO
//   cocina:     { uds, valor, coste },
//   evento:     { uds, valor, coste },                 // alias de grupo_evento
//   maridaje:   { uds, valor, coste },
//   rotura:     { uds, coste },
//   cata:       { uds, valor, coste },
// }

describe('listarCanalesVenta — conversión BRUTO→NETO con iva_pct', () => {
  it('iva_pct=10 convierte ingresos a neto y cuadra con ventas_neto', () => {
    // Los números son los del preview de Casa Marisma 2026-11:
    //   ventas_bruto = 5245.00, ventas_neto = 4768.18 (iva 10%)
    //   botella bruto ≈ 2200 → neto 2000.00
    //   copa    bruto = 3045 → neto 2768.18
    const r = listarCanalesVenta({
      botella: { uds: 88,  ingresos: 2200.00, coste: 660 },
      copa:    { uds: 0,   copas: 651, ingresos: 3045.00, coste: 900 },
    }, { iva_pct: 10 })
    assert.equal(r.length, 2)
    const bot = r.find(x => x.canal === 'botella')
    const cop = r.find(x => x.canal === 'copa')
    assert.equal(bot.ingresos_bruto, 2200)
    assert.equal(bot.ingresos_neto, 2000)
    assert.equal(bot.beneficio,     1340)   // 2000 − 660
    assert.equal(cop.ingresos_bruto, 3045)
    assert.equal(cop.ingresos_neto, 2768.18)
    assert.equal(cop.beneficio,     1868.18)
    // Total neto = 2000 + 2768.18 = 4768.18 = ventas_neto
    const totalNeto = r.reduce((s, x) => s + x.ingresos_neto, 0)
    assert.equal(Math.round(totalNeto * 100) / 100, 4768.18)
  })
  it('iva_pct=null → no convierte (neto = bruto)', () => {
    const r = listarCanalesVenta({
      botella: { uds: 1, ingresos: 110, coste: 30 },
    })
    assert.equal(r[0].ingresos_bruto, 110)
    assert.equal(r[0].ingresos_neto, 110)
  })
  it('sólo expone botella y copa (maridaje/evento quedan fuera)', () => {
    const r = listarCanalesVenta({
      botella:  { uds: 1, ingresos: 100, coste: 20 },
      maridaje: { uds: 5, valor: 400, coste: 80 },
      evento:   { uds: 3, valor: 200, coste: 40 },
    }, { iva_pct: 10 })
    assert.equal(r.length, 1)
    assert.equal(r[0].canal, 'botella')
  })
  it('null-safe', () => {
    assert.deepEqual(listarCanalesVenta(), [])
    assert.deepEqual(listarCanalesVenta(null), [])
    assert.deepEqual(listarCanalesVenta({}), [])
  })
})

describe('listarSalidasNoVenta — expansión del canal "invitacion"', () => {
  it('invitacion AGREGADA del agregador → 2 filas canónicas', () => {
    const r = listarSalidasNoVenta({
      invitacion: { uds: 5, botella_uds: 3, copa_uds: 10, botella_coste: 90, copa_coste: 50 },
      cocina:     { uds: 2, valor: 60, coste: 60 },
      rotura:     { uds: 1, coste: 25 },
    })
    const byCanal = Object.fromEntries(r.map(x => [x.canal, x]))
    assert.equal(byCanal.invitacion_botella.uds, 3)
    assert.equal(byCanal.invitacion_botella.coste, 90)
    assert.equal(byCanal.invitacion_copa.uds,   10)   // uds = copas servidas
    assert.equal(byCanal.invitacion_copa.copas, 10)
    assert.equal(byCanal.invitacion_copa.coste, 50)
    assert.equal(byCanal.cocina.coste, 60)
    assert.equal(byCanal.rotura.coste, 25)
  })
  it('alias evento↔grupo_evento: agregador emite "evento" → fila "grupo_evento"', () => {
    const r = listarSalidasNoVenta({
      evento:   { uds: 2, valor: 100, coste: 50 },
      maridaje: { uds: 8, valor: 300, coste: 120 },
    })
    const canales = r.map(x => x.canal)
    assert.ok(canales.includes('grupo_evento'))
    assert.ok(canales.includes('maridaje'))
    const ev = r.find(x => x.canal === 'grupo_evento')
    assert.equal(ev.uds, 2)
    assert.equal(ev.coste, 50)
  })
  it('invitacion con solo copas (sin botellas) emite sólo invitacion_copa', () => {
    const r = listarSalidasNoVenta({
      invitacion: { uds: 4, botella_uds: 0, copa_uds: 4, botella_coste: 0, copa_coste: 20 },
    })
    assert.equal(r.length, 1)
    assert.equal(r[0].canal, 'invitacion_copa')
    assert.equal(r[0].copas, 4)
  })
  it('invitacion con solo botellas emite sólo invitacion_botella', () => {
    const r = listarSalidasNoVenta({
      invitacion: { uds: 2, botella_uds: 2, copa_uds: 0, botella_coste: 60, copa_coste: 0 },
    })
    assert.equal(r.length, 1)
    assert.equal(r[0].canal, 'invitacion_botella')
    assert.equal(r[0].uds, 2)
  })
  it('también acepta la shape futura con claves ya separadas', () => {
    const r = listarSalidasNoVenta({
      invitacion_botella: { uds: 3, coste: 90 },
      invitacion_copa:    { uds: 10, copas: 10, coste: 50 },
    })
    const byCanal = Object.fromEntries(r.map(x => [x.canal, x]))
    assert.equal(byCanal.invitacion_botella.uds, 3)
    assert.equal(byCanal.invitacion_copa.copas, 10)
  })
  it('legacy: canal "invitacion" sin agregador real / vacío → nada', () => {
    const r = listarSalidasNoVenta({ invitacion: {} })
    assert.equal(r.length, 0)
  })
})

describe('datosParaPeriodo — guarda contra stale-data', () => {
  it('mes coincide → devuelve datos', () => {
    const d = { informe: { por_canal: {} } }
    assert.equal(datosParaPeriodo({ mes: '2026-11', datos: d }, '2026-11'), d)
  })
  it('mes distinto → null (NUNCA cruza datos)', () => {
    const d = { informe: { por_canal: {} } }
    assert.equal(datosParaPeriodo({ mes: '2026-11', datos: d }, '2026-10'), null)
  })
  it('cached null / sin mes / sin datos → null', () => {
    assert.equal(datosParaPeriodo(null, '2026-11'), null)
    assert.equal(datosParaPeriodo({ mes: null, datos: {} }, '2026-11'), null)
    assert.equal(datosParaPeriodo({ mes: '2026-11', datos: null }, '2026-11'), null)
  })
  it('periodo inválido → null', () => {
    assert.equal(datosParaPeriodo({ mes: '2026-11', datos: {} }, null), null)
    assert.equal(datosParaPeriodo({ mes: '2026-11', datos: {} }, ''), null)
  })
})

describe('calcularStockFinalTeorico — método inventario', () => {
  it('escenario del enunciado con copas fraccionarias', () => {
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: 100, compras_netas: 50,
      ventas_botella_uds: 30, ventas_copa_copas: 12,
      salidas_no_venta_uds: 5,
    }), 113)
  })
  it('fortificado 8 copas = 0.96 bot.', () => {
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: 10, compras_netas: 0,
      ventas_botella_uds: 0, ventas_copa_copas: 8,
      salidas_no_venta_uds: 0,
      ml_copa: ML_COPA_FORTIFICADO,
    }), 9.04)
  })
  it('mes sin compras y con rotura (1 ud)', () => {
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: 50, compras_netas: 0,
      salidas_no_venta_uds: 1,
    }), 49)
  })
  it('invitación de 3 copas invitadas = 0.5 bot', () => {
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: 20, compras_netas: 0,
      salidas_no_venta_uds: copasAUdsBotella(3),  // 0.5
    }), 19.5)
  })
  it('null-safe: stock_inicial/compras null → null', () => {
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: null, compras_netas: 50,
    }), null)
    assert.equal(calcularStockFinalTeorico({
      stock_inicial: 100, compras_netas: null,
    }), null)
  })
})

describe('calcularConsumoDerivado', () => {
  it('100 + 50 − 120 = 30', () => {
    assert.equal(calcularConsumoDerivado({
      stock_inicial: 100, compras_netas: 50, stock_final_real: 120,
    }), 30)
  })
  it('null → null (sin dato, nunca 0)', () => {
    assert.equal(calcularConsumoDerivado({
      stock_inicial: 100, compras_netas: 50, stock_final_real: null,
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
    assert.equal(r.signo, 'cuadra')
  })
  it('faltan 2 uds → merma no registrada', () => {
    const r = conciliarTeoricoReal({
      stock_inicial: 100, compras_netas: 50,
      ventas_botella_uds: 30, stock_final_real: 118,
    })
    assert.equal(r.signo, 'faltan')
    assert.equal(r.diferencia, -2)
  })
  it('sobran 3 uds → ventas sin registrar', () => {
    const r = conciliarTeoricoReal({
      stock_inicial: 100, compras_netas: 0,
      stock_final_real: 103,
    })
    assert.equal(r.signo, 'sobran')
    assert.equal(r.diferencia, 3)
  })
  it('sin conteo real → todo null salvo teorico', () => {
    const r = conciliarTeoricoReal({
      stock_inicial: 100, compras_netas: 50,
      stock_final_real: null,
    })
    assert.equal(r.teorico, 150)
    assert.equal(r.real, null)
    assert.equal(r.signo, null)
  })
})
