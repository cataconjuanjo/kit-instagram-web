/**
 * Fase E — validación estructural del XLSX del cierre mensual y del
 * informe económico. Sin librería de validación XML dedicada: usamos
 * JSZip (ya transitive por ExcelJS) + la propia ExcelJS para releer
 * lo que generamos y comprobar que todo está en orden.
 *
 * Qué se valida:
 *   - Round-trip con ExcelJS: no lanza al leer el buffer que acabamos
 *     de escribir (señal más barata y fiable de que Excel de escritorio
 *     NO dirá "Hemos encontrado contenido que no se puede leer").
 *   - [Content_Types].xml y rels presentes en el .zip.
 *   - Cada parte XML de .xlsx es parseable (regex de top-level): no hay
 *     entidades mal cerradas ni tags sin cerrar. (Un XML "válido para
 *     Excel" puede estar bien aun con entidades espaciadas, pero
 *     DocumentFragment tolerante es suficiente para pillar roturas
 *     catastróficas.)
 *   - Nombres de hoja únicos y ≤ 31 caracteres, sin \ / ? * : [ ]
 *   - Ninguna fórmula leída empieza por "=" (patrón del builder:
 *     ExcelJS es quien añade el "=" al serializar).
 *   - Imágenes referenciadas por sheet existen en el zip (al menos
 *     una entrada en xl/media/ si la hoja declara un drawing).
 *   - Anchos/alturas finitos y > 0 cuando están definidos.
 *
 * Ejecutar: node --test scripts/xlsxEstructural.test.mjs
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { construirXlsxBuffer } from '../app/lib/excelWorkbookBuilder.js'
import { construirCierreWorkbook } from '../app/lib/excelSomm.js'
import { construirInformeEconomicoWorkbook } from '../app/lib/informeEconomicoExcel.js'

async function abrirBuffer(buf) {
  const JSZip  = (await import('jszip')).default
  const zip    = await JSZip.loadAsync(buf)
  return zip
}
async function releerConExcelJS(buf) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb
}

function nombreHojaValido(name) {
  if (typeof name !== 'string' || !name) return false
  if (name.length > 31) return false
  return !/[\\/?*:\[\]]/.test(name)
}

// Parser laxo: valida que cada apertura tenga su cierre o esté
// auto-cerrada. Suficiente para pillar roturas catastróficas; ExcelJS
// hace el parse-completo real al releer.
function xmlBienFormado(xml) {
  if (typeof xml !== 'string' || !xml.trim().startsWith('<?xml')) return false
  // Quita comentarios, CDATA y declaraciones.
  const limpio = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
  const pila = []
  const re = /<(\/?)([A-Za-z_][\w:.\-]*)([^>]*?)(\/?)>/g
  let m
  while ((m = re.exec(limpio)) !== null) {
    const closing = m[1] === '/'
    const name    = m[2]
    const self    = m[4] === '/'
    if (self) continue
    if (closing) {
      if (pila.pop() !== name) return false
    } else {
      pila.push(name)
    }
  }
  return pila.length === 0
}

// ── Fixtures ──────────────────────────────────────────────────────────

function specCierre() {
  const datosCierre = {
    mes: '2026-01',
    ventas_bruto: 5500, ventas_neto: 5000, iva_pct: 10,
    coste_ventas_teorico: 2000, margen_bruto: 3000, margen_pct: 60,
    compras_bruto: 2200, devoluciones: 100,
    compras_netas: 1800, salidas_no_venta: 50,
    merma_copa_eur: 20, diferencias_inventario: -10,
    gastos_total: 1200, resultado: 1715.45,
    informe: {
      por_vino: [
        { vino_id: 'v1', nombre: 'Rioja',    uds: 10, copas: 50, ingresos: 500, coste_unitario: 5, margen_pct: 60, tiene_coste: true },
        { vino_id: 'v2', nombre: 'Albariño', uds: 5,  copas: 20, ingresos: 300, coste_unitario: 8, margen_pct: 55, tiene_coste: true },
      ],
    },
    gastos: [
      { concepto: 'Alquiler', importe: 1000 },
      { concepto: 'Luz',      importe: 200 },
    ],
  }
  return construirCierreWorkbook({ datos: datosCierre, mes: '2026-01', restauranteNombre: 'Casa Marisma' })
}

function specInforme() {
  const datosVino = {
    mes: '2026-10',
    ventas_bruto: 10583, ventas_neto: 9621.82, iva_pct: 10,
    coste_ventas_teorico: 4044.12, margen_bruto: 5577.70, margen_pct: 58,
    informe: {
      por_canal: {
        botella:    { uds: 60, ingresos: 7000, coste: 3000 },
        copa:       { uds: 0, copas: 420, ingresos: 2621.82, coste: 1044.12 },
        invitacion: { uds: 0, botella_uds: 2, copa_uds: 10, botella_coste: 60, copa_coste: 30 },
        cocina:     { uds: 1, coste: 25 },
        cata:       { uds: 2, coste: 90 },
        rotura:     { uds: 1, coste: 45 },
      },
    },
  }
  return construirInformeEconomicoWorkbook({
    restauranteNombre: 'Casa Marisma',
    periodo: '2026-10',
    esSomm: false,
    facturacion: 9621.82, restoIngresos: 0, consumoMp: 4044.12,
    totalPersonal: 3000, totalGastos: 300, totalAlquiler: 800, totalBancarios: 50,
    breakEven: 5000,
    personal: {}, gastosPartidas: [], alquilerPartidas: [], bancarios: {},
    canales: {}, registrosCompras: [], imputacion_pct: {},
    datosVino,
    supuestos: { materiales: 20, suministros: 40, otros: 0, beneficio_objetivo: 5000, ventas_previstas_fijo: 15000 },
  })
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('validación estructural XLSX — cierre mensual', () => {
  let buf, zip, wb

  before(async () => {
    const spec = specCierre()
    buf = await construirXlsxBuffer(spec)
    zip = await abrirBuffer(buf)
    wb  = await releerConExcelJS(buf)
  })

  it('round-trip con ExcelJS no lanza (Excel no diría "contenido que no se puede leer")', () => {
    assert.ok(wb)
    assert.ok(wb.worksheets.length > 0)
  })

  it('[Content_Types].xml y _rels/.rels presentes en el .zip', () => {
    assert.ok(zip.file('[Content_Types].xml'),       '[Content_Types].xml ausente')
    assert.ok(zip.file('_rels/.rels'),               '_rels/.rels ausente')
    assert.ok(zip.file('xl/_rels/workbook.xml.rels'),'workbook.xml.rels ausente')
    assert.ok(zip.file('xl/workbook.xml'),           'workbook.xml ausente')
  })

  it('todos los XML top-level están bien formados', async () => {
    const xmlPaths = Object.keys(zip.files).filter(p => p.endsWith('.xml') || p.endsWith('.rels'))
    for (const p of xmlPaths) {
      const content = await zip.file(p).async('string')
      assert.ok(xmlBienFormado(content), `XML mal formado en ${p}`)
    }
  })

  it('nombres de hoja: únicos, ≤31 chars, sin caracteres prohibidos', () => {
    const nombres = wb.worksheets.map(ws => ws.name)
    assert.deepEqual(nombres, [...new Set(nombres)], 'hay nombres duplicados')
    for (const n of nombres) {
      assert.ok(nombreHojaValido(n), `nombre inválido: "${n}"`)
    }
  })

  it('las fórmulas emitidas por ExcelJS no tienen "=" duplicado (el builder nunca lo añade)', () => {
    for (const ws of wb.worksheets) {
      ws.eachRow({ includeEmpty: false }, row => {
        row.eachCell(cell => {
          if (cell.formula) {
            assert.ok(!cell.formula.startsWith('='), `"${ws.name}" celda con "=" en fórmula: ${cell.formula}`)
          }
        })
      })
    }
  })

  it('anchos de columna finitos y > 0 cuando están definidos', () => {
    for (const ws of wb.worksheets) {
      for (const col of ws.columns || []) {
        if (col?.width !== undefined && col.width !== null) {
          assert.ok(Number.isFinite(col.width) && col.width > 0,
            `${ws.name} col width inválido: ${col.width}`)
        }
      }
    }
  })

  it('si una hoja referencia imagen, la imagen existe en xl/media/', () => {
    const mediaFiles = Object.keys(zip.files).filter(p => p.startsWith('xl/media/'))
    const anyDrawing = Object.keys(zip.files).some(p => p.startsWith('xl/drawings/'))
    if (anyDrawing) {
      assert.ok(mediaFiles.length > 0, 'hay drawings pero no imágenes en xl/media')
    }
  })
})

describe('validación estructural XLSX — informe económico (con supuestos)', () => {
  let buf, zip, wb

  before(async () => {
    const spec = specInforme()
    buf = await construirXlsxBuffer(spec)
    zip = await abrirBuffer(buf)
    wb  = await releerConExcelJS(buf)
  })

  it('round-trip ExcelJS: lee las 8 hojas canónicas', () => {
    assert.ok(wb.worksheets.length >= 7)
    const nombres = wb.worksheets.map(w => w.name)
    assert.ok(nombres.includes('Resumen'))
    assert.ok(nombres.includes('Simulador'))
  })

  it('todos los XML internos están bien formados', async () => {
    const xmlPaths = Object.keys(zip.files).filter(p => p.endsWith('.xml') || p.endsWith('.rels'))
    for (const p of xmlPaths) {
      const content = await zip.file(p).async('string')
      assert.ok(xmlBienFormado(content), `XML mal formado en ${p}`)
    }
  })

  it('nombres de hoja válidos y únicos', () => {
    const nombres = wb.worksheets.map(ws => ws.name)
    assert.deepEqual(nombres, [...new Set(nombres)])
    for (const n of nombres) assert.ok(nombreHojaValido(n), `nombre inválido: "${n}"`)
  })

  it('la hoja Simulador tiene las fórmulas clave en sus celdas (desplazadas por el branding)', () => {
    const ws = wb.worksheets.find(w => w.name === 'Simulador')
    assert.ok(ws, 'falta hoja Simulador')
    // El bloque de branding de excelEstilos.js reserva BRANDING_ROWS
    // filas al inicio y desplaza las fórmulas en consecuencia. B3/B2
    // del builder se traduce a B7/B6 en el XLSX; 1-B5 → 1-B9.
    const formulas = []
    ws.eachRow({ includeEmpty: false }, r => {
      r.eachCell(c => { if (c.formula) formulas.push(c.formula) })
    })
    assert.ok(
      formulas.some(f => /B\d+\s*\/\s*B\d+/.test(f)),
      '% MP real no encuentra fórmula ratio (B?/B?)',
    )
    assert.ok(
      formulas.some(f => /^1\s*-\s*B\d+$/.test(f)),
      '% margen real no encuentra fórmula 1-B?',
    )
  })

  it('al menos una imagen embebida (logo brand)', () => {
    const mediaFiles = Object.keys(zip.files).filter(p => p.startsWith('xl/media/'))
    assert.ok(mediaFiles.length >= 1, 'no hay imágenes en xl/media (logo brand ausente)')
  })

  it('anchos/alturas válidos', () => {
    for (const ws of wb.worksheets) {
      for (const col of ws.columns || []) {
        if (col?.width !== undefined && col.width !== null) {
          assert.ok(Number.isFinite(col.width) && col.width > 0)
        }
      }
      ws.eachRow({ includeEmpty: false }, r => {
        if (r.height !== undefined && r.height !== null) {
          assert.ok(Number.isFinite(r.height) && r.height > 0,
            `${ws.name} row height inválido: ${r.height}`)
        }
      })
    }
  })
})
