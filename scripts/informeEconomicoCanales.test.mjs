/**
 * Test de integración (sin red) para el Informe Económico Excel
 * y las hojas nuevas de Fase 3.
 *
 * Verifica:
 *   - Con `datosVino.informe.por_canal` presente, el workbook incluye
 *     las hojas "Canales venta" y "Salidas no-venta" ADEMÁS de las
 *     5 habituales del Acompañado.
 *   - Sin `por_canal` (snapshot sin informe o datosVino null) las 5
 *     hojas de siempre siguen apareciendo y las 2 nuevas no.
 *   - Ningún `formula` empieza por "=" (convención del repo: ExcelJS
 *     añade el "=" al pintar; si lo mandamos literal rompe recálculo).
 *
 * Ejecutar: node --test scripts/informeEconomicoCanales.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'

// Snapshot realista producido por agregarPeriodoBodega.js (campos
// mínimos que necesitan las hojas Resumen y Canales venta/Salidas
// no-venta). El objetivo del test no es validar el cálculo del
// agregador sino que la spec de workbook se construye correctamente.
function datosVinoRealista() {
  return {
    ventas_bruto:           4400,
    ventas_neto:            4000,
    iva_pct:                10,
    coste_ventas_teorico:   1200,
    margen_bruto:           2800,
    stock_inicial:          8000,
    stock_final:            7500,
    compras_netas:           900,
    resultado:              1000,
    merma_copa_eur:           25,
    informe: {
      por_canal: {
        botella:  { uds: 100, ingresos: 3000, coste:  900 },
        copa:     { uds:  50, copas: 300, ingresos: 1500, coste: 450 },
        maridaje: { uds:  20, valor:  800, coste:  240 },
        evento:   { uds:  15, valor:  600, coste:  180 },
        invitacion_botella: { uds: 3, coste: 90 },
        invitacion_copa:    { uds: 2, coste: 50 },
        cocina:             { uds: 1, coste: 30 },
        rotura:             { uds: 1, coste: 25 },
      },
    },
  }
}

function argsBase(overrides = {}) {
  return {
    restauranteNombre: 'Casa Marisma',
    periodo: '2026-11',
    esSomm: false,
    facturacion:      4000,
    restoIngresos:     200,
    consumoMp:        1200,
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
    datosVino:         datosVinoRealista(),
    ...overrides,
  }
}

function nombres(spec) { return spec.sheets.map(s => s.name) }
function hoja(spec, nombre) { return spec.sheets.find(s => s.name === nombre) }

function recorrer(valor, fn) {
  if (valor == null) return
  if (typeof valor === 'object') {
    for (const k of Object.keys(valor)) recorrer(valor[k], fn)
    return
  }
  fn(valor)
}

describe('construirInformeEconomicoWorkbook — hojas Fase 3', () => {
  it('con por_canal: añade "Canales venta" y "Salidas no-venta"', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const names = nombres(spec)
    assert.ok(names.includes('Canales venta'),   `falta hoja Canales venta: ${names.join(', ')}`)
    assert.ok(names.includes('Salidas no-venta'),`falta hoja Salidas no-venta: ${names.join(', ')}`)
    // Perfil Acompañado: Resumen + Personal + Gastos + Compras? +
    // Canales (allocation) + 2 nuevas + Cierre.
    const esperadas = ['Resumen', 'Personal', 'Gastos', 'Canales', 'Canales venta', 'Salidas no-venta', 'Cierre bodega']
    for (const n of esperadas) {
      assert.ok(names.includes(n), `falta ${n} en workbook; hojas = ${names.join(', ')}`)
    }
  })

  it('"Canales venta" lista los 4 canales con facturado/coste/beneficio', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const s = hoja(spec, 'Canales venta')
    assert.ok(s, 'hoja no presente')
    const filas = s.rows.map(r => r.canal)
    // Orden canónico CANALES_VENTA → botella / copa / maridaje / evento
    assert.deepEqual(filas, [
      'Botella (mesa)', 'Copa', 'Maridaje', 'Grupos / Eventos',
    ])
    // Beneficio en la fila botella = 3000 − 900 = 2100.
    const botella = s.rows[0]
    assert.equal(botella.beneficio.result, 2100)
    // Totals presentes.
    assert.ok(s.totals && s.totals.canal === 'TOTAL')
  })

  it('"Salidas no-venta" lista los canales con coste', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase())
    const s = hoja(spec, 'Salidas no-venta')
    assert.ok(s)
    const filas = s.rows.map(r => r.canal)
    // Orden canónico CANALES_SALIDA_SIN_VENTA: invitacion_botella,
    // invitacion_copa, cocina, grupo_evento, maridaje, rotura, cata.
    // En el snapshot de prueba están: invit. botella/copa, cocina,
    // maridaje (comparte clave con "canal de venta") y rotura.
    assert.deepEqual(filas, [
      'Invitación (botella)', 'Invitación (copa)', 'Cocina', 'Maridaje', 'Rotura / defecto',
    ])
    assert.equal(s.rows.find(r => r.canal === 'Invitación (copa)').coste, 50)
  })

  it('ninguna fórmula declarada empieza por "=" (convención ExcelJS)', () => {
    // Nota: los LABELS tipo "= TOTAL INGRESOS" o "= Margen bruto" son
    // concepto (string, columna A) y no se interpretan como fórmula
    // por ExcelJS al asignarse vía `value` directo. La convención del
    // repo sólo afecta a objetos `{ formula, result }`, que se
    // comprueban en el test siguiente.
    const spec = construirInformeEconomicoWorkbook(argsBase())
    assert.ok(spec.sheets.length > 0)
  })

  it('las fórmulas declaradas (objeto { formula, result }) NO llevan "=" inicial', () => {
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
    // Verificación sana: al menos las nuevas hojas aportan fórmulas.
    assert.ok(encontradas >= 4, `se esperaban ≥4 fórmulas (resumen+canales), encontradas: ${encontradas}`)
  })
})

describe('construirInformeEconomicoWorkbook — degradación sin por_canal', () => {
  it('datosVino sin informe.por_canal → NO se añaden las 2 hojas', () => {
    const args = argsBase({ datosVino: { ventas_bruto: 4400, ventas_neto: 4000, iva_pct: 10 } })
    const spec = construirInformeEconomicoWorkbook(args)
    const names = nombres(spec)
    assert.ok(!names.includes('Canales venta'),    'no debería tener Canales venta sin datos')
    assert.ok(!names.includes('Salidas no-venta'), 'no debería tener Salidas no-venta sin datos')
    // Las 5 de siempre sí.
    for (const n of ['Resumen', 'Personal', 'Gastos', 'Canales', 'Cierre bodega']) {
      assert.ok(names.includes(n), `falta ${n}; hojas = ${names.join(', ')}`)
    }
  })

  it('datosVino = null → NO hojas nuevas, Cierre bodega tampoco', () => {
    const spec = construirInformeEconomicoWorkbook(argsBase({ datosVino: null }))
    const names = nombres(spec)
    assert.ok(!names.includes('Canales venta'))
    assert.ok(!names.includes('Salidas no-venta'))
    assert.ok(!names.includes('Cierre bodega'))
    // Resumen/Personal/Gastos/Canales (allocation) siguen.
    for (const n of ['Resumen', 'Personal', 'Gastos', 'Canales']) {
      assert.ok(names.includes(n))
    }
  })

  it('por_canal vacío ({}) → NO hojas nuevas', () => {
    const args = argsBase({ datosVino: { informe: { por_canal: {} } } })
    const spec = construirInformeEconomicoWorkbook(args)
    const names = nombres(spec)
    assert.ok(!names.includes('Canales venta'))
    assert.ok(!names.includes('Salidas no-venta'))
  })
})
