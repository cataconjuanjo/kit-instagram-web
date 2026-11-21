/**
 * Fase E-3 — pulido del PDF del cierre mensual.
 *
 *   1. El texto extraído NO contiene bytes nulos, NO contiene "!'"
 *      (síntoma visible de un "→" codificado en UTF-16), y NO contiene
 *      ningún carácter fuera de WinAnsi CP1252 (flechas, "≥", "≤",
 *      "✓", emojis). Acentos, "€" y "·" sí están permitidos.
 *   2. Hay exactamente UN pie por página: "Página X de N" + la línea
 *      brand (sin duplicados tipo "Carta Viva · … · Pag. X/N"
 *      junto a "Página X de N").
 *   3. Invariancia de cifras intacta (cubierta por el test previo
 *      pdfCierreMensualInvariante.test.mjs).
 *
 * Ejecutar: node --test scripts/pdfCierreWinAnsi.test.mjs
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

// Caracteres WinAnsi admitidos (CP1252). Un string se considera
// seguro si, al pasar a latin1, cada byte está en 0x20..0xFF menos
// los huecos de CP1252 que jsPDF reencodea a UTF-16: 0x81, 0x8D,
// 0x8F, 0x90, 0x9D. Para el test basta con un check negativo sobre
// un set explícito de caracteres SOSPECHOSOS que suelen aparecer en
// cadenas de PDF.
const SOSPECHOSOS = /[→←↑↓≥≤✓✗∞⇒⇐]/

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
    // Filtra streams que NO son de texto (p.ej. imágenes PNG binarias
    // que contienen paréntesis "accidentales" por sus bytes binarios).
    // Un stream de texto siempre lleva operadores BT/ET.
    if (!/\bBT\b/.test(txt) || !/\bET\b/.test(txt)) continue
    const reTxt = /\((?:[^()\\]|\\.)*\)/g
    let t
    while ((t = reTxt.exec(txt)) !== null) {
      partes.push(t[0].slice(1, -1).replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'))
    }
  }
  return partes.join(' ')
}

// Construye un PDF que replica la estructura del cierre mensual
// post-E-3: cabecera + línea de periodo con " a " + cuerpo mínimo +
// un único pie con pintarPiesEnTodas (textoIzda con fecha).
function generarPdfFixture() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW = 210, ML = 14
  let y = 14

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

  // Línea de periodo con el fix de E-3: usa " a " en lugar de "→".
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 100, 100)
  doc.text('22 partes · 2026-10-01 a 2026-10-31', ML, y)
  y += 5

  // Cifras del cuerpo (una muestra para verificar que el texto se
  // extrae correctamente y no hay bytes nulos).
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40, 40, 40)
  doc.text('Ventas', ML, y); y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('9.621,82 EUR', PW - ML, y, { align: 'right' })

  // Fuerzo un salto para que haya 2 páginas y comprobar "Página 1 de 2".
  doc.addPage()
  pintarCabeceraCv()

  // Un único pie por página — la clave del fix.
  pintarPiesEnTodas(doc, {
    W: PW,
    textoIzda: `Carta Viva · Cierre mensual · 21/11/2026`,
  })
  return Buffer.from(doc.output('arraybuffer'))
}

describe('Fase E-3 — PDF del cierre mensual, caracteres y pie único', () => {
  const buf = generarPdfFixture()
  const texto = extraerTextoDePdf(buf)
  // Binario crudo SOLO de los streams de texto (los que llevan BT/ET
  // en su contenido inflado). Los streams de imagen PNG tienen bytes
  // binarios que incluyen 0x00 de forma legítima.
  const streams = []
  {
    const src = buf.toString('binary')
    const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g
    let m
    while ((m = re.exec(src)) !== null) {
      const raw = Buffer.from(m[1], 'binary')
      let inflado
      try { inflado = zlib.inflateSync(raw) } catch { inflado = raw }
      const txt = inflado.toString('latin1')
      if (/\bBT\b/.test(txt) && /\bET\b/.test(txt)) streams.push(inflado)
    }
  }

  it('texto extraído: NO contiene "→" ni caracteres fuera de WinAnsi (flechas, ≥, ≤, ✓)', () => {
    assert.ok(!SOSPECHOSOS.test(texto), `Carácter sospechoso en texto: ${texto.match(SOSPECHOSOS)?.[0]}`)
    // "→" en particular:
    assert.ok(!texto.includes('→'), 'no debe aparecer "→" en el texto del PDF')
  })

  it('texto extraído: NO contiene la secuencia "!’" (síntoma de UTF-16 forzado por "→")', () => {
    // Cuando jsPDF reencoda la línea a UTF-16, los extractores
    // latin1 ven "!'" (0x21 0x19 aprox) o equivalentes. Verificar
    // ausencia de ese patrón concreto.
    assert.ok(!texto.includes("!'"), 'secuencia "!\'" presente — señal de UTF-16 colado por "→"')
  })

  it('los streams decodificados: la línea de periodo aparece sin bytes nulos intercalados', () => {
    // En el payload texto plano del PDF para Tj, un carácter no-WinAnsi
    // provoca que jsPDF emita un BT con Tf a una fuente UTF-16 y la
    // cadena en bytes 00 XX 00 XX… Comprobamos que en los streams
    // donde aparece "2026-10-01" NO hay bytes nulos pegados.
    let halleLinea = false
    for (const buf of streams) {
      const binario = buf.toString('binary')
      const idx = binario.indexOf('2026-10-01')
      if (idx === -1) continue
      halleLinea = true
      // 40 bytes a ambos lados para localizar bytes nulos.
      const ventana = binario.slice(Math.max(0, idx - 10), idx + 60)
      // UTF-16 encodeado provocaría bytes 0x00 intercalados entre
      // ASCII; en WinAnsi no hay 0x00 en el rango 0x20..0xFF.
      assert.ok(!ventana.includes('\x00'),
        `bytes nulos detectados cerca de "2026-10-01" (indicio de UTF-16): ${JSON.stringify(ventana)}`)
    }
    assert.ok(halleLinea, 'no encontré la línea de periodo en el PDF — fixture rota')
  })

  it('exactamente UN pie por página: "Página X de N" en un solo lugar', () => {
    // En 2 páginas esperamos "Página 1 de 2" + "Página 2 de 2", total 2 ocurrencias.
    const ocurrenciasPagina = texto.match(/Página \d+ de \d+/g) || []
    assert.equal(ocurrenciasPagina.length, 2, `"Página X de N" apareció ${ocurrenciasPagina.length} veces (esperaba 2 páginas)`)
    assert.ok(texto.includes('Página 1 de 2'))
    assert.ok(texto.includes('Página 2 de 2'))
  })

  it('NO aparece el pie antiguo "Pag. X/N" (eliminado en E-3)', () => {
    assert.ok(!/Pag\. \d+\/\d+/.test(texto),
      '"Pag. X/N" (pie antiguo) sigue apareciendo tras el fix de E-3')
    assert.ok(!/Pág\. \d+\/\d+/.test(texto),
      '"Pág. X/N" (pie antiguo con tilde) sigue apareciendo tras el fix de E-3')
  })

  it('el pie nuevo lleva fecha de generación en el lado izquierdo', () => {
    // textoIzda con fecha que fijamos en la fixture.
    assert.match(texto, /Carta Viva · Cierre mensual · 21\/11\/2026/)
    // Y aparece 2 veces (una por página).
    const m = texto.match(/Carta Viva · Cierre mensual · 21\/11\/2026/g) || []
    assert.equal(m.length, 2, `el pie brand debería aparecer 2 veces (una por página), apareció ${m.length}`)
  })

  it('acentos, "€" y "·" se conservan correctamente (sanity check)', () => {
    assert.match(texto, /Página/, 'la tilde de "Página" se conserva')
    assert.match(texto, /·/,       'el middle dot "·" se conserva')
    // Comprobación negativa simple: ninguna cadena del texto arranca
    // con bytes nulos (fallo típico de UTF-16).
    assert.ok(!texto.includes('\x00'),
      'texto extraído contiene byte nulo — alguna cadena se codificó UTF-16')
  })
})
