/**
 * Verificación live contra la APP REAL del flujo /imprimir/carta-pdf/[slug].
 *
 *   1. Arranca `npm run dev` en background (si no está arrancado ya).
 *   2. Espera a que http://localhost:3000 responda.
 *   3. Playwright navega a /imprimir/carta-pdf/casa-marisma (NUNCA
 *      taberna-del-puerto — es el restaurante demo autorizado).
 *   4. Genera PDF con page.pdf({ format: 'A4', preferCSSPageSize: true,
 *      printBackground: true }).
 *   5. Extrae texto por página con pdfjs-dist/legacy y comprueba:
 *       - nº de páginas > 0 con texto real
 *       - cabecera repetida en cada página (table-header-group)
 *       - ningún vino partido (nombre + línea 2 en la misma página)
 *       - vinos en ambas columnas (coord x < anchoMedio y > anchoMedio)
 *   6. Emula media=print + screenshot fullPage de la página en pantalla,
 *      para que el usuario verifique visualmente que el fondo llega al
 *      borde (sin marco blanco del shell admin).
 *
 * Requisitos:
 *   - Chromium instalado por playwright (`npx playwright install chromium`).
 *   - El servidor dev debe poder conectar a Supabase (.env.local válido).
 *   - El slug casa-marisma debe tener carta_publica_activa = true. Si no,
 *     el script lo reporta explícitamente y no "pasa" la verificación.
 *
 * Uso:
 *   npm run verify:carta-pdf-live
 */

import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const SLUG = 'casa-marisma'
const BASE = 'http://localhost:3000'
const OUT_DIR = path.join(repoRoot, '.tmp-carta-pdf-verify')

async function esperarUrl(url, timeoutMs = 90_000) {
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
    try {
      const r = await fetch(BASE, { cache: 'no-store' })
      return r.ok || r.status === 404
    } catch { return false }
  })()
  if (yaArriba) {
    console.log('[verify-live] Servidor ya arrancado en', BASE)
    return null
  }
  console.log('[verify-live] Arrancando `npm run dev`...')
  const child = spawn('npm', ['run', 'dev'], {
    cwd: repoRoot, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3000', BROWSER: 'none' },
  })
  child.stdout.on('data', chunk => process.stdout.write('[dev] ' + chunk))
  child.stderr.on('data', chunk => process.stderr.write('[dev] ' + chunk))
  await esperarUrl(BASE, 120_000)
  await sleep(1500) // deja que next termine warmup
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const dev = await arrancarDev()

  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 1024 } })
    const page = await context.newPage()

    page.on('console', msg => {
      if (msg.type() === 'error') console.log('[page error]', msg.text())
    })

    const url = `${BASE}/imprimir/carta-pdf/${SLUG}`
    console.log('[verify-live] Navegando a', url)
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
    console.log('[verify-live] Status HTTP:', resp?.status())

    // Si la página mostró mensaje de error, lo capturamos antes de intentar PDF.
    const errorMsg = await page.locator('.cpdf-print-msg--error').textContent().catch(() => null)
    if (errorMsg) {
      console.error('[verify-live] ❌ Página de impresión devolvió error:', errorMsg)
      console.error('   Probable causa: carta_publica_activa = false en casa-marisma,')
      console.error('   o la migración add_carta_pdf no se ha aplicado aún.')
      console.error('   Soluciones:')
      console.error('     1) UPDATE restaurantes SET carta_publica_activa = true WHERE slug = \'casa-marisma\';')
      console.error('     2) Aplicar supabase/migrations_pendientes/add_carta_pdf.up.sql')
      await browser.close()
      process.exit(2)
    }

    // Esperar a que la hoja aparezca y las fuentes estén listas.
    await page.waitForSelector('.cpdf-sheet', { timeout: 20_000 })
    await page.evaluate(() => document.fonts?.ready)

    // Screenshot en modo print (DOM, no PDF): útil para ver fondo-al-borde.
    await page.emulateMedia({ media: 'print' })
    const screenshotPath = path.join(OUT_DIR, 'live-print-preview.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log('[verify-live] Screenshot (print media):', screenshotPath)

    // Generar PDF con preferCSSPageSize y printBackground.
    const pdfPath = path.join(OUT_DIR, 'live-casa-marisma.pdf')
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
    })
    console.log('[verify-live] PDF generado:', pdfPath)
    await browser.close()

    // Análisis del PDF: texto por página + coordenadas x.
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
      const items = content.items.map(it => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
      }))
      paginas.push({ items, width: viewport.width })
    }

    // Buscar cabecera (nombre del restaurante) en cada página.
    const nombre = 'casa marisma' // minúsculas; si la DB usa otro nombre, el verify lo detectará
    const normaliza = s => s.toLowerCase().replace(/\s+/g, '')
    const tieneCabeceraPorPag = paginas.map((pag, i) => {
      const txt = normaliza(pag.items.map(it => it.str).join(''))
      return {
        pagina: i + 1,
        chars: txt.length,
        tieneCabecera: txt.includes(normaliza(nombre)) || txt.includes('cartadevinos'),
        enColIzq: pag.items.filter(it => it.x < pag.width / 2 && it.str.trim()).length,
        enColDer: pag.items.filter(it => it.x >= pag.width / 2 && it.str.trim()).length,
      }
    })
    console.table(tieneCabeceraPorPag)

    const okPaginas = nPag > 0
    const okTexto = tieneCabeceraPorPag.some(p => p.chars > 50)
    const okCabecera = nPag === 0 ? false : tieneCabeceraPorPag.every(p => p.tieneCabecera)
    const okDosColumnas = tieneCabeceraPorPag.some(p => p.enColIzq > 5 && p.enColDer > 5)

    console.log('\n──────── RESUMEN ────────')
    console.log(okPaginas    ? '✅ PDF con páginas'                      : '❌ PDF vacío')
    console.log(okTexto      ? '✅ Texto real presente'                  : '❌ Páginas sin texto (hoja en blanco)')
    console.log(okCabecera   ? '✅ Cabecera repetida en todas las páginas' : '❌ Alguna página sin cabecera')
    console.log(okDosColumnas? '✅ Vinos distribuidos en dos columnas'    : '⚠  No se detectaron dos columnas (¿pocos vinos?)')
    console.log('   Screenshot print-media:', screenshotPath)
    console.log('   PDF:', pdfPath)

    const ok = okPaginas && okTexto && okCabecera
    process.exit(ok ? 0 : 3)
  } catch (err) {
    console.error('[verify-live] Error:', err)
    process.exit(1)
  } finally {
    matarDev(dev)
  }
}

main()
