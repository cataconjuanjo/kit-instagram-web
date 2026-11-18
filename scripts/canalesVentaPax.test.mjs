/**
 * Fase B — columna PAX separada en "Canales venta".
 *
 * Verifica que:
 *   - Botella/Copa tienen pax=null (celda vacía en Excel).
 *   - Maridaje/Grupos tienen pax=comensales y uds=null.
 *   - El TOTAL de uds NO suma los comensales (bug reportado:
 *     88 botellas + 5 comensales = 93; ahora uds total = 88).
 *   - El TOTAL de PAX suma sólo los PAX.
 *   - Coste del evento sigue viniendo de por_canal.<canal>.coste
 *     (sin bug de mapeo).
 *   - Las fórmulas apuntan a las letras de columna nuevas y no
 *     empiezan por "=".
 *
 * Ejecutar: node --test scripts/canalesVentaPax.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'
import { listarCanalesVenta } from '../app/lib/canalesSalidas.js'

function datosVinoConEventos() {
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
      eventos: {
        maridaje: { n: 1, importe_neto_total: 700, comensales_total: 14 },
        grupo:    { n: 1, importe_neto_total: 300, comensales_total: 5  },
      },
    },
  }
}
function argsBase() {
  return {
    restauranteNombre: 'Casa Marisma', periodo: '2026-11', esSomm: false,
    facturacion: 4768.18, restoIngresos: 0, consumoMp: 1560,
    totalPersonal: 800, totalGastos: 300, totalAlquiler: 200, totalBancarios: 80, breakEven: 2500,
    personal: {}, gastosPartidas: [], alquilerPartidas: [],
    bancarios: {}, canales: {}, registrosCompras: [], imputacion_pct: {},
    datosVino: datosVinoConEventos(),
  }
}
function hoja(spec, nombre) { return spec.sheets.find(s => s.name === nombre) }

describe('listarCanalesVenta — pax separado de uds', () => {
  it('botella/copa tienen pax null; maridaje/evento tienen pax y uds=null', () => {
    const r = listarCanalesVenta({
      botella:  { uds: 88, ingresos: 2200, coste: 660 },
      copa:     { uds: 0,  copas: 651, ingresos: 3045, coste: 900 },
      maridaje: { coste: 90 },
      evento:   { coste: 150 },
    }, {
      iva_pct: 10,
      eventos: {
        maridaje: { importe_neto_total: 700, comensales_total: 14 },
        grupo:    { importe_neto_total: 300, comensales_total: 5  },
      },
    })
    const by = Object.fromEntries(r.map(x => [x.canal, x]))
    assert.equal(by.botella.pax, null)
    assert.equal(by.botella.uds, 88)
    assert.equal(by.copa.pax, null)
    // Eventos: uds null, pax con valor.
    assert.equal(by.maridaje.uds, null)
    assert.equal(by.maridaje.pax, 14)
    assert.equal(by.evento.uds, null)
    assert.equal(by.evento.pax, 5)
  })

  it('coste del evento viene de por_canal.<canal>.coste (sin bug de mapeo)', () => {
    const r = listarCanalesVenta(
      {
        maridaje: { coste: 90 },  // coste de vino consumido en el maridaje
        evento:   { coste: 150 }, // coste de vino consumido en el grupo
      },
      {
        iva_pct: 10,
        eventos: {
          maridaje: { importe_neto_total: 700 },
          grupo:    { importe_neto_total: 300 },
        },
      },
    )
    const by = Object.fromEntries(r.map(x => [x.canal, x]))
    assert.equal(by.maridaje.coste, 90)
    assert.equal(by.evento.coste,   150)
    // Beneficio = neto − coste.
    assert.equal(by.maridaje.beneficio, 610)   // 700 − 90
    assert.equal(by.evento.beneficio,   150)   // 300 − 150
  })

  it('evento con coste=0 (sin consumo de vino registrado) → beneficio = neto', () => {
    const r = listarCanalesVenta(
      { evento: { coste: 0 } },
      { eventos: { grupo: { importe_neto_total: 200 } } },
    )
    const ev = r.find(x => x.canal === 'evento')
    assert.equal(ev.coste, 0)
    assert.equal(ev.beneficio, 200)
  })
})

describe('Excel "Canales venta" — PAX en columna propia + totales separados', () => {
  it('columnas incluyen "PAX" entre "copas" y "Facturado bruto"', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const s = hoja(spec, 'Canales venta')
    const cols = s.columns.map(c => c.key)
    assert.deepEqual(cols, [
      'canal', 'uds', 'copas', 'pax',
      'ingresos_bruto', 'ingresos_neto', 'coste', 'beneficio',
    ])
    // PAX en la columna D (índice 4), header 'PAX'.
    assert.equal(s.columns[3].key,    'pax')
    assert.equal(s.columns[3].header, 'PAX')
  })

  it('filas de botella/copa dejan PAX vacío; filas de evento dejan uds vacío', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const s = hoja(spec, 'Canales venta')
    const by = Object.fromEntries(s.rows.map(r => [r.canal, r]))
    // Botella.
    assert.equal(by['Botella (mesa)'].uds, 88)
    assert.equal(by['Botella (mesa)'].pax, '')
    // Maridaje y Grupos.
    assert.equal(by['Maridaje'].uds,        '')
    assert.equal(by['Maridaje'].pax,        14)
    assert.equal(by['Grupos / Eventos'].uds, '')
    assert.equal(by['Grupos / Eventos'].pax,  5)
  })

  it('TOTAL de uds NO suma PAX (fix del bug 88 + 5 = 93)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const s = hoja(spec, 'Canales venta')
    // Sólo botella aporta uds (88). Copa tiene uds=0.
    assert.equal(s.totals.uds.result, 88)
    // PAX total = 14 + 5 = 19.
    assert.equal(s.totals.pax.result, 19)
    // Ingresos neto total sigue cuadrando con ventas_neto + eventos.
    assert.equal(s.totals.ingresos_neto.result, 5768.18)
  })

  it('fórmulas de totales usan las letras nuevas (B..G) sin "=" inicial', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const s = hoja(spec, 'Canales venta')
    assert.equal(s.totals.uds.formula,            'SUM(B2:B5)')
    assert.equal(s.totals.pax.formula,            'SUM(D2:D5)')
    assert.equal(s.totals.ingresos_bruto.formula, 'SUM(E2:E5)')
    assert.equal(s.totals.ingresos_neto.formula,  'SUM(F2:F5)')
    assert.equal(s.totals.coste.formula,          'SUM(G2:G5)')
    assert.equal(s.totals.beneficio.formula,      'F6-G6')
    // Ninguna fórmula empieza por "=".
    for (const v of Object.values(s.totals)) {
      if (v && typeof v === 'object' && v.formula) {
        assert.ok(!v.formula.startsWith('='))
      }
    }
  })

  it('beneficio por fila usa F{r}-G{r} (neto - coste)', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const s = hoja(spec, 'Canales venta')
    s.rows.forEach((row, i) => {
      assert.equal(row.beneficio.formula, `F${i + 2}-G${i + 2}`)
    })
  })
})
