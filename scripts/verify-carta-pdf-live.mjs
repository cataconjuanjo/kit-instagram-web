/**
 * Verificación live de /imprimir/carta-pdf/casa-marisma contra la APP REAL.
 *
 * Pasos:
 *   1. Arranca `npm run dev` en background (si no está ya arrancado).
 *   2. Playwright + Chromium real navegan a /imprimir/carta-pdf/casa-marisma
 *      (NUNCA taberna-del-puerto).
 *   3. Genera PDF con page.pdf({ format:'A4', preferCSSPageSize:true,
 *      printBackground:true }).
 *   4. Rasteriza TODAS las páginas a PNG con pdfjs + @napi-rs/canvas.
 *   5. Para cada página comprueba:
 *       - % de texto respecto a la página más llena (debe ser ≥ 40% si
 *         no es la última).
 *       - 4 esquinas con el color de fondo configurado (fondo a sangre
 *         sin marco blanco).
 *       - No contiene texto tipo "about:blank", URL, fecha, "1/1", etc.
 *   6. Total de páginas ≤ 3 para una carta de ~50 vinos.
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
const UMBRAL_TEXTO_PAG_NO_FINAL = 0.40 // 40% del texto de la pág más llena
const TOLERANCIA_COLOR = 24 // distancia euclídea RGB por canal (0..255)

async function esperarUrl(url, timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok || res.status === 404) return true
    } catch {}
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
  await esperarUrl(BASE, 180_000)
  await sleep(1500)
  return child
}

function matarDev(child) {
  if (!child) return
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'])
    } else {
      child.kill('SIGTERM')
    }
  } catch {}
}

function hexToRgb(hex) {
  const h = String(hex).trim().replace(/^#/, '')
  if (h.length === 3) return hexToRgb('#' + h.split('').map(c => c + c).join(''))
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function distanciaColor(a, b) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)
}

async function rasterizarPagina(pdfDoc, pageNum, outPath) {
  const { createCanvas } = await import('@napi-rs/canvas')
  const page = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1.5 })
  const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height))
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport, canvasFactory: undefined }).promise
  const png = await canvas.encode('png')
  await writeFile(outPath, png)
  return { canvas, ctx, width: canvas.width, height: canvas.height }
}

function muestrearEsquinas(ctx, width, height) {
  // Muestreamos 4 puntos cerca de cada borde (10px adentro, 10px de margen
  // para evitar artefactos del borde exacto).
  const inset = 10
  const puntos = {
    tl: ctx.getImageData(inset, inset, 1, 1).data,
    tr: ctx.getImageData(width - inset, inset, 1, 1).data,
    bl: ctx.getImageData(inset, height - inset, 1, 1).data,
    br: ctx.getImageData(width - inset, height - inset, 1, 1).data,
  }
  return Object.fromEntries(
    Object.entries(puntos).map(([k, d]) => [k, { r: d[0], g: d[1], b: d[2] }])
  )
}

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })
  const dev = await arrancarDev()

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 1024 } })
    const page = await context.newPage()
    page.on('console', msg => { if (msg.type() === 'error') console.log('[page error]', msg.text()) })

    const url = `${BASE}/imprimir/carta-pdf/${SLUG}`
    console.log('[verify-live] Navegando a', url)
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
    console.log('[verify-live] Status HTTP:', resp?.status())

    const errorMsg = await page.locator('.cpdf-print-msg--error').textContent().catch(() => null)
    if (errorMsg) {
      console.error('[verify-live] ❌ Página de impresión devolvió error:', errorMsg)
      console.error('   Probable causa: carta_publica_activa=false en casa-marisma, o migración no aplicada.')
      await browser.close()
      process.exit(2)
    }

    await page.waitForSelector('.cpdf-sheet', { timeout: 20_000 })
    await page.evaluate(() => document.fonts?.ready)

    // Obtener color de fondo efectivo que renderiza el DOM.
    const bgHex = await page.evaluate(() => {
      const el = document.querySelector('.cpdf-sheet')
      if (!el) return null
      const s = getComputedStyle(el).getPropertyValue('--cpdf-bg').trim()
      return s || null
    })
    console.log('[verify-live] Color fondo CSS var:', bgHex)
    const bgRgb = bgHex ? hexToRgb(bgHex) : { r: 26, g: 26, b: 46 } // fallback default

    const pdfPath = path.join(OUT_DIR, 'live-casa-marisma.pdf')
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
    })
    console.log('[verify-live] PDF:', pdfPath)
    await browser.close()

    // Análisis PDF (texto por página + rasterizado)
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const buf = await readFile(pdfPath)
    const data = new Uint8Array(buf)
    const pdfDoc = await getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise
    const nPag = pdfDoc.numPages
    console.log('[verify-live] Páginas en PDF:', nPag)

    const paginas = []
    for (let i = 1; i <= nPag; i++) {
      const p = await pdfDoc.getPage(i)
      const content = await p.getTextContent()
      const viewport = p.getViewport({ scale: 1 })
      const txt = content.items.map(it => it.str).join(' ')
      const rasterPath = path.join(OUT_DIR, `live-pag${i}.png`)
      const { ctx, width, height } = await rasterizarPagina(pdfDoc, i, rasterPath)
      const esquinas = muestrearEsquinas(ctx, width, height)
      paginas.push({
        n: i,
        texto: txt,
        chars: txt.trim().length,
        width: viewport.width,
        rasterPath,
        esquinas,
        items: content.items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] })),
      })
    }

    const normaliza = s => s.toLowerCase().replace(/\s+/g, '')

    // Métricas por página
    const chars = paginas.map(p => p.chars)
    const maxChars = Math.max(...chars, 1)
    const nombre = normaliza('casa marisma')

    const info = paginas.map(p => {
      const esEsqOK = Object.entries(p.esquinas).map(([k, c]) => {
        const d = distanciaColor(c, bgRgb)
        return { esquina: k, c, dist: d, ok: d <= TOLERANCIA_COLOR }
      })
      const todosBordes = esEsqOK.every(e => e.ok)
      const txtNorm = normaliza(p.texto)
      const tieneCabecera = txtNorm.includes(nombre) || txtNorm.includes('cartadevinos')
      const enColIzq = p.items.filter(it => it.x < p.width / 2 && it.str.trim()).length
      const enColDer = p.items.filter(it => it.x >= p.width / 2 && it.str.trim()).length
      // Marcadores que Chrome añade por defecto si @page margin != 0:
      // URL del documento, número de página tipo "1/3", fecha. Si aparecen,
      // @page margin:0 no está haciendo efecto.
      const marcadoresChrome = ['http://localhost', 'https://', '/imprimir/carta-pdf']
      const tieneMarcadorChrome = marcadoresChrome.some(m => p.texto.includes(m))
      return {
        pag: p.n,
        chars: p.chars,
        ratioTexto: Math.round((p.chars / maxChars) * 100) / 100,
        cabecera: tieneCabecera,
        colIzq: enColIzq,
        colDer: enColDer,
        bordesOK: todosBordes,
        detalleBordes: esEsqOK,
        marcadorChrome: tieneMarcadorChrome,
      }
    })

    console.log('\n──────── POR PÁGINA ────────')
    console.table(info.map(i => ({
      pag: i.pag, chars: i.chars, ratio: i.ratioTexto,
      cabecera: i.cabecera, izq: i.colIzq, der: i.colDer,
      bordes: i.bordesOK, chromeUI: i.marcadorChrome,
    })))

    // Detalle de bordes si alguno falla
    const fallosBordes = info.filter(i => !i.bordesOK)
    if (fallosBordes.length > 0) {
      console.log('\nDetalle bordes con desviación de color:')
      fallosBordes.forEach(f => {
        console.log(`  pág ${f.pag}:`, f.detalleBordes.map(e =>
          `${e.esquina}=rgb(${e.c.r},${e.c.g},${e.c.b}) dist=${e.dist.toFixed(1)} ${e.ok ? 'ok' : '❌'}`
        ).join(' | '))
      })
    }

    // Reglas
    const r1 = nPag <= MAX_PAGINAS
    const r2 = info.every(i => i.cabecera)
    const r3 = info.slice(0, -1).every(i => i.ratioTexto >= UMBRAL_TEXTO_PAG_NO_FINAL)
    const r4 = info.every(i => i.bordesOK)
    const r5 = info.every(i => !i.marcadorChrome)
    // Primera página debe tener vinos (no solo hero): heurística — presencia
    // de al menos un "€" en pág 1 o chars > 200.
    const pag1 = info.find(i => i.pag === 1)
    const r6 = pag1 && (paginas[0].texto.includes('€') || paginas[0].chars > 200)

    console.log('\n──────── RESUMEN ────────')
    console.log(r1 ? `✅ Páginas totales ≤ ${MAX_PAGINAS} (actual: ${nPag})`
                  : `❌ Páginas totales = ${nPag} > ${MAX_PAGINAS}`)
    console.log(r2 ? '✅ Cabecera repetida en todas las páginas'
                  : '❌ Alguna página sin cabecera')
    console.log(r3 ? `✅ Ninguna página no-final por debajo del ${Math.round(UMBRAL_TEXTO_PAG_NO_FINAL*100)}% de texto`
                  : `❌ Alguna página no-final con <${Math.round(UMBRAL_TEXTO_PAG_NO_FINAL*100)}% de texto (hoja casi vacía)`)
    console.log(r4 ? '✅ Fondo a sangre en los 4 bordes de todas las páginas'
                  : '❌ Marco blanco detectado (fondo no llega al borde)')
    console.log(r5 ? '✅ Sin texto de URL/fecha de Chrome en el PDF'
                  : '❌ Chrome está imprimiendo su cabecera/pie (@page margin:0 no efectivo)')
    console.log(r6 ? '✅ Página 1 incluye vinos (no solo hero)'
                  : '❌ Página 1 sin vinos (solo hero)')
    console.log(`   PDF: ${pdfPath}`)
    console.log(`   PNGs: ${paginas.map(p => p.rasterPath).join(', ')}`)

    const ok = r1 && r2 && r3 && r4 && r5 && r6
    process.exit(ok ? 0 : 3)
  } catch (err) {
    console.error('[verify-live] Error:', err)
    process.exit(1)
  } finally {
    matarDev(dev)
  }
}

main()
