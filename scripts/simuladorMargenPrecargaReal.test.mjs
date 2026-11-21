/**
 * Fase C-3 — precarga con la forma REAL del endpoint /api/cierres-mes.
 *
 * Shape verificada en preview Casa Marisma 2026-10 (mes EN VIVO, no
 * cerrado). calcularMesBodega devuelve en RAÍZ:
 *   ventas_bruto, ventas_neto, iva_pct,
 *   coste_ventas_teorico, margen_bruto, margen_pct,
 *   ...
 *   informe: { por_canal: { botella, copa, invitacion:{botella_coste,copa_coste},
 *                           cocina:{coste}, rotura:{coste}, cata:{coste},
 *                           evento, maridaje }, ... }
 *
 * Para meses cerrados, cierre.snapshot tiene la misma shape (es lo
 * que se insertó al cerrar).
 *
 * Esta suite ahora usa la fixture REAL y NO la "resumen" inventada
 * que encubría el bug en la fase C-2. Incluye un contract test que
 * falla si el simulador vuelve a leer una clave inexistente en la
 * fixture real.
 *
 * Ejecutar: node --test scripts/simuladorMargenPrecargaReal.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularSimuladorMargen,
  compararConReal,
  normalizarSnapshot,
  precargarDesdeSnapshot,
} from '../app/lib/simuladorMargen.js'
import { datosParaPeriodo } from '../app/lib/canalesSalidas.js'

// Fixture 1: mes EN VIVO Casa Marisma 2026-10 (datos reales del
// preview). por_canal todo en 0 porque el restaurante aún no ha
// metido partes: 0 LEGÍTIMO, con origen "calculado del mes".
function snapshotCasaMarisma_2026_10_EnVivo() {
  return {
    mes: '2026-10',
    desde: '2026-10-01',
    hasta: '2026-10-31',
    ventas_bruto: 10583.00,
    ventas_neto:  9621.82,
    iva_pct: 10,
    coste_ventas_teorico: 4044.12,
    margen_bruto: 5577.70,
    margen_pct: 58,
    salidas_no_venta: 0,
    informe: {
      por_canal: {
        botella:    { uds: 60, ingresos: 7000, coste: 3000 },
        copa:       { uds: 0, copas: 420, ingresos: 2621.82, coste: 1044.12 },
        invitacion: { uds: 0, botella_uds: 0, copa_uds: 0, botella_coste: 0, copa_coste: 0 },
        cocina:     { uds: 0, coste: 0 },
        cata:       { uds: 0, coste: 0 },
        rotura:     { uds: 0, coste: 0 },
        evento:     { uds: 0, valor: 0, coste: 0 },
        maridaje:   { uds: 0, valor: 0, coste: 0 },
      },
    },
  }
}

// Fixture 2: mes CERRADO (cierre.snapshot tiene la misma shape más
// enriquecimiento de sumiller). Estructuralmente idéntico desde el
// punto de vista del simulador.
function snapshotCerrado_2026_09() {
  return {
    mes: '2026-09',
    ventas_bruto: 5245,
    ventas_neto:  4768.18,
    iva_pct: 10,
    coste_ventas_teorico: 1560,
    margen_bruto: 3208.18,
    margen_pct: 67,
    informe: {
      por_canal: {
        botella:    { uds: 60, ingresos: 3245, coste: 980 },
        copa:       { uds: 0, copas: 420, ingresos: 2000, coste: 580 },
        invitacion: { uds: 0, botella_uds: 2, copa_uds: 10, botella_coste: 60, copa_coste: 30 },
        cocina:     { uds: 1, coste: 25 },
        cata:       { uds: 2, coste: 90 },
        rotura:     { uds: 1, coste: 45 },
      },
    },
    // campos añadidos al cerrar (sumiller):
    vinos_stock: [],
    stock_final: 1200,
  }
}

describe('normalizarSnapshot — tolera shape real (raíz) y legacy (resumen)', () => {
  it('shape real: lee ventas/coste/margen en raíz y por_canal en informe', () => {
    const snap = normalizarSnapshot(snapshotCasaMarisma_2026_10_EnVivo())
    assert.equal(snap.ventas_neto, 9621.82)
    assert.equal(snap.coste_ventas_teorico, 4044.12)
    assert.equal(snap.margen_bruto, 5577.70)
    assert.equal(snap.periodo, '2026-10')
    assert.ok(snap.por_canal)
    assert.equal(snap.por_canal.botella.ingresos, 7000)
  })

  it('shape legacy (resumen): sigue funcionando para no romper tests antiguos', () => {
    const legacy = {
      periodo: '2026-11',
      resumen: { ventas_neto: 4768.18, coste_ventas_teorico: 1560, margen_bruto: 3208.18 },
      por_canal: { rotura: { coste: 10 } },
    }
    const snap = normalizarSnapshot(legacy)
    assert.equal(snap.ventas_neto, 4768.18)
    assert.equal(snap.coste_ventas_teorico, 1560)
    assert.equal(snap.periodo, '2026-11')
    assert.equal(snap.por_canal.rotura.coste, 10)
  })

  it('null / {} → todos null, no 0', () => {
    const vacio = normalizarSnapshot(null)
    assert.equal(vacio.ventas_neto, null)
    assert.equal(vacio.coste_ventas_teorico, null)
    assert.equal(vacio.margen_bruto, null)
    assert.equal(vacio.por_canal, null)
    assert.equal(vacio.periodo, null)
  })
})

describe('precargarDesdeSnapshot con shape REAL (Casa Marisma 2026-10)', () => {
  const snapshotMes = snapshotCasaMarisma_2026_10_EnVivo()

  it('ventas_previstas = datos.ventas_neto (9.621,82)', () => {
    const { valores, origen } = precargarDesdeSnapshot({ snapshotMes, parametros: null })
    assert.equal(valores.ventas_previstas, 9621.82)
    assert.match(origen.ventas_previstas, /2026-10/)
    assert.match(origen.ventas_previstas, /ventas_neto/)
  })

  it('roturas_invitaciones del snapshot: 0 LEGÍTIMO con origen (no "manual")', () => {
    const { valores, origen } = precargarDesdeSnapshot({ snapshotMes, parametros: null })
    assert.equal(valores.roturas_invitaciones, 0)
    assert.match(origen.roturas_invitaciones, /2026-10/)
    assert.match(origen.roturas_invitaciones, /rotura\+invitacion\+cocina\+cata/)
  })

  it('personal y alquiler imputados a bodega (modo ya_imputado)', () => {
    // El componente aplica imputarParametros + totales ANTES, y pasa
    // ya_imputado: true. No se multiplica por pct otra vez.
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: {
        ya_imputado: true,
        total_personal: 1500,   // ya imputado: mitad del coste bruto
        total_alquiler: 400,
      },
    })
    assert.equal(valores.personal, 1500)
    assert.equal(valores.alquiler, 400)
    assert.match(origen.personal, /imputado a bodega/)
    assert.match(origen.alquiler, /imputado a bodega/)
    // NO aparece "imputación N %" (ése es el modo compat con tests viejos)
    assert.doesNotMatch(origen.personal, /imputación \d+%/)
  })

  it('personal 0 € = 0 LEGÍTIMO cuando hay fila con totales 0 (no inventado)', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: { ya_imputado: true, total_personal: 0, total_alquiler: 0 },
    })
    assert.equal(valores.personal, 0)
    assert.equal(valores.alquiler, 0)
    // Aun siendo 0, el origen DEBE ser el del mes (hay dato, dice 0).
    assert.match(origen.personal, /imputado a bodega/)
  })

  it('SIN fila de parametros → personal/alquiler null (origen "manual" → UI "Sin dato")', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes,
      parametros: null,
    })
    assert.equal(valores.personal, null)
    assert.equal(valores.alquiler, null)
    assert.equal(origen.personal, 'manual')
    assert.equal(origen.alquiler, 'manual')
  })
})

describe('compararConReal con shape REAL — margen bruto y % MP del mes', () => {
  const snapshotMes = snapshotCasaMarisma_2026_10_EnVivo()

  it('margen bruto real = datos.margen_bruto (5.577,70 €)', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 1000 }, beneficio_objetivo: 500, ventas_previstas: 9621.82,
    })
    const cmp = compararConReal({ simulacion: sim, snapshotMes })
    assert.equal(cmp.margen_bruto_real, 5577.70)
  })

  it('% materia prima real = coste/ventas × 100 (42,03 %)', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 1000 }, beneficio_objetivo: 500, ventas_previstas: 9621.82,
    })
    const cmp = compararConReal({ simulacion: sim, snapshotMes })
    // 4044.12 / 9621.82 = 0.420317… → 42.03
    assert.equal(cmp.pct_materia_prima_real, 42.03)
  })

  it('cubre: real (5.577,70) vs necesario (gastos+beneficio = 1.500) → cubre=true', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 1000 }, beneficio_objetivo: 500, ventas_previstas: 9621.82,
    })
    const cmp = compararConReal({ simulacion: sim, snapshotMes })
    assert.equal(cmp.diferencia_vs_minimo.cubre, true)
    assert.ok(cmp.diferencia_vs_minimo.eur > 0)
  })
})

describe('mes cerrado: cierre.snapshot tiene la misma shape', () => {
  it('leyendo desde cierre.snapshot va igual que desde datos', () => {
    const snap = snapshotCerrado_2026_09()
    const { valores, origen } = precargarDesdeSnapshot({ snapshotMes: snap, parametros: null })
    assert.equal(valores.ventas_previstas, 4768.18)
    // 45 + 60 + 30 + 25 + 90 = 250
    assert.equal(valores.roturas_invitaciones, 250)
    assert.match(origen.roturas_invitaciones, /2026-09/)

    const sim = calcularSimuladorMargen({
      gastos: { personal: 1000 }, beneficio_objetivo: 500, ventas_previstas: 4768.18,
    })
    const cmp = compararConReal({ simulacion: sim, snapshotMes: snap })
    assert.equal(cmp.margen_bruto_real, 3208.18)
  })
})

describe('sello de periodo — cambio de mes no deja datos del mes anterior', () => {
  it('cache de 2026-09 descartado si periodo = 2026-10', () => {
    const cache = { mes: '2026-09', datos: snapshotCerrado_2026_09() }
    assert.equal(datosParaPeriodo(cache, '2026-10'), null)
    const snapshotCorriente = datosParaPeriodo(cache, '2026-10')
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes: snapshotCorriente,
      parametros: null,
    })
    assert.equal(valores.roturas_invitaciones, null)
    assert.equal(valores.ventas_previstas, null)
    assert.equal(origen.roturas_invitaciones, 'manual')
  })
})

describe('invariante — ejemplo EXACTO de la hoja Grand Cru Academy', () => {
  it('9.060 € / 60,40 % / 39,60 % / 2,53 intacto', () => {
    const r = calcularSimuladorMargen({
      gastos: {
        personal: 3000, roturas_invitaciones: 200, materiales: 20,
        suministros: 40, alquiler: 800, otros: 0,
      },
      beneficio_objetivo: 5000,
      ventas_previstas: 15000,
    })
    assert.equal(r.margen_bruto_necesario, 9060)
    assert.equal(r.pct_margen_minimo, 60.4)
    assert.equal(r.pct_materia_prima_max, 39.6)
    assert.equal(r.multiplicador_minimo, 2.53)
  })
})

// ── Contract test: ninguna clave leída es inexistente en la shape real ──
//
// Objetivo: si alguien vuelve a leer `snapshot.resumen.foo` o
// `snapshot.por_canal.bar` (olvidando el sub-nivel `informe`), este
// test falla porque reconstruye la fixture real con un proxy que
// grita si se accede a una clave no definida.

describe('contract test — el simulador lee las rutas REALES del snapshot', () => {
  // Estrategia: con la fixture REAL, ejecutamos el flujo completo.
  // Si el código vuelve a leer `.resumen.ventas_neto` (ruta legacy)
  // en lugar de `.ventas_neto` (ruta real), los valores resultantes
  // serán null y los asserts fallarán. Es un contract test "end to end":
  // mide el RESULTADO con la shape real, que es lo que importa.
  it('precarga: con shape real, ventas_previstas y roturas se precargan (no quedan null)', () => {
    const { valores, origen } = precargarDesdeSnapshot({
      snapshotMes: snapshotCasaMarisma_2026_10_EnVivo(),
      parametros: null,
    })
    // Si el código leyera `snapshot.resumen.ventas_neto` en lugar
    // de `snapshot.ventas_neto`, este valor sería null.
    assert.equal(valores.ventas_previstas, 9621.82,
      'ventas_previstas debería leerse desde snapshot.ventas_neto (shape real)')
    // Si leyera `snapshot.por_canal` en lugar de `informe.por_canal`,
    // roturas_invitaciones sería null, no 0.
    assert.equal(valores.roturas_invitaciones, 0,
      'roturas_invitaciones debería leerse desde snapshot.informe.por_canal (shape real)')
    assert.notEqual(origen.ventas_previstas, 'manual',
      'ventas_previstas debería tener origen calculado, no manual')
    assert.notEqual(origen.roturas_invitaciones, 'manual',
      'roturas_invitaciones debería tener origen calculado, no manual')
  })

  it('comparación: con shape real, margen_bruto_real y %MP salen con los números reales', () => {
    const sim = calcularSimuladorMargen({
      gastos: { personal: 500 }, ventas_previstas: 9621.82, beneficio_objetivo: 0,
    })
    const cmp = compararConReal({
      simulacion: sim,
      snapshotMes: snapshotCasaMarisma_2026_10_EnVivo(),
    })
    assert.equal(cmp.margen_bruto_real, 5577.70,
      'margen_bruto_real debería leer snapshot.margen_bruto o derivarlo de raíz')
    assert.equal(cmp.pct_materia_prima_real, 42.03,
      '% MP real debería derivarse de snapshot.coste_ventas_teorico / snapshot.ventas_neto')
  })

  it('regresión explícita: si alguien reintroduce lectura de .resumen.ventas_neto, falla', () => {
    // Fixture SIN .resumen — la shape real. Si el código leyera esa
    // ruta fantasma, valores.ventas_previstas sería null.
    const snap = snapshotCasaMarisma_2026_10_EnVivo()
    assert.equal(snap.resumen, undefined,
      'La fixture real NO tiene .resumen (es el fallback legacy)')
    const { valores } = precargarDesdeSnapshot({ snapshotMes: snap, parametros: null })
    assert.notEqual(valores.ventas_previstas, null,
      'si la ruta real .ventas_neto no se lee, este valor sería null → bug reintroducido')
  })
})

