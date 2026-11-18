/**
 * Fase B — tests del PDF de marca + helpers de pdfEstilos.
 *
 * NO carga la ruta de Next (requiere runtime server). Testea:
 *   1. hexToRgb convierte correctamente la paleta.
 *   2. PDF_COLORS reutiliza BRAND de excelEstilos.js (misma fuente).
 *   3. formatPeriodoPdfEs: 'YYYY-MM' → 'Mes de AAAA' en español.
 *   4. cargarLogoPdf lee el isotipo real del repo con proporción.
 *   5. pintarCabecera dibuja la banda burdeos + logo (si llega) con
 *      ratio preservado (±1 %). Usamos un jsPDF "espía" simulado que
 *      captura las llamadas addImage/rect/text para validar
 *      dimensiones.
 *   6. pintarPiesEnTodas asigna Página X de N correcto en 1 y en N.
 *   7. formatEurEs / formatPctEs: formato es-ES estable.
 *
 * Ejecutar: node --test scripts/pdfEstilos.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BRAND } from '../app/lib/excelEstilos.js'
import {
  PDF_COLORS,
  cargarLogoPdf,
  formatEurEs,
  formatPctEs,
  formatPeriodoPdfEs,
  hexToRgb,
  pintarCabecera,
  pintarPiesEnTodas,
} from '../app/lib/pdfEstilos.js'

describe('hexToRgb + PDF_COLORS', () => {
  it('hexToRgb convierte bien', () => {
    assert.deepEqual(hexToRgb('7B1E3B'), [123, 30, 59])
    assert.deepEqual(hexToRgb('#C9A24B'), [201, 162, 75])
    assert.deepEqual(hexToRgb('FBF7F0'), [251, 247, 240])
  })
  it('invalid → [0,0,0] (defensivo)', () => {
    assert.deepEqual(hexToRgb(''), [0, 0, 0])
    assert.deepEqual(hexToRgb('XX'), [0, 0, 0])
    assert.deepEqual(hexToRgb(null), [0, 0, 0])
  })
  it('PDF_COLORS deriva de BRAND (misma fuente)', () => {
    assert.deepEqual(PDF_COLORS.wine, hexToRgb(BRAND.wine))
    assert.deepEqual(PDF_COLORS.gold, hexToRgb(BRAND.gold))
    assert.deepEqual(PDF_COLORS.cream, hexToRgb(BRAND.cream))
    assert.deepEqual(PDF_COLORS.red, hexToRgb(BRAND.red))
    assert.deepEqual(PDF_COLORS.banda, hexToRgb(BRAND.banda))
  })
})

describe('formatPeriodoPdfEs', () => {
  it("'2026-11' → 'Noviembre de 2026'", () => {
    assert.equal(formatPeriodoPdfEs('2026-11'), 'Noviembre de 2026')
  })
  it("'2026-01' → 'Enero de 2026'", () => {
    assert.equal(formatPeriodoPdfEs('2026-01'), 'Enero de 2026')
  })
  it('inválido / vacío → "" o se devuelve tal cual', () => {
    assert.equal(formatPeriodoPdfEs(''), '')
    assert.equal(formatPeriodoPdfEs(null), '')
    assert.equal(formatPeriodoPdfEs('abc'), 'abc')
    assert.equal(formatPeriodoPdfEs('2026-13'), '2026-13')
  })
})

describe('cargarLogoPdf — lectura del isotipo real', () => {
  it('lee public/brand/carta-viva/isotipo.png y devuelve dims 512×512', () => {
    const logo = cargarLogoPdf()
    assert.ok(logo, 'logo no cargado')
    assert.ok(Buffer.isBuffer(logo.buffer) || logo.buffer instanceof Uint8Array)
    assert.equal(logo.width, 512)
    assert.equal(logo.height, 512)
  })
})

describe('formatEurEs / formatPctEs', () => {
  it('EUR es-ES con coma decimal y agrupación', () => {
    assert.equal(formatEurEs(1234.5), '1.234,50 €')
    assert.equal(formatEurEs(0), '0,00 €')
    assert.equal(formatEurEs(-250), '-250,00 €')
  })
  it('PCT es-ES con un decimal', () => {
    assert.equal(formatPctEs(32.5), '32,5 %')
    assert.equal(formatPctEs(-5.2), '-5,2 %')
    assert.equal(formatPctEs(null), '-')
    assert.equal(formatPctEs(NaN), '-')
  })
})

// ── Espía minimalista de jsPDF ─────────────────────────────────────────

function createJsPdfSpy(nPages = 1) {
  const calls = { rect: [], image: [], text: [], setFillColor: [], setPage: [], pages: nPages }
  let currentPage = 1
  return {
    calls,
    setFillColor(r, g, b) { calls.setFillColor.push([r, g, b]) },
    setDrawColor() {},
    setLineWidth() {},
    setTextColor() {},
    setFont() {},
    setFontSize() {},
    rect(x, y, w, h, style) { calls.rect.push({ x, y, w, h, style }) },
    text(txt, x, y, opts) { calls.text.push({ txt, x, y, opts }) },
    addImage(buffer, fmt, x, y, w, h) { calls.image.push({ buffer, fmt, x, y, w, h }) },
    getNumberOfPages() { return calls.pages },
    setPage(n)         { calls.setPage.push(n); currentPage = n },
    internal: {
      getCurrentPageInfo: () => ({ pageNumber: currentPage }),
      getNumberOfPages:   () => calls.pages,
    },
  }
}

describe('pintarCabecera — banda burdeos + logo con proporción', () => {
  it('pinta banda burdeos (0..28) + filete dorado + logo con ratio del PNG', () => {
    const doc = createJsPdfSpy()
    const logo = { buffer: Buffer.from([0x89, 0x50]), width: 512, height: 512 }
    pintarCabecera(doc, {
      W: 210, margin: 18,
      restauranteNombre: 'Casa Marisma',
      periodoEs: 'Noviembre de 2026',
      subtitulo: 'Informe de Explotacion Mensual',
      logo,
    })
    // Dos rects para la banda + filete.
    assert.ok(doc.calls.rect.length >= 2)
    // La banda cubre y=0..28 con fill vino (123, 30, 59).
    const banda = doc.calls.rect[0]
    assert.equal(banda.y, 0)
    assert.equal(banda.h, 28)
    assert.deepEqual(doc.calls.setFillColor[0], PDF_COLORS.wine)
    // Filete dorado 1.2 mm en y=28.
    const filete = doc.calls.rect[1]
    assert.equal(filete.y, 28)
    assert.ok(filete.h > 0 && filete.h <= 2)
    // Logo con ratio 1:1 (PNG 512×512) y alto 18 mm → ancho 18 mm.
    assert.equal(doc.calls.image.length, 1)
    const img = doc.calls.image[0]
    const ratio = img.w / img.h
    assert.ok(Math.abs(ratio - (logo.width / logo.height)) < 0.01,
      `ratio img ${ratio} vs png ${logo.width / logo.height}`)
    assert.equal(img.x, 18)       // margin
    assert.equal(img.y, 5)        // dentro de la banda
    // Textos: "Carta Viva" + subtítulo + periodo + restaurante.
    const textos = doc.calls.text.map(t => t.txt)
    assert.ok(textos.includes('Carta Viva'))
    assert.ok(textos.includes('Informe de Explotacion Mensual'))
    assert.ok(textos.includes('Noviembre de 2026'))
    assert.ok(textos.includes('Casa Marisma'))
  })

  it('sin logo → degrada a solo texto, 2 rects (banda + filete)', () => {
    const doc = createJsPdfSpy()
    pintarCabecera(doc, {
      W: 210, margin: 18,
      restauranteNombre: 'Casa Marisma',
      periodoEs: 'Noviembre de 2026',
      logo: null,
    })
    assert.equal(doc.calls.image.length, 0)
    assert.ok(doc.calls.rect.length >= 2)
    // "Carta Viva" sigue estando.
    const textos = doc.calls.text.map(t => t.txt)
    assert.ok(textos.includes('Carta Viva'))
  })
})

describe('pintarPiesEnTodas — Página X de N en todas', () => {
  it('con 1 página → "Pagina 1 de 1"', () => {
    const doc = createJsPdfSpy(1)
    pintarPiesEnTodas(doc, { W: 210 })
    const paginas = doc.calls.text
      .map(t => t.txt)
      .filter(x => /^Pagina \d+ de \d+$/.test(x))
    assert.deepEqual(paginas, ['Pagina 1 de 1'])
  })
  it('con 3 páginas → "Pagina 1 de 3", "2 de 3", "3 de 3"', () => {
    const doc = createJsPdfSpy(3)
    pintarPiesEnTodas(doc, { W: 210 })
    const paginas = doc.calls.text
      .map(t => t.txt)
      .filter(x => /^Pagina \d+ de \d+$/.test(x))
    assert.deepEqual(paginas, ['Pagina 1 de 3', 'Pagina 2 de 3', 'Pagina 3 de 3'])
  })
  it('restaura la página activa al terminar (snapshot al inicio)', () => {
    const doc = createJsPdfSpy(3)
    // Snapshot inicial: currentPage = 1 (ver spy).
    pintarPiesEnTodas(doc, { W: 210 })
    // Última setPage debe ser la página original (1).
    assert.equal(doc.calls.setPage.at(-1), 1)
    // Debe haber iterado 1..3 + restauración (4 calls).
    assert.ok(doc.calls.setPage.length >= 4)
  })
})
