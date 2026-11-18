/**
 * Integración (sin red) — Excel "Canales venta" con filas de eventos.
 *
 * Simula el snapshot devuelto por /api/cierres-mes con
 * `informe.eventos` (producido por calcularMesBodega leyendo
 * eventos_bodega) y verifica que:
 *   1. La hoja "Canales venta" añade filas "Maridaje" y "Grupos /
 *      Eventos" con el importe NETO proveniente de la cabecera,
 *      sin alterar las filas de botella y copa.
 *   2. Las fórmulas siguen sin "=" inicial.
 *   3. Sin `informe.eventos` o con eventos vacíos, la hoja queda
 *      EXACTAMENTE como en main (sólo botella + copa).
 *
 * Ejecutar: node --test scripts/canalesVentaConEventos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'

function datosVinoBase(extra = {}) {
  return {
    ventas_bruto: 5245.00,
    ventas_neto:  4768.18,
    iva_pct:      10,
    coste_ventas_teorico: 1560,
    informe: {
      por_canal: {
        botella:  { uds: 88, ingresos: 2200, coste: 660 },
        copa:     { uds: 0, copas: 651, ingresos: 3045, coste: 900 },
        maridaje: { uds: 3, valor: 90, coste: 90 },
        evento:   { uds: 5, valor: 150, coste: 150 },
      },
      ...extra,
    },
  }
}

function argsBase(datosVinoOverride) {
  return {
    restauranteNombre: 'Casa Marisma', periodo: '2026-11', esSomm: false,
    facturacion: 4768.18, restoIngresos: 0, consumoMp: 1560,
    totalPersonal: 800, totalGastos: 300, totalAlquiler: 200, totalBancarios: 80, breakEven: 2500,
    personal: { nominas_brutas: 600, ss_empresa: 180, extras_personal: 20, retenciones_irpf: 0 },
    gastosPartidas: [], alquilerPartidas: [],
    bancarios: { comisiones_datafono: 50, mantenimiento_datafono: 20, resto_comisiones: 10 },
    canales: { copa_barra: 1000, botella_mesa: 2000, grupos_eventos: 700, take_away: 100 },
    registrosCompras: [], imputacion_pct: {},
    datosVino: datosVinoOverride || datosVinoBase(),
  }
}

function hoja(spec, nombre) { return spec.sheets.find(s => s.name === nombre) }

describe('Excel "Canales venta" — filas de eventos (Fase A)', () => {
  it('con informe.eventos no-TPV: añade filas Maridaje y Grupos / Eventos', () => {
    const datos = datosVinoBase({
      eventos: {
        maridaje: { n: 2, importe_neto_total: 700, comensales_total: 14, importe_bruto_total: 770 },
        grupo:    { n: 1, importe_neto_total: 300, comensales_total: 8,  importe_bruto_total: 330 },
        ingresos_netos_para_canal: 1000,
        excluidos_tpv: 0,
      },
    })
    const spec = construirInformeEconomicoWorkbook(argsBase(datos))
    const s = hoja(spec, 'Canales venta')
    assert.ok(s)
    const canales = s.rows.map(r => r.canal)
    // 2 clásicas + 2 eventos
    assert.deepEqual(canales, ['Botella (mesa)', 'Copa', 'Maridaje', 'Grupos / Eventos'])
    // Importes netos: maridaje = 700, evento = 300.
    const byCanal = Object.fromEntries(s.rows.map(r => [r.canal, r]))
    assert.equal(byCanal['Maridaje'].ingresos_neto, 700)
    assert.equal(byCanal['Grupos / Eventos'].ingresos_neto, 300)
    // Coste proviene de por_canal (vino consumido del evento).
    assert.equal(byCanal['Maridaje'].coste, 90)
    assert.equal(byCanal['Grupos / Eventos'].coste, 150)
    // Beneficio = neto − coste (fórmula con result precalculado).
    assert.equal(byCanal['Maridaje'].beneficio.result, 610)
    assert.equal(byCanal['Grupos / Eventos'].beneficio.result, 150)
    // TOTAL NETO = 2000 (botella) + 2768.18 (copa) + 700 + 300 = 5768.18.
    assert.equal(s.totals.ingresos_neto.result, 5768.18)
  })

  it('sin informe.eventos: idéntico al comportamiento previo (2 filas)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase(/* sin eventos */))
    const s = hoja(spec, 'Canales venta')
    const canales = s.rows.map(r => r.canal)
    assert.deepEqual(canales, ['Botella (mesa)', 'Copa'])
    assert.equal(s.totals.ingresos_neto.result, 4768.18)
  })

  it('eventos con importe 0 → la fila no se añade (degradación)', () => {
    const datos = datosVinoBase({
      eventos: {
        maridaje: { n: 2, importe_neto_total: 0, comensales_total: 14, importe_bruto_total: 0 },
        grupo:    { n: 0, importe_neto_total: 0, comensales_total: 0,  importe_bruto_total: 0 },
        ingresos_netos_para_canal: 0,
        excluidos_tpv: 2,
      },
    })
    const spec = construirInformeEconomicoWorkbook(argsBase(datos))
    const s = hoja(spec, 'Canales venta')
    const canales = s.rows.map(r => r.canal)
    assert.deepEqual(canales, ['Botella (mesa)', 'Copa'])
  })

  it('las fórmulas declaradas siguen sin "=" inicial tras añadir eventos', () => {
    const datos = datosVinoBase({
      eventos: {
        maridaje: { n: 1, importe_neto_total: 500 },
        grupo:    { n: 1, importe_neto_total: 200 },
      },
    })
    const spec = construirInformeEconomicoWorkbook(argsBase(datos))
    const s = hoja(spec, 'Canales venta')
    const all = [...s.rows, s.totals]
    for (const row of all) {
      for (const k of Object.keys(row)) {
        const v = row[k]
        if (v && typeof v === 'object' && typeof v.formula === 'string') {
          assert.ok(!v.formula.startsWith('='), `fórmula con "=" inicial en ${k}: ${v.formula}`)
        }
      }
    }
  })
})
