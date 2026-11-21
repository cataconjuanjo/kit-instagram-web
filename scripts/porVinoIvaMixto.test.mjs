/**
 * Fase F — IVA por vino en informe.por_vino.
 *
 * Verifica:
 *   1. Invariancia: si NINGÚN vino tiene iva_pct propio (todos null
 *      o undefined), el resultado es BIT A BIT idéntico al previo
 *      (ingresos_neto netea con el iva_venta_pct global).
 *   2. IVA mezclado: dos vinos, uno al 10 % (global) y uno al 21 %
 *      (espumoso con iva_pct=21). Cada uno se netea con el suyo.
 *   3. Campo `iva_pct` del output:
 *      - null cuando se usó el global (compat con pre-Fase F).
 *      - el valor del vino cuando tenía iva_pct distinto.
 *   4. SELECT sin iva_pct (columna no aplicada): el flag `_iva_vino`
 *      queda null → fallback al global → mismos números que Fase D.
 *
 * Ejecutar: node --test scripts/porVinoIvaMixto.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { _agruparLineas } from '../app/lib/agregarPeriodoBodega.js'

const CONFIG = { copas_por_botella: 5, merma_copa_pct: 0, iva_venta_pct: 10 }

// Shape de línea con vino que lleva (o no) iva_pct en el JOIN.
function linea({ tipo = 'venta_botella', vino_id, vino, cantidad = 0, copas = 0, precio = 0 }) {
  return {
    tipo, vino_id, vino,
    cantidad, copas_vendidas: copas, precio_unitario: precio,
  }
}

describe('invariancia — sin iva_pct por vino, resultados idénticos a Fase D', () => {
  it('escenario Fase D clásico: iva global 10 %, ningún vino con iva_pct', () => {
    const vinoA = { id: 'A', nombre: 'Rioja', coste_medio_pmp: 10, coste_compra: null }
    // ni siquiera iva_pct en el objeto → equivalente a SELECT sin la columna
    const lineas = [
      linea({ tipo: 'venta_botella', vino_id: 'A', vino: vinoA, cantidad: 10, precio: 30 }),
      linea({ tipo: 'venta_copa',    vino_id: 'A', vino: vinoA, cantidad: 0, copas: 20, precio: 5 }),
    ]
    const r = _agruparLineas(lineas, CONFIG)
    const a = r.por_vino.find(v => v.vino_id === 'A')
    // ingresos brutos: 10*30 + 20*5 = 400
    // neto con IVA global 10: 400 / 1.10 = 363.6363... → r2 = 363.64
    assert.equal(a.ingresos, 400)
    assert.equal(a.ingresos_neto, 363.64)
    // La clave pública iva_pct reporta null → "se usó el global".
    assert.equal(a.iva_pct, null)
  })

  it('iva_pct=null explícito en el JOIN se comporta igual que undefined', () => {
    const vinoA = { id: 'A', nombre: 'Rioja', coste_medio_pmp: 10, coste_compra: null, iva_pct: null }
    const lineas = [linea({ vino_id: 'A', vino: vinoA, cantidad: 10, precio: 30 })]
    const r = _agruparLineas(lineas, CONFIG)
    const a = r.por_vino.find(v => v.vino_id === 'A')
    assert.equal(a.ingresos_neto, 272.73)   // 300 / 1.10
    assert.equal(a.iva_pct, null)
  })
})

describe('IVA por vino: un espumoso al 21 % y un vino al 10 % global', () => {
  const vinoCava = { id: 'C', nombre: 'Cava',  coste_medio_pmp: 10, coste_compra: null, iva_pct: 21 }
  const vinoRio  = { id: 'R', nombre: 'Rioja', coste_medio_pmp: 10, coste_compra: null }  // sin iva_pct → global

  it('cada uno netea con su IVA: 10 % para el Rioja, 21 % para el Cava', () => {
    const lineas = [
      linea({ vino_id: 'R', vino: vinoRio,  cantidad: 10, precio: 30 }),   // bruto 300
      linea({ vino_id: 'C', vino: vinoCava, cantidad:  5, precio: 40 }),   // bruto 200
    ]
    const r = _agruparLineas(lineas, CONFIG)
    const byId = Object.fromEntries(r.por_vino.map(v => [v.vino_id, v]))
    // Rioja: 300 / 1.10 = 272.727... → 272.73
    assert.equal(byId.R.ingresos_neto, 272.73)
    assert.equal(byId.R.iva_pct, null, 'Rioja usa global, iva_pct queda null')
    // Cava: 200 / 1.21 = 165.289... → 165.29
    assert.equal(byId.C.ingresos_neto, 165.29)
    assert.equal(byId.C.iva_pct, 21, 'Cava expone su iva_pct propio')
  })

  it('margen_bruto y multiplicador se calculan con el ingresos_neto específico', () => {
    const lineas = [
      // Cava: bruto 200 → neto 165.29; coste 5 × 10 = 50 → margen 115.29; mult 3.31
      linea({ vino_id: 'C', vino: vinoCava, cantidad: 5, precio: 40 }),
    ]
    const r = _agruparLineas(lineas, CONFIG)
    const c = r.por_vino.find(v => v.vino_id === 'C')
    assert.equal(c.ingresos_neto, 165.29)
    assert.equal(c.coste_total,   50)
    assert.equal(c.margen_bruto,  115.29)
    assert.equal(c.multiplicador,  3.31)
  })

  it('TODOS los vinos con iva_pct del restaurante (10) → mismos números que si fuera null', () => {
    // Si un restaurante explícitamente pone iva_pct=10 en todos sus
    // vinos, el resultado debe ser igual al escenario invariante.
    const vinoA_igual = { id: 'A', nombre: 'Rioja', coste_medio_pmp: 10, coste_compra: null, iva_pct: 10 }
    const vinoA_null  = { id: 'A', nombre: 'Rioja', coste_medio_pmp: 10, coste_compra: null }
    const l1 = [linea({ vino_id: 'A', vino: vinoA_igual, cantidad: 10, precio: 30 })]
    const l2 = [linea({ vino_id: 'A', vino: vinoA_null,  cantidad: 10, precio: 30 })]
    const r1 = _agruparLineas(l1, CONFIG).por_vino[0]
    const r2 = _agruparLineas(l2, CONFIG).por_vino[0]
    assert.equal(r1.ingresos_neto, r2.ingresos_neto)
    assert.equal(r1.margen_bruto,  r2.margen_bruto)
    assert.equal(r1.multiplicador, r2.multiplicador)
  })
})

describe('contract — _iva_vino nunca se expone en el shape público', () => {
  it('output no contiene _iva_vino ni _uds_venta ni _copas_venta', () => {
    const vino = { id: 'A', nombre: 'A', coste_medio_pmp: 5, coste_compra: null, iva_pct: 10 }
    const r = _agruparLineas([linea({ vino_id: 'A', vino, cantidad: 1, precio: 10 })], CONFIG)
    for (const v of r.por_vino) {
      assert.equal(v._iva_vino,   undefined)
      assert.equal(v._uds_venta,  undefined)
      assert.equal(v._copas_venta, undefined)
    }
  })
})
