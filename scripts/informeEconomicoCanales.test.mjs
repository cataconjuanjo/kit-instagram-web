/**
 * Test de integración (sin red) para el Informe Económico Excel.
 *
 * Verifica, usando la shape REAL de `por_canal` que emite
 * app/lib/agregarPeriodoBodega.js (con `invitacion` agregado, `evento`
 * como alias de `grupo_evento`, `ingresos` BRUTO con IVA):
 *   - El workbook incluye "Canales venta" y "Salidas no-venta" cuando
 *     hay datos.
 *   - Los importes de "Canales venta" están en NETO y cuadran con
 *     `datosVino.ventas_neto` del snapshot.
 *   - "Salidas no-venta" expande `invitacion` en 2 filas canónicas y
 *     respeta el alias `evento`→`grupo_evento`.
 *   - Las fórmulas (objeto { formula, result }) NO empiezan por "=".
 *   - Sin `por_canal` las 5 hojas de siempre siguen apareciendo.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'

// Shape REAL del agregador para Casa Marisma 2026-11 (según preview):
//   ventas_bruto=5245.00, ventas_neto=4768.18, iva_pct=10.
function datosVinoNoviembre() {
  return {
    ventas_bruto: 5245.00,
    ventas_neto:  4768.18,
    iva_pct:      10,
    coste_ventas_teorico: 1560,
    informe: {
      por_canal: {
        botella:    { uds:  88, ingresos: 2200.00, coste:  660 },
        copa:       { uds:   0, copas: 651, ingresos: 3045.00, coste:  900 },
        invitacion: { uds: 6, botella_uds: 2, copa_uds: 4, botella_coste: 60, copa_coste: 20 },
        cocina:     { uds: 1, valor: 30, coste: 30 },
        evento:     { uds: 5, valor: 150, coste: 150 },     // alias grupo_evento
        maridaje:   { uds: 3, valor: 90, coste: 90 },
        rotura:     { uds: 1, coste: 25 },
      },
    },
  }
}

function argsBase(overrides = {}) {
  return {
    restauranteNombre: 'Casa Marisma',
    periodo: '2026-11',
    esSomm: false,
    facturacion:      4768.18,
    restoIngresos:     200,
    consumoMp:        1560,
    totalPersonal:     800,
    totalGastos:       300,
    totalAlquiler:     200,
    totalBancarios:     80,
    breakEven:        2500,
    personal:          { nominas_brutas: 600, ss_empresa: 180, extras_personal: 20, retenciones_irpf: 0 },
    gastosPartidas:    [],
    alquilerPartidas:  [],
    bancarios:         { comisiones_datafono: 50, mantenimiento_datafono: 20, resto_comisiones: 10 },
    canales:           { copa_barra: 1000, botella_mesa: 2000, grupos_eventos: 700, take_away: 100 },
    registrosCompras:  [],
    imputacion_pct:    {},
    datosVino:         datosVinoNoviembre(),
    ...overrides,
  }
}

function nombres(spec) { return spec.sheets.map(s => s.name) }
function hoja(spec, nombre) { return spec.sheets.find(s => s.name === nombre) }

describe('Informe Económico Excel — hojas Fase 3', () => {
  it('con por_canal y iva_pct: añade "Canales venta" y "Salidas no-venta"', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const names = nombres(spec)
    for (const n of ['Canales venta', 'Salidas no-venta']) {
      assert.ok(names.includes(n), `falta ${n}; hojas = ${names.join(', ')}`)
    }
  })

  it('"Canales venta" muestra NETO y el total cuadra con ventas_neto', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const s = hoja(spec, 'Canales venta')
    // 2 filas: Botella (mesa), Copa.
    assert.equal(s.rows.length, 2)
    const nombresFila = s.rows.map(r => r.canal)
    assert.deepEqual(nombresFila, ['Botella (mesa)', 'Copa'])

    // La fila de botella: bruto 2200 → neto 2000 (iva 10%).
    const bot = s.rows[0]
    assert.equal(bot.ingresos_bruto, 2200)
    assert.equal(bot.ingresos_neto, 2000)
    // La fila de copa: bruto 3045 → neto 2768.18.
    const cop = s.rows[1]
    assert.equal(cop.ingresos_bruto, 3045)
    assert.equal(cop.ingresos_neto, 2768.18)
    // Totales: NETO = 4768.18 = ventas_neto.
    assert.equal(s.totals.ingresos_bruto.result, 5245)
    assert.equal(s.totals.ingresos_neto.result,  4768.18)
    assert.equal(s.totals.coste.result,          1560)
    assert.equal(s.totals.beneficio.result,      3208.18)   // 4768.18 − 1560
  })

  it('"Salidas no-venta" expande invitacion → 2 filas, alias evento→grupo_evento', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const s = hoja(spec, 'Salidas no-venta')
    const filas = s.rows.map(r => r.canal)
    assert.deepEqual(filas, [
      'Invitación (botella)', 'Invitación (copa)',
      'Cocina', 'Grupo / Evento', 'Maridaje', 'Rotura / defecto',
    ])
    const porCanal = Object.fromEntries(s.rows.map(r => [r.canal, r]))
    assert.equal(porCanal['Invitación (botella)'].uds, 2)
    assert.equal(porCanal['Invitación (botella)'].coste, 60)
    assert.equal(porCanal['Invitación (copa)'].uds,  4)
    assert.equal(porCanal['Invitación (copa)'].copas, 4)
    assert.equal(porCanal['Invitación (copa)'].coste, 20)
    assert.equal(porCanal['Grupo / Evento'].uds, 5)
    assert.equal(porCanal['Grupo / Evento'].coste, 150)
  })

  it('ninguna fórmula declarada { formula, result } empieza por "=" (convención ExcelJS)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    let encontradas = 0
    for (const sheet of spec.sheets) {
      const all = [...sheet.rows, ...(sheet.totals ? [sheet.totals] : [])]
      for (const row of all) {
        for (const key of Object.keys(row)) {
          const v = row[key]
          if (v && typeof v === 'object' && typeof v.formula === 'string') {
            encontradas++
            assert.ok(!v.formula.startsWith('='),
              `fórmula con "=" inicial en ${sheet.name}.${key}: "${v.formula}"`)
          }
        }
      }
    }
    assert.ok(encontradas >= 6, `se esperaban ≥6 fórmulas (resumen+canales venta+salidas), encontradas: ${encontradas}`)
  })
})

describe('Informe Económico Excel — degradación', () => {
  it('datosVino sin informe.por_canal → NO se añaden las 2 hojas; sí 5 clásicas', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({
      datosVino: { ventas_bruto: 5245, ventas_neto: 4768.18, iva_pct: 10 },
    }))
    const names = nombres(spec)
    assert.ok(!names.includes('Canales venta'))
    assert.ok(!names.includes('Salidas no-venta'))
    for (const n of ['Resumen', 'Personal', 'Gastos', 'Canales', 'Cierre bodega']) {
      assert.ok(names.includes(n))
    }
  })

  it('datosVino=null → sin hojas nuevas; sin Cierre bodega', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: null }))
    const names = nombres(spec)
    assert.ok(!names.includes('Canales venta'))
    assert.ok(!names.includes('Salidas no-venta'))
    assert.ok(!names.includes('Cierre bodega'))
  })

  it('por_canal={} → sin hojas nuevas', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({
      datosVino: { informe: { por_canal: {} }, iva_pct: 10 },
    }))
    const names = nombres(spec)
    assert.ok(!names.includes('Canales venta'))
    assert.ok(!names.includes('Salidas no-venta'))
  })
})
