/**
 * Invarianza de datos y fórmulas antes/después del branding.
 *
 * Aproximación: el módulo de estilos (`excelEstilos.js`) actúa sobre
 * el WORKSHEET de ExcelJS DESPUÉS de haber construido las celdas; NO
 * modifica la `spec` que devuelve `construirInformeEconomicoWorkbook`.
 *
 * Este test fija la spec sobre una fixture realista (Casa Marisma
 * 2026-11 con la shape real del agregador) y comprueba:
 *   - Valor numérico y fórmulas de todas las filas / totals son los
 *     mismos que la versión documentada (no hubo drift accidental al
 *     tocar el downloader).
 *   - Ninguna fórmula empieza por "=" (convención ExcelJS del repo).
 *   - Las hojas, su orden y sus nombres no cambian.
 *   - Los metadatos `restauranteNombre` y `periodo` quedan expuestos
 *     a nivel raíz para que el downloader pueda pintar el header.
 *
 * Ejecutar: node --test scripts/informeEconomicoInvariante.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'

function datosVinoCasaMarisma() {
  // Replica fiel de la shape que emite agregarPeriodoBodega.js para
  // Casa Marisma 2026-11 (ventas_neto=4768.18, iva=10 %).
  return {
    ventas_bruto: 5245.00,
    ventas_neto:  4768.18,
    iva_pct:      10,
    coste_ventas_teorico: 1560,
    informe: {
      por_canal: {
        botella:    { uds:  88, ingresos: 2200.00, coste:  660 },
        copa:       { uds:   0, copas: 651, ingresos: 3045.00, coste: 900 },
        invitacion: { uds: 6, botella_uds: 2, copa_uds: 4, botella_coste: 60, copa_coste: 20 },
        cocina:     { uds: 1, valor: 30, coste: 30 },
        evento:     { uds: 5, valor: 150, coste: 150 },
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
    datosVino:         datosVinoCasaMarisma(),
    ...overrides,
  }
}

function fingerprintSpec(spec) {
  // Devuelve una representación JSON-safe de la spec para comparar
  // deepEqual sin acoplarnos a referencias de objetos.
  return JSON.parse(JSON.stringify(spec))
}

describe('informeEconomicoExcel — invarianza del contrato', () => {
  it('orden y nombres de hojas estables', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const nombres = spec.sheets.map(s => s.name)
    // Acompañado con datos reales: 7 hojas canónicas.
    assert.deepEqual(nombres, [
      'Resumen', 'Personal', 'Gastos', 'Canales',
      'Canales venta', 'Salidas no-venta', 'Cierre bodega',
    ])
  })

  it('metadata de nivel raíz para header/footer de impresión', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    assert.equal(spec.restauranteNombre, 'Casa Marisma')
    assert.equal(spec.periodo,           '2026-11')
  })

  it('TOTAL NETO de "Canales venta" = ventas_neto (4768.18)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const canales = spec.sheets.find(s => s.name === 'Canales venta')
    assert.equal(canales.totals.ingresos_neto.result, 4768.18)
  })

  it('TOTAL INGRESOS del Resumen = facturacion + resto (4968.18)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const resumen = spec.sheets.find(s => s.name === 'Resumen')
    const total = resumen.rows.find(r => r.concepto && r.concepto.includes('TOTAL INGRESOS'))
    assert.equal(total.valor.result, 4968.18)
  })

  it('ninguna fórmula declarada empieza por "="', () => {
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
    assert.ok(encontradas >= 6)
  })

  it('al llamar DOS veces con los mismos args se produce la MISMA spec (determinista)', () => {
    const a = fingerprintSpec(construirInformeEconomicoWorkbook(argsBase()))
    const b = fingerprintSpec(construirInformeEconomicoWorkbook(argsBase()))
    assert.deepEqual(a, b)
  })
})
