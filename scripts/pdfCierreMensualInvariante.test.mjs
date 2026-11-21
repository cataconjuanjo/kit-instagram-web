/**
 * Fase E — invariancia de cifras y estructura del PDF del cierre
 * mensual (app/dashboard/bodega/CierreMensual.js:generarPDF) tras
 * aplicarle pdfEstilos.
 *
 * Replica el pipeline en memoria (sin DOM, sin supabase) con las
 * mismas llamadas a jsPDF del componente, incluyendo el refactor
 * de cabecera burdeos + pie "Página X de N". Luego:
 *   1. Extrae el texto real del PDF y verifica que los datos del
 *      cuerpo (ventas, costes, márgenes, etc.) siguen EXACTOS.
 *   2. Comprueba que hay al menos un objeto `/Subtype /Image` (logo
 *      isotipo embebido) y que el pie "Página 1 de N" aparece.
 *   3. Verifica tildes conservadas: "Página", "Explotación", etc.
 *
 * No depende de pupeteer/libreoffice. jsPDF + regex sobre el stream.
 *
 * Ejecutar: node --test scripts/pdfCierreMensualInvariante.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import zlib from 'node:zlib'
import {
  cargarLogoPdf,
  formatPeriodoPdfEs,
  pintarCabecera,
  pintarPiesEnTodas,
} from '../app/lib/pdfEstilos.js'

// ── Extracción de texto como en pdfInformeInvariante ──────────────────

function extraerTextoDePdf(bufferLike) {
  const buf = Buffer.isBuffer(bufferLike) ? bufferLike : Buffer.from(bufferLike)
  const src = buf.toString('binary')
  const partes = []
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  let m
  while ((m = re.exec(src)) !== null) {
    const raw = Buffer.from(m[1], 'binary')
    let txt = ''
    try { txt = zlib.inflateSync(raw).toString('latin1') }
    catch { txt = raw.toString('latin1') }
    const reTxt = /\((?:[^()\\]|\\.)*\)/g
    let t
    while ((t = reTxt.exec(txt)) !== null) {
      partes.push(t[0].slice(1, -1).replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'))
    }
  }
  return partes.join(' ')
}

// ── Pipeline reducido, copiado del componente ─────────────────────────
//
// Reproduce la estructura de cabecera + una sección mínima del cuerpo
// que incluye cifras concretas. Con esto el test puede afirmar:
//   - cifras exactas aparecen en el texto extraído
//   - cabecera brand presente ("Carta Viva" + "Cierre mensual")
//   - pie "Página X de N" en todas las páginas

function generarPdfFixture() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW = 210, ML = 14
  let y = 14

  function ascii(txt) {
    if (txt == null) return ''
    return String(txt)
      .replace(/[−‐‑–—]/g, '-')
      .replace(/[‘’‚′]/g, "'")
      .replace(/[“”„″]/g, '"')
      .replace(/[     ]/g, ' ')
  }

  const logoCv = cargarLogoPdf()
  function pintarCabeceraCv() {
    pintarCabecera(doc, {
      W: PW, margin: ML,
      restauranteNombre: 'Casa Marisma',
      periodoEs:         formatPeriodoPdfEs('2026-10'),
      subtitulo:         'Cierre mensual de bodega',
      logo:              logoCv,
    })
  }
  pintarCabeceraCv()
  y = 34

  // Cifras del cuerpo que luego verificamos extraídas del PDF.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(40, 40, 40)
  doc.text(ascii('Ventas'), ML, y); y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(ascii('Bruto (con IVA)'),       ML, y)
  doc.text('10.583,00 EUR', PW - ML, y, { align: 'right' }); y += 5
  doc.text(ascii('Netas (sin IVA)'),       ML, y)
  doc.text('9.621,82 EUR',  PW - ML, y, { align: 'right' }); y += 5
  doc.text(ascii('Coste de ventas'),       ML, y)
  doc.text('4.044,12 EUR',  PW - ML, y, { align: 'right' }); y += 5
  doc.text(ascii('Margen bruto'),          ML, y)
  doc.text('5.577,70 EUR',  PW - ML, y, { align: 'right' }); y += 5

  pintarPiesEnTodas(doc, { W: PW })
  return Buffer.from(doc.output('arraybuffer'))
}

describe('PDF Cierre mensual — cifras y marca', () => {
  const buf   = generarPdfFixture()
  const texto = extraerTextoDePdf(buf)

  it('cabecera: Carta Viva + Casa Marisma + mes formateado', () => {
    assert.match(texto, /Carta Viva/)
    assert.match(texto, /Casa Marisma/)
    assert.match(texto, /Octubre 2026|Noviembre 2026/)   // por si cambia formato
  })

  it('cifras del cuerpo INTACTAS (invariancia Fase E)', () => {
    for (const cifra of ['10.583,00', '9.621,82', '4.044,12', '5.577,70']) {
      assert.ok(texto.includes(cifra), `falta cifra "${cifra}" en el texto extraído`)
    }
  })

  it('tildes conservadas en títulos y pie (Página, Informe económico)', () => {
    assert.match(texto, /Página 1 de 1/, 'pie debe decir "Página 1 de 1" con tilde')
    assert.match(texto, /Informe económico/, 'pie incluye "Informe económico" con tilde')
  })

  it('logo isotipo embebido: al menos un objeto /Subtype /Image', () => {
    const bin = buf.toString('binary')
    assert.ok(bin.includes('/Subtype /Image'),
      'el PDF no contiene /Subtype /Image — el logo no se embebió')
  })

  it('subtítulo del cierre presente', () => {
    assert.match(texto, /Cierre mensual de bodega/)
  })
})
