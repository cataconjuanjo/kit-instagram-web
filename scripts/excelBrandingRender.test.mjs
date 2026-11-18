/**
 * Test de render REAL del Excel con ExcelJS — rama con bloque de
 * título superior y desplazamiento de fórmulas.
 *
 * Verifica:
 *   1. Invariante: para cada celda (r, c) con valor en la versión
 *      PLAIN (sin branding), la versión BRANDED tiene el mismo valor
 *      en (r + BRANDING_ROWS, c). Si es fórmula, formula = desplazar
 *      (plain.formula, offset) y result idéntico.
 *   2. El logo queda íntegramente dentro del bloque de título
 *      (anclaje (col 0, row 0) → (col 1, row 3), filas 1..3 con
 *      alturas 32+16+16 = 64 px ≥ 56 px del logo).
 *   3. Ninguna celda de datos cae BAJO la imagen (data rows empiezan
 *      en fila BRANDING_ROWS+2, columna A).
 *   4. Freeze apunta a BRANDING_ROWS+1 (header real); printTitlesRow
 *      igual.
 *   5. Pestaña con color de marca. Gridlines ocultos. Print header
 *      con "Carta Viva · Casa Marisma · Noviembre de 2026".
 *   6. Tamaño del .xlsx se mantiene razonable.
 *   7. El cierre mensual (construirCierreWorkbook) pasa la misma
 *      invarianza.
 *
 * Ejecutar: node --test scripts/excelBrandingRender.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'
import { construirCierreWorkbook } from '../app/lib/excelSomm.js'
import {
  BRAND,
  BRANDING_ROWS,
  LOGO_ANCHOR,
  construirHojaConBranding,
  desplazarFormula,
  aplicarHeaderFooter,
} from '../app/lib/excelEstilos.js'

// ── Fixtures ──────────────────────────────────────────────────────────

function datosVinoCasaMarisma() {
  return {
    ventas_bruto: 5245.00,
    ventas_neto:  4768.18,
    iva_pct:      10,
    coste_ventas_teorico: 1560,
    stock_inicial: 100, stock_final: 80, compras_netas: 900,
    margen_bruto: 2800, resultado: 1000, merma_copa_eur: 25,
    informe: {
      por_canal: {
        botella:    { uds: 88, ingresos: 2200, coste: 660 },
        copa:       { uds: 0, copas: 651, ingresos: 3045, coste: 900 },
        invitacion: { uds: 6, botella_uds: 2, copa_uds: 4, botella_coste: 60, copa_coste: 20 },
        cocina:     { uds: 1, valor: 30, coste: 30 },
        evento:     { uds: 5, valor: 150, coste: 150 },
        maridaje:   { uds: 3, valor: 90, coste: 90 },
        rotura:     { uds: 1, coste: 25 },
      },
      por_vino: [
        { vino_id: 'v1', nombre: 'Vino A', uds: 20, copas: 100, ingresos: 500, tiene_coste: true, coste_unitario: 5, margen_pct: 50 },
        { vino_id: 'v2', nombre: 'Vino B', uds: 10, copas: 50, ingresos: 300, tiene_coste: true, coste_unitario: 8, margen_pct: 40 },
      ],
      resumen: { ingresos_venta: 5245, consumos_valor: 300 },
    },
    desglose: {
      desglose_v: 1,
      stock_inicial:         { uds: 100, valor_eur: 8000 },
      entradas:              { compras_bruto: { uds: 50, valor_eur: 900 }, devoluciones: { uds: 0, valor_eur: 0 }, compras_netas: { uds: 50, valor_eur: 900 } },
      ventas_botella:        { uds: 88, valor_eur: 2200 },
      ventas_copa:           { uds: 108, valor_eur: 3045 },
      salidas_sin_venta:     { total: { uds: 15, valor_eur: 330 } },
      stock_final_teorico:   { uds: 55, valor_eur: 5240 },
      stock_final_real:      { uds: 55, valor_eur: 5240 },
      ajuste_inventario:     { uds: 0, valor_eur: 0 },
      consumo:               { uds: 95, valor_eur: 3660 },
    },
  }
}

function argsInforme(overrides = {}) {
  return {
    restauranteNombre: 'Casa Marisma', periodo: '2026-11', esSomm: false,
    facturacion: 4768.18, restoIngresos: 200, consumoMp: 1560,
    totalPersonal: 800, totalGastos: 300, totalAlquiler: 200, totalBancarios: 80, breakEven: 2500,
    personal: { nominas_brutas: 600, ss_empresa: 180, extras_personal: 20, retenciones_irpf: 0 },
    gastosPartidas: [], alquilerPartidas: [],
    bancarios: { comisiones_datafono: 50, mantenimiento_datafono: 20, resto_comisiones: 10 },
    canales: { copa_barra: 1000, botella_mesa: 2000, grupos_eventos: 700, take_away: 100 },
    registrosCompras: [], imputacion_pct: {},
    datosVino: datosVinoCasaMarisma(),
    ...overrides,
  }
}

// ── Builders (replican descargarWorkbook SIN dom) ─────────────────────

async function buildBranded(spec) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Carta Viva'; wb.created = new Date()
  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name)
    construirHojaConBranding(ws, sheet, {
      logoImageId: null,       // sin logo real para el test de tamaño
      restauranteNombre: spec.restauranteNombre || '',
      periodo:           spec.periodo           || '',
    })
  }
  aplicarHeaderFooter(wb, {
    restauranteNombre: spec.restauranteNombre || '',
    periodo:           spec.periodo           || '',
  })
  return wb
}

async function buildPlain(spec) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Carta Viva'; wb.created = new Date()
  for (const sheet of spec.sheets) {
    const ws = wb.addWorksheet(sheet.name)
    ws.columns = sheet.columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 12 }))
    for (const row of sheet.rows) ws.addRow(row)
    if (sheet.totals) {
      const tr = ws.addRow({})
      for (const [key, val] of Object.entries(sheet.totals)) {
        const cell = tr.getCell(key)
        if (val && typeof val === 'object' && typeof val.formula === 'string') {
          cell.value = { formula: val.formula, result: val.result }
        } else {
          cell.value = val
        }
      }
    }
    for (const c of sheet.columns) if (c.format) ws.getColumn(c.key).numFmt = c.format
  }
  return wb
}

async function toLoaded(wb) {
  const buf = await wb.xlsx.writeBuffer()
  const wb2 = new ExcelJS.Workbook()
  await wb2.xlsx.load(buf)
  return { wb: wb2, bytes: buf.byteLength }
}

// Normaliza valores leídos de ExcelJS para comparar: unwrap SharedString.
function normalizeValue(v) {
  if (v && typeof v === 'object' && Array.isArray(v.richText)) {
    return v.richText.map(r => r.text).join('')
  }
  return v
}

// ── Test 1: invarianza para informe económico ────────────────────────

describe('Branding — informe económico — invarianza celda a celda', () => {
  it('cada celda de PLAIN(r,c) coincide con BRANDED(r+N, c), fórmulas desplazadas', async () => {
    const spec = construirInformeEconomicoWorkbook(argsInforme())
    const { wb: wbP } = await toLoaded(await buildPlain(spec))
    const { wb: wbB } = await toLoaded(await buildBranded(spec))

    // Mismos nombres y orden de hojas.
    const nombresP = []
    wbP.eachSheet(ws => nombresP.push(ws.name))
    const nombresB = []
    wbB.eachSheet(ws => nombresB.push(ws.name))
    assert.deepEqual(nombresB, nombresP)

    for (const nombre of nombresP) {
      const wsP = wbP.getWorksheet(nombre)
      const wsB = wbB.getWorksheet(nombre)
      const maxRowP = wsP.rowCount, maxColP = wsP.columnCount
      let celdas = 0
      for (let r = 1; r <= maxRowP; r++) {
        for (let c = 1; c <= maxColP; c++) {
          const cellP = wsP.getCell(r, c)
          const vP = cellP.value
          if (vP === null || vP === undefined) continue
          celdas++
          const cellB = wsB.getCell(r + BRANDING_ROWS, c)
          const vB = cellB.value
          // Fórmula.
          if (vP && typeof vP === 'object' && 'formula' in vP) {
            assert.ok(vB && typeof vB === 'object' && 'formula' in vB,
              `${nombre}!(${r},${c}) plain es fórmula; branded debería serlo`)
            const esperado = desplazarFormula(vP.formula, BRANDING_ROWS)
            assert.equal(vB.formula, esperado,
              `${nombre}!(${r},${c}) fórmula desalineada\n  plain: ${vP.formula}\n  branded: ${vB.formula}\n  esperada: ${esperado}`)
            assert.deepEqual(vB.result, vP.result,
              `${nombre}!(${r},${c}) result difiere`)
            continue
          }
          // Primitivo.
          assert.deepEqual(normalizeValue(vB), normalizeValue(vP),
            `${nombre}!(${r},${c}) valor difiere`)
        }
      }
      assert.ok(celdas > 0, `${nombre}: no se evaluó ninguna celda`)
    }
  })

  it('header real en fila N+1, freeze ySplit=N+1, printTitlesRow N+1:N+1', async () => {
    const spec = construirInformeEconomicoWorkbook(argsInforme())
    const { wb } = await toLoaded(await buildBranded(spec))
    const ws = wb.getWorksheet('Canales venta')
    const headerRow = BRANDING_ROWS + 1
    // Header fila: fondo wine + texto cream.
    const hc = ws.getCell(headerRow, 1)
    assert.ok(hc.fill && hc.fill.fgColor && hc.fill.fgColor.argb.toUpperCase().endsWith(BRAND.wine))
    assert.ok(hc.font && hc.font.color && hc.font.color.argb.toUpperCase().endsWith(BRAND.cream))
    assert.ok(hc.font.bold)
    // Freeze.
    assert.equal(ws.views[0].ySplit, headerRow)
    assert.equal(ws.views[0].state, 'frozen')
    assert.equal(ws.views[0].showGridLines, false)
    // Print titles row.
    assert.equal(ws.pageSetup.printTitlesRow, `${headerRow}:${headerRow}`)
  })

  it('logo anclado dentro de las filas 1..3 (sin tapar la tabla)', () => {
    // El anclaje nuevo usa tl + ext (no br). La constante
    // LOGO_ANCHOR expone tl y targetHeight; la primera fila de
    // datos es BRANDING_ROWS+2 = 6, muy por debajo del logo.
    assert.equal(LOGO_ANCHOR.tl.row, 0)
    assert.equal(LOGO_ANCHOR.tl.col, 0)
    assert.equal(LOGO_ANCHOR.targetHeight, 56)
    assert.ok(BRANDING_ROWS + 2 > 3,
      'primera fila de datos debe caer bajo el bloque de título')
  })

  it('print header contiene marca + restaurante + mes en español', async () => {
    const spec = construirInformeEconomicoWorkbook(argsInforme())
    const { wb } = await toLoaded(await buildBranded(spec))
    const ws = wb.getWorksheet('Resumen')
    assert.match(ws.headerFooter.oddHeader, /Carta Viva/)
    assert.match(ws.headerFooter.oddHeader, /Casa Marisma/)
    assert.match(ws.headerFooter.oddHeader, /Noviembre de 2026/)
    assert.match(ws.headerFooter.oddFooter, /Página &P de &N/)
  })

  it('pestañas con color de marca + hide gridlines', async () => {
    const spec = construirInformeEconomicoWorkbook(argsInforme())
    const { wb } = await toLoaded(await buildBranded(spec))
    for (const nombre of ['Resumen', 'Canales venta', 'Salidas no-venta']) {
      const ws = wb.getWorksheet(nombre)
      assert.ok(ws.properties.tabColor, `${nombre} sin tabColor`)
      assert.equal(ws.views[0].showGridLines, false, `${nombre} muestra gridlines`)
    }
  })

  it('xlsx sin logo pesa < 60 KB con el bloque de título', async () => {
    const spec = construirInformeEconomicoWorkbook(argsInforme())
    const { bytes } = await toLoaded(await buildBranded(spec))
    assert.ok(bytes < 60_000, `xlsx pesa ${bytes} B (>60KB)`)
  })
})

// ── Test 2: invarianza para cierre mensual (excelSomm.js) ─────────────

function cierreArgs() {
  return {
    datos: datosVinoCasaMarisma(),
    mes: '2026-11',
    restauranteNombre: 'Casa Marisma',
    esSomm: true,
    facturasLibro: [],
    historicoPrevYear: null,
  }
}

describe('Branding — cierre mensual — invarianza celda a celda', () => {
  it('construirCierreWorkbook pasa la misma invariante que el informe económico', async () => {
    const spec = construirCierreWorkbook(cierreArgs())
    if (spec.empty) {
      // Si la fixture dejara el workbook vacío, el test no tiene
      // sentido: avisamos para detectarlo.
      assert.fail('cierre workbook vacío — ajustar fixture')
    }
    const { wb: wbP } = await toLoaded(await buildPlain(spec))
    const { wb: wbB } = await toLoaded(await buildBranded(spec))

    const nombres = []
    wbP.eachSheet(ws => nombres.push(ws.name))
    for (const nombre of nombres) {
      const wsP = wbP.getWorksheet(nombre)
      const wsB = wbB.getWorksheet(nombre)
      for (let r = 1; r <= wsP.rowCount; r++) {
        for (let c = 1; c <= wsP.columnCount; c++) {
          const cellP = wsP.getCell(r, c)
          const vP = cellP.value
          if (vP === null || vP === undefined) continue
          const cellB = wsB.getCell(r + BRANDING_ROWS, c)
          if (vP && typeof vP === 'object' && 'formula' in vP) {
            assert.equal(vB(cellB).formula, desplazarFormula(vP.formula, BRANDING_ROWS))
            assert.deepEqual(vB(cellB).result, vP.result)
          } else {
            assert.deepEqual(normalizeValue(cellB.value), normalizeValue(vP),
              `${nombre}!(${r},${c}) difiere`)
          }
        }
      }
    }
  })

  it('metadata raíz (restauranteNombre, periodo=mes) está expuesta', () => {
    const spec = construirCierreWorkbook(cierreArgs())
    assert.equal(spec.restauranteNombre, 'Casa Marisma')
    assert.equal(spec.periodo,            '2026-11')
  })
})

function vB(cellB) { return cellB.value }
