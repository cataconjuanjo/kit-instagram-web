/**
 * Verificación live de /imprimir/carta-pdf/casa-marisma contra la APP REAL.
 *
 * Ejecuta DOS pases:
 *   1) Paleta configurada del restaurante (oscura por defecto en casa-marisma).
 *   2) Paleta CLARA sobrescrita vía document.documentElement.style (fondo
 *      #f7f3ee, acento #b5532a — simula el caso de "Lo de Carmen").
 *
 * Para cada pase:
 *   - Arranca `npm run dev` (si no estaba), Playwright abre la ruta.
 *   - Page.pdf({ format:A4, preferCSSPageSize, printBackground }).
 *   - Rasteriza TODAS las páginas a PNG con pdfjs + @napi-rs/canvas.
 *   - Comprueba:
 *      (a) 4 esquinas + línea inferior (muestreo cada 50 px, y=height-1)
 *          deben estar en el color de fondo del restaurante (tolerancia).
 *      (b) Margen inferior del contenido >= 8 mm en páginas no finales:
 *          busca el píxel no-fondo más bajo y mide su distancia hasta el
 *          borde físico en mm (scale 1.5 → 1 mm ≈ 4.25 px → 8 mm ≈ 34 px).
 *      (c) Sin página final vacía (>10 % de texto en la última).
 *      (d) Cabecera repetida en todas las páginas.
 *   - Guarda PNGs rasterizados + PDF en .tmp-carta-pdf-verify/.
 *
 * Uso: npm run verify:carta-pdf-live
 */

import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const SLUG = 'casa-marisma'
const BASE = 'http://localhost:3000'
const OUT_DIR = path.join(repoRoot, '.tmp-carta-pdf-verify')

const MAX_PAGINAS = 3
const UMBRAL_TEXTO_PAG_NO_FINAL = 0.40
const UMBRAL_TEXTO_PAG_FINAL = 0.25  // ≥ 25 % del texto de la más llena
                                      // (brief densidad: evita "seccion
                                      //  huérfana de 1 vino + pie")
const TOLERANCIA_COLOR = 32
const MARGEN_INFERIOR_MIN_MM = 8     // margen inferior del contenido

// Escala del rasterizado (pdfjs). Permite convertir px→mm:
//   1 pt = 1/72 inch;  1 inch = 25.4 mm
//   render a scale: 1 pt → SCALE_PX px
//   1 mm = SCALE_PX / (25.4 / (1/72)) = SCALE_PX / (25.4 * 72) ... invertido.
// Más simple: para A4 297 mm → 842 pt base → viewport.height a scale 1.5 ≈ 1263 px.
// px/mm = 1263 / 297 ≈ 4.25
const RENDER_SCALE = 1.5
const PX_POR_MM = (842 * RENDER_SCALE) / 297

const PALETAS = [
  // Pase 1: paleta real del restaurante (oscura en casa-marisma),
  // vinos reales (50 aprox).
  { nombre: 'oscura', color_fondo: null, color_acento: null, clonarVinosHasta: null },
  // Pase 2: paleta clara + 80 vinos sintéticos (clona los reales).
  // Simula "Lo de Carmen" sin tocar DB.
  { nombre: 'clara',  color_fondo: '#f7f3ee', color_acento: '#b5532a', clonarVinosHasta: 80 },
]

async function esperarUrl(url, timeoutMs = 180_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok || r.status === 404) return true }
    catch {}
    await sleep(500)
  }
  throw new Error(`Timeout esperando ${url}`)
}

async function arrancarDev() {
  const yaArriba = await (async () => {
    try { const r = await fetch(BASE, { cache: 'no-store' }); return r.ok || r.status === 404 }
    catch { return false }
  })()
  if (yaArriba) { console.log('[verify-live] Servidor ya arrancado en', BASE); return null }
  console.log('[verify-live] Arrancando `npm run dev`...')
  const child = spawn('npm', ['run', 'dev'], {
    cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3000', BROWSER: 'none' },
  })
  child.stdout.on('data', chunk => process.stdout.write('[dev] ' + chunk))
  child.stderr.on('data', chunk => process.stderr.write('[dev] ' + chunk))
  await esperarUrl(BASE, 180_000); await sleep(1500)
  return child
}

function matarDev(child) {
  if (!child) return
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'])
    else child.kill('SIGTERM')
  } catch {}
}

function hexToRgb(hex) {
  const h = String(hex).trim().replace(/^#/, '')
  if (h.length === 3) return hexToRgb('#' + h.split('').map(c => c + c).join(''))
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

function distanciaColor(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

async function rasterizarPagina(pdfDoc, pageNum, outPath) {
  const { createCanvas } = await import('@napi-rs/canvas')
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: RENDER_SCALE })
  const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height))
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  const png = await canvas.encode('png')
  await writeFile(outPath, png)
  return { canvas, ctx, width: canvas.width, height: canvas.height }
}

/**
 * Para una fila completa de píxeles (una scanline horizontal en y),
 * devuelve % de píxeles que están en el color de fondo (dentro de TOLERANCIA).
 */
function ratioFondoEnFila(ctx, width, y, bgRgb) {
  const data = ctx.getImageData(0, y, width, 1).data
  let ok = 0
  for (let x = 0; x < width; x++) {
    const i = x * 4
    const d = distanciaColor({ r: data[i], g: data[i + 1], b: data[i + 2] }, bgRgb)
    if (d <= TOLERANCIA_COLOR) ok++
  }
  return ok / width
}

/**
 * Muestrea las 4 esquinas + N puntos a lo largo del borde inferior.
 * Devuelve ratio de puntos con color de fondo correcto (incluye bordes).
 */
function muestrearBordes(ctx, width, height, bgRgb) {
  const inset = 10
  const puntos = [
    { nombre: 'tl', x: inset, y: inset },
    { nombre: 'tr', x: width - inset, y: inset },
    { nombre: 'bl', x: inset, y: height - inset },
    { nombre: 'br', x: width - inset, y: height - inset },
  ]
  // Línea inferior completa: 1 muestra cada ~50 px
  for (let x = 25; x < width; x += 50) {
    puntos.push({ nombre: `b${x}`, x, y: height - 2 })
  }
  // Línea superior
  for (let x = 25; x < width; x += 50) {
    puntos.push({ nombre: `t${x}`, x, y: 1 })
  }
  const detalle = puntos.map(p => {
    const d = ctx.getImageData(p.x, p.y, 1, 1).data
    const dist = distanciaColor({ r: d[0], g: d[1], b: d[2] }, bgRgb)
    return { ...p, rgb: { r: d[0], g: d[1], b: d[2] }, dist, ok: dist <= TOLERANCIA_COLOR }
  })
  const ok = detalle.every(p => p.ok)
  return { ok, detalle }
}

/**
 * Margen inferior del contenido en mm: desde el último píxel NO-fondo
 * (contenido real: texto, bordes de sección) hasta el borde inferior.
 *
 * Una fila "de fondo" tiene >= 95 % de píxeles dentro de la tolerancia.
 */
function margenInferiorMm(ctx, width, height, bgRgb) {
  // Scan de abajo hacia arriba.
  let yContenidoMasBajo = -1
  for (let y = height - 1; y >= 0; y--) {
    const ratio = ratioFondoEnFila(ctx, width, y, bgRgb)
    if (ratio < 0.95) { yContenidoMasBajo = y; break }
  }
  if (yContenidoMasBajo < 0) return height / PX_POR_MM // página toda fondo
  return (height - 1 - yContenidoMasBajo) / PX_POR_MM
}

async function ejecutarPase(browser, paleta) {
  console.log(`\n═════════ PASE "${paleta.nombre}" ═════════`)
  const context = await browser.newContext({ viewport: { width: 1280, height: 1024 } })
  const page = await context.newPage()
  page.on('console', msg => { if (msg.type() === 'error') console.log('[page error]', msg.text()) })

  // Interceptamos la respuesta de la API pública para:
  //   (a) sobrescribir los colores (simula paleta sin tocar la DB)
  //   (b) clonar los vinos hasta `clonarVinosHasta` (simula una carta
  //       grande tipo Lo de Carmen sin cargar 80 vinos reales).
  // El componente recibe la respuesta modificada y renderiza normal.
  if (paleta.color_fondo || paleta.clonarVinosHasta) {
    await page.route('**/api/public/restaurante/**', async route => {
      const response = await route.fetch()
      let body
      try { body = await response.json() } catch { body = null }
      if (body?.restaurante) {
        if (paleta.color_fondo)  body.restaurante.color_fondo  = paleta.color_fondo
        if (paleta.color_acento) body.restaurante.color_acento = paleta.color_acento
      }
      if (paleta.clonarVinosHasta && Array.isArray(body?.vinos) && body.vinos.length > 0) {
        const originales = [...body.vinos]
        let k = 0
        while (body.vinos.length < paleta.clonarVinosHasta) {
          const base = originales[k % originales.length]
          const suf = String(k + 1).padStart(2, '0')
          body.vinos.push({
            ...base,
            id: `${base.id}-clon-${suf}`,
            nombre: `${base.nombre} CLON ${suf}`,
          })
          k++
        }
      }
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    })
  }

  const url = `${BASE}/imprimir/carta-pdf/${SLUG}`
  console.log('[pase]', paleta.nombre, '→', url)
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
  console.log('[pase] HTTP:', resp?.status())

  const errorMsg = await page.locator('.cpdf-print-msg--error').textContent().catch(() => null)
  if (errorMsg) {
    console.error('[pase] ❌ Error en la ruta de impresión:', errorMsg)
    await context.close()
    return { paleta: paleta.nombre, ok: false, razon: errorMsg }
  }

  await page.waitForSelector('.cpdf-sheet', { timeout: 20_000 })
  await page.evaluate(() => document.fonts?.ready)
  // Pequeña espera para que el useEffect del componente propague los
  // colores interceptados al documentElement.
  await page.waitForTimeout(300)

  // Color efectivo renderizado (tras la inyección).
  const bgHex = await page.evaluate(() => {
    const el = document.querySelector('.cpdf-sheet')
    return getComputedStyle(el).getPropertyValue('--cpdf-bg').trim() || null
  })
  const bgRgb = bgHex ? hexToRgb(bgHex) : { r: 26, g: 26, b: 46 }
  console.log('[pase] Fondo efectivo:', bgHex, '→', bgRgb)

  // Detecta modo densidad aplicado por el componente (data-densidad).
  const metaDensidad = await page.evaluate(() => {
    const el = document.querySelector('.cpdf-sheet')
    return el ? {
      densidad: el.dataset.densidad || 'desconocida',
      totalVinos: Number(el.dataset.totalVinos) || 0,
      compact: el.classList.contains('cpdf-sheet--compact'),
    } : null
  })
  console.log('[pase] Densidad:', metaDensidad)

  const pdfPath = path.join(OUT_DIR, `live-${paleta.nombre}.pdf`)
  await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: true })
  await context.close()

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const buf = await readFile(pdfPath)
  const pdfDoc = await getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true }).promise
  const nPag = pdfDoc.numPages

  const normaliza = s => s.toLowerCase().replace(/\s+/g, '')

  const resultados = []
  let maxChars = 1
  for (let i = 1; i <= nPag; i++) {
    const p = await pdfDoc.getPage(i)
    const content = await p.getTextContent()
    const txt = content.items.map(it => it.str).join(' ').trim()
    const rasterPath = path.join(OUT_DIR, `live-${paleta.nombre}-pag${i}.png`)
    const { ctx, width, height } = await rasterizarPagina(pdfDoc, i, rasterPath)
    const bordes = muestrearBordes(ctx, width, height, bgRgb)
    const margenMm = margenInferiorMm(ctx, width, height, bgRgb)
    resultados.push({
      pag: i, chars: txt.length, texto: txt,
      width, height, rasterPath,
      bordes, margenMm,
    })
    if (txt.length > maxChars) maxChars = txt.length
  }

  const info = resultados.map(r => ({
    pag: r.pag,
    chars: r.chars,
    ratio: Math.round((r.chars / maxChars) * 100) / 100,
    cabecera: normaliza(r.texto).includes('cartadevinos') || normaliza(r.texto).includes('casamarisma'),
    bordesOK: r.bordes.ok,
    margenMm: Math.round(r.margenMm * 10) / 10,
    chromeUI: ['http://localhost', 'https://', '/imprimir/carta-pdf']
      .some(m => r.texto.includes(m)),
  }))

  console.table(info)

  const esUltima = i => i === info.length
  const r1 = nPag <= MAX_PAGINAS
  const r2 = info.every(x => x.cabecera)
  const r3 = info.slice(0, -1).every(x => x.ratio >= UMBRAL_TEXTO_PAG_NO_FINAL)
  const r4 = info.every(x => x.bordesOK)
  const r5 = info.every(x => !x.chromeUI)
  const r6 = info[0]?.chars > 200
  const ultima = info[info.length - 1]
  const r7 = !ultima || ultima.ratio >= UMBRAL_TEXTO_PAG_FINAL
  // (b) margen inferior ≥ 8 mm en páginas NO finales (en la última puede
  // ser menor porque el pie puede caer cerca del borde: lo exigimos solo
  // para páginas no finales).
  const r8 = info.slice(0, -1).every(x => x.margenMm >= MARGEN_INFERIOR_MIN_MM)

  console.log(`\n── RESUMEN pase ${paleta.nombre} ──`)
  console.log(r1 ? `✅ Páginas ≤ ${MAX_PAGINAS} (actual ${nPag})` : `❌ Páginas = ${nPag}`)
  console.log(r2 ? '✅ Cabecera repetida en todas las páginas' : '❌ Alguna página sin cabecera')
  console.log(r3 ? `✅ Páginas no-finales con ≥ ${Math.round(UMBRAL_TEXTO_PAG_NO_FINAL*100)}% texto` : '❌ Página no-final medio vacía')
  console.log(r4 ? '✅ 4 esquinas + bordes superior/inferior en color de fondo' : '❌ Marco fuera del color de fondo')
  console.log(r5 ? '✅ Sin URL/fecha de Chrome en el PDF' : '❌ Chrome imprime cabecera/pie')
  console.log(r6 ? '✅ Página 1 con vinos' : '❌ Página 1 sin vinos')
  console.log(r7 ? '✅ Página final con contenido' : '❌ Página final fantasma')
  console.log(r8 ? `✅ Margen inferior ≥ ${MARGEN_INFERIOR_MIN_MM} mm en páginas no finales`
                : `❌ Margen inferior insuficiente: ${info.slice(0, -1).map(x => x.pag + '=' + x.margenMm + 'mm').join(', ')}`)

  const fallos = []
  if (!r1) fallos.push('r1-paginas')
  if (!r2) fallos.push('r2-cabecera')
  if (!r3) fallos.push('r3-texto-no-final')
  if (!r4) fallos.push('r4-bordes')
  if (!r5) fallos.push('r5-chromeUI')
  if (!r6) fallos.push('r6-pag1-vinos')
  if (!r7) fallos.push('r7-pag-fantasma')
  if (!r8) fallos.push('r8-margen-inferior')

  if (!r4) {
    const paginasConFallo = resultados.filter(r => !r.bordes.ok)
    paginasConFallo.forEach(r => {
      const malos = r.bordes.detalle.filter(p => !p.ok).slice(0, 6)
      console.log(`  Fallos de borde en pág ${r.pag}:`, malos.map(m =>
        `${m.nombre}@(${m.x},${m.y})=rgb(${m.rgb.r},${m.rgb.g},${m.rgb.b}) d=${m.dist.toFixed(0)}`
      ).join(' | '))
    })
  }

  return { paleta: paleta.nombre, ok: fallos.length === 0, fallos, rasters: resultados.map(r => r.rasterPath), pdf: pdfPath }
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })
  const dev = await arrancarDev()
  let exitCode = 0
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const resumenes = []
    for (const paleta of PALETAS) {
      const r = await ejecutarPase(browser, paleta)
      resumenes.push(r)
      if (!r.ok) exitCode = 3
    }
    await browser.close()

    console.log('\n═════════ RESULTADO GLOBAL ═════════')
    for (const r of resumenes) {
      console.log(r.ok
        ? `✅ pase "${r.paleta}" OK`
        : `❌ pase "${r.paleta}" fallos: ${r.fallos.join(', ')}`)
      console.log('   PDF:', r.pdf)
      console.log('   PNGs:', r.rasters.join(', '))
    }
  } catch (err) {
    console.error('[verify-live] Error:', err)
    exitCode = 1
  } finally {
    matarDev(dev)
    process.exit(exitCode)
  }
}

main()
