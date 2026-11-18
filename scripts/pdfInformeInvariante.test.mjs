/**
 * Fase B — invarianza de cifras y rótulos del PDF del informe.
 *
 * Genera el PDF con jsPDF usando los helpers de pdfEstilos.js y una
 * fixture realista. Luego extrae el texto por el método de parseo
 * simple (buscar operadores Tj / TJ en los streams del PDF) y
 * verifica que:
 *   1. Están TODAS las cifras clave esperadas (ventas netas,
 *      consumo MP, margen bruto, personal, gastos, alquileres,
 *      bancarios, resultado, break-even).
 *   2. Están TODOS los rótulos de datos esperados.
 *   3. Aparece "Pagina X de N" (pie de marca).
 *   4. Aparece la cabecera "Carta Viva", "Casa Marisma",
 *      "Noviembre de 2026".
 *   5. El tamaño del PDF es razonable (< 300 KB con logo embebido).
 *   6. El PDF sigue teniendo UNA página con la fixture actual.
 *
 * Sin dependencias nuevas: usamos jsPDF directo (ya en el repo) y
 * reconstruimos el pipeline manualmente. La extracción de texto
 * cruda es basta pero cubre la verificación de contenido.
 *
 * Ejecutar: node --test scripts/pdfInformeInvariante.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import zlib from 'node:zlib'
import {
  PDF_COLORS,
  cargarLogoPdf,
  formatPeriodoPdfEs,
  pintarCabecera,
  pintarPiesEnTodas,
} from '../app/lib/pdfEstilos.js'

// ── Extracción de texto muy simple de un PDF jsPDF ────────────────────
//
// jsPDF comprime los streams con FlateDecode. Los tokens de texto van
// como `(string) Tj` o `[...] TJ` tras un operador Tf / Td. Para esta
// verificación de "contiene X", es suficiente con:
//   1. Descomprimir cada stream FlateDecode.
//   2. Concatenar las cadenas entre paréntesis balanceados ().

function extraerTextoDePdf(bufferLike) {
  const buf = Buffer.isBuffer(bufferLike) ? bufferLike : Buffer.from(bufferLike)
  const src = buf.toString('binary')
  const partes = []
  // Buscar streams: "stream\r\n<data>\r\nendstream" o similar.
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let m
  while ((m = re.exec(src)) !== null) {
    const raw = Buffer.from(m[1], 'binary')
    let txt = ''
    try {
      txt = zlib.inflateSync(raw).toString('latin1')
    } catch {
      txt = raw.toString('latin1')
    }
    // Capturar cadenas entre paréntesis dentro de operadores Tj / TJ.
    // jsPDF escapa paréntesis internos con \.
    const reTxt = /\((?:[^()\\]|\\.)*\)/g
    let t
    while ((t = reTxt.exec(txt)) !== null) {
      // Quitar paréntesis y desescapar.
      partes.push(
        t[0].slice(1, -1).replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'),
      )
    }
  }
  return partes.join(' ')
}

// ── Generador del PDF con la misma secuencia del route ───────────────

function ascii(txt) {
  if (txt == null) return ''
  return String(txt)
    .replace(/[−‐‑–—]/g, '-')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[    ]/g, ' ')
}
function formatEur(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0,00 €'
  const abs = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true,
  }).format(Math.abs(v))
  return ascii((v < 0 ? '-' : '') + abs) + ' €'
}

function generarPdfFixture() {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const margin = 18
  const logo = cargarLogoPdf()
  pintarCabecera(doc, {
    W, margin,
    restauranteNombre: 'Casa Marisma',
    periodoEs: formatPeriodoPdfEs('2026-11'),
    subtitulo: 'Informe de Explotacion Mensual',
    logo,
  })

  // Datos de la fixture (coherentes con /api/somm/informe-mensual).
  const fixture = {
    ventasNetas: 4768.18, restoIngresos: 200, totalIngresos: 4968.18,
    consumoMp: 1560, margenBruto: 3408.18,
    personal: 800, gastos: 300, alquiler: 200, bancarios: 80,
    resultado: 2028.18, breakEven: 2500,
  }

  let y = 38
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.setTextColor(...PDF_COLORS.wine)
  doc.text(ascii('CUENTA DE EXPLOTACION'), margin, y)
  y += 10
  const filas = [
    ['Ventas netas',               formatEur(fixture.ventasNetas)],
    ['+ Resto de ingresos de explotacion', formatEur(fixture.restoIngresos)],
    ['= Total ingresos',           formatEur(fixture.totalIngresos)],
    ['- Consumo Materia Prima',    formatEur(fixture.consumoMp)],
    ['= Margen Bruto',             formatEur(fixture.margenBruto)],
    ['- Personal',                 formatEur(fixture.personal)],
    ['- Gastos Operacionales',     formatEur(fixture.gastos)],
    ['- Alquileres',               formatEur(fixture.alquiler)],
    ['- Gastos Bancarios',         formatEur(fixture.bancarios)],
    ['= Margen de Explotacion',    formatEur(fixture.resultado)],
    ['Break-Even del mes',         formatEur(fixture.breakEven)],
  ]
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  doc.setTextColor(...PDF_COLORS.textDark)
  for (const [label, value] of filas) {
    doc.text(ascii(label), margin, y)
    doc.text(value, W - margin, y, { align: 'right' })
    y += 7
  }

  pintarPiesEnTodas(doc, { W })
  return Buffer.from(doc.output('arraybuffer'))
}

describe('PDF informe — contenido invariable', () => {
  const buf = generarPdfFixture()
  const texto = extraerTextoDePdf(buf)

  it('cabecera: Carta Viva + restaurante + mes en español', () => {
    assert.match(texto, /Carta Viva/)
    assert.match(texto, /Casa Marisma/)
    assert.match(texto, /Noviembre de 2026/)
  })

  it('contiene TODAS las cifras clave en formato es-ES', () => {
    // Cifras que deben aparecer tal cual (comparados contra la
    // fixture; sin formato ambiguo). Esperamos "1.234,56 €".
    const esperadas = [
      '4.768,18',     // ventas netas
      '200,00',       // resto ingresos
      '4.968,18',     // total ingresos
      '1.560,00',     // consumo MP
      '3.408,18',     // margen bruto
      '800,00',       // personal
      '300,00',       // gastos operacionales
      '200,00',       // alquileres
      '80,00',        // bancarios
      '2.028,18',     // resultado
      '2.500,00',     // break-even
    ]
    for (const num of esperadas) {
      assert.ok(texto.includes(num), `falta "${num}" en el texto extraído`)
    }
  })

  it('contiene todas las etiquetas de datos', () => {
    const esperadas = [
      'Ventas netas',
      '+ Resto de ingresos',
      '= Total ingresos',
      '- Consumo Materia Prima',
      '= Margen Bruto',
      '- Personal',
      '- Gastos Operacionales',
      '- Alquileres',
      '- Gastos Bancarios',
      '= Margen de Explotacion',
      'Break-Even del mes',
    ]
    for (const label of esperadas) {
      assert.ok(texto.includes(label), `falta etiqueta "${label}"`)
    }
  })

  it('pie con "Pagina 1 de 1"', () => {
    assert.match(texto, /Pagina 1 de 1/)
  })

  it('CUENTA DE EXPLOTACION en burdeos (título de sección)', () => {
    assert.ok(texto.includes('CUENTA DE EXPLOTACION'))
  })

  it('tamaño razonable del PDF (< 300 KB con logo embebido)', () => {
    assert.ok(buf.byteLength > 1000,  'PDF muy pequeño (¿vacío?)')
    assert.ok(buf.byteLength < 300_000, `PDF ${buf.byteLength} B > 300 KB`)
  })

  it('una sola página con la fixture actual', () => {
    // El contador "Pagina X de N" extraído debe tener N=1 (una página).
    assert.match(texto, /Pagina 1 de 1/)
    assert.doesNotMatch(texto, /Pagina 2 de/)
  })
})

describe('PDF degradación — sin logo', () => {
  it('con cargarLogoPdf devolviendo null, el PDF se genera igual', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    pintarCabecera(doc, {
      W: 210, margin: 18,
      restauranteNombre: 'Casa Marisma',
      periodoEs: 'Noviembre de 2026',
      logo: null,   // simula fallo de carga
    })
    pintarPiesEnTodas(doc, { W: 210 })
    const out = Buffer.from(doc.output('arraybuffer'))
    const txt = extraerTextoDePdf(out)
    assert.match(txt, /Carta Viva/)
    assert.match(txt, /Casa Marisma/)
    assert.match(txt, /Pagina 1 de 1/)
    // Sin logo embebido, el PDF debe ser más pequeño que con logo.
    assert.ok(out.byteLength < 30_000, `PDF sin logo: ${out.byteLength} B`)
  })
})
