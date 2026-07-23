const baseUrl = (process.env.SMOKE_BASE_URL || 'https://www.cataconjuanjo.com').replace(/\/$/, '')
const demoSlug = process.env.SMOKE_DEMO_SLUG || 'taberna-del-puerto'
const runBrowserSmoke = process.env.SMOKE_BROWSER === '1'

const checks = [
  { path: '/', label: 'Web principal' },
  { path: '/cartavinos', label: 'Landing Carta Viva', expectText: ['Carta Viva'] },
  { path: '/login', label: 'Login privado', private: true, expectText: ['Entrar en Carta Viva'] },
  { path: '/dashboard', label: 'Dashboard privado', private: true },
  { path: '/admin/consultoria', label: 'Radar consultor privado', private: true },
  {
    path: `/demo/${demoSlug}`,
    label: 'Demo comercial',
    expectText: ['La Taberna del Puerto', 'Ver como gerente'],
  },
  {
    path: `/api/public/restaurante/${demoSlug}?hub=1&demo_presentacion=1`,
    label: 'Datos hub demo',
    json: true,
    expectJson: body => body?.restaurante?.slug === demoSlug,
  },
  {
    path: `/api/public/restaurante/${demoSlug}?carta=1&demo_presentacion=1`,
    label: 'Datos carta demo',
    json: true,
    expectJson: body => body?.restaurante?.slug === demoSlug && Array.isArray(body?.vinos) && body.vinos.length > 0,
  },
  {
    path: '/api/demo/dashboard?email=demo%40taberna-del-puerto.com',
    label: 'Datos dashboard demo',
    json: true,
    expectJson: body => body?.restaurante?.slug === demoSlug && Array.isArray(body?.vinos) && body.vinos.length > 0,
  },
  { path: '/api/health', label: 'Salud de servicios', json: true, expectJson: body => body?.status === 'ok' },
]

let failures = 0

function hasExpectedText(body, expected = []) {
  return expected.every(text => body.includes(text))
}

async function waitForVisibleText(page, text, label) {
  await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 20000 })
  console.log(`PASS ${label} contiene "${text}"`)
}

async function assertNotLogin(page, label) {
  if (new URL(page.url()).pathname === '/login') throw new Error(`${label} termino en /login`)
}

async function gotoAndExpect(page, path, label, expectedTexts = [], { notLogin = false } = {}) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' })
  if (notLogin) await assertNotLogin(page, label)
  for (const text of expectedTexts) await waitForVisibleText(page, text, label)
}

async function clickFirstLinkToPath(page, path, label) {
  const link = page.locator(`a[href*="${path}"]`).first()
  await link.waitFor({ state: 'visible', timeout: 20000 })
  await link.click()
  await page.waitForURL(url => url.pathname === path, { timeout: 20000 })
  console.log(`PASS ${label} navega a ${path}`)
}

async function assertLocatorExists(page, selector, label) {
  const locator = page.locator(selector).first()
  await locator.waitFor({ state: 'attached', timeout: 20000 })
  console.log(`PASS ${label}`)
}

async function assertSkipLink(page, href, targetId, label) {
  const link = page.locator(`a[href="${href}"]`).first()
  await link.waitFor({ state: 'attached', timeout: 20000 })
  await assertLocatorExists(page, `#${targetId}`, `${label} tiene destino #${targetId}`)

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })

  let visibleOnKeyboardFocus = false
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press('Tab')
    await page.waitForTimeout(180)
    visibleOnKeyboardFocus = await page.evaluate(expectedHref => {
      const active = document.activeElement
      if (active?.getAttribute?.('href') === expectedHref) {
        const styles = window.getComputedStyle(active)
        const rect = active.getBoundingClientRect()
        return Number(styles.opacity) > 0.9 && rect.top >= 0 && rect.height >= 40
      }
      return false
    }, href)
    if (visibleOnKeyboardFocus) break
  }

  if (!visibleOnKeyboardFocus) throw new Error(`${label} no se muestra al recibir foco`)
  console.log(`PASS ${label} visible al enfocar`)
}

async function runPublicExperienceChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await context.newPage()

  await gotoAndExpect(page, '/cartavinos', 'Landing Carta Viva desktop', [
    'Carta Viva',
    'Solicitar prueba',
  ])
  await assertSkipLink(page, '#page-content', 'page-content', 'Skip link publico')
  await assertLocatorExists(page, 'a[href="/cartavinos"][aria-current="page"]', 'Navegacion publica marca Carta Viva activa')

  await gotoAndExpect(page, `/demo/${demoSlug}`, 'Demo comercial desktop', [
    'La Taberna del Puerto',
    'Ver como cliente',
    'Ver como camarero',
    'Ver como gerente',
  ])

  await gotoAndExpect(page, `/r/${demoSlug}?demo_presentacion=1`, 'Hub publico demo desktop', [
    'La Taberna del Puerto',
    'Vista cliente',
    'Carta Viva',
  ])
  await clickFirstLinkToPath(page, `/carta/${demoSlug}`, 'Hub publico demo')
  await waitForVisibleText(page, 'La Taberna del Puerto', 'Carta publica desde hub')
  await waitForVisibleText(page, 'ArmonIA', 'Carta publica desde hub')

  await gotoAndExpect(page, `/carta/${demoSlug}?demo_presentacion=1`, 'Carta publica directa desktop', [
    'La Taberna del Puerto',
    'ArmonIA',
  ])

  await gotoAndExpect(page, `/camarero/${demoSlug}?demo=1&demo_focus=1`, 'Modo camarero demo desktop', [
    'La Taberna del Puerto',
    'Modo camarero',
    'Venta',
    'Maridaje por platos',
  ], { notLogin: true })

  await context.close()
}

async function runMobilePublicChecks(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()

  await gotoAndExpect(page, '/cartavinos', 'Landing Carta Viva mobile', [
    'Carta Viva',
    'Solicitar prueba',
  ])

  await gotoAndExpect(page, `/r/${demoSlug}?demo_presentacion=1`, 'Hub publico demo mobile', [
    'La Taberna del Puerto',
    'Carta Viva',
  ])

  await gotoAndExpect(page, `/carta/${demoSlug}?demo_presentacion=1`, 'Carta publica directa mobile', [
    'La Taberna del Puerto',
    'ArmonIA',
  ])

  await gotoAndExpect(page, `/camarero/${demoSlug}?demo=1&demo_focus=1`, 'Modo camarero demo mobile', [
    'La Taberna del Puerto',
    'Modo camarero',
    'Venta',
  ], { notLogin: true })

  await context.close()
}

async function runBrowserChecks() {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()

  try {
    await runPublicExperienceChecks(browser)
    await runMobilePublicChecks(browser)

    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(`${baseUrl}/demo/${demoSlug}`, { waitUntil: 'domcontentloaded' })
    await waitForVisibleText(page, 'La Taberna del Puerto', 'Demo comercial')
    await page.getByRole('button', { name: 'Ver como gerente' }).first().click()
    await page.waitForURL(url => (
      url.pathname === '/dashboard' && url.searchParams.get('demo_presentacion') === '1'
    ), { timeout: 20000 })
    await assertNotLogin(page, 'Demo gerente desde CTA')
    await waitForVisibleText(page, 'Vista gerente - Demo La Taberna', 'Demo gerente desde CTA')
    await waitForVisibleText(page, 'La Taberna del Puerto', 'Dashboard demo desde CTA')
    await assertSkipLink(page, '#dashboard-main-content', 'dashboard-main-content', 'Skip link dashboard')

    await page.goto(`${baseUrl}/dashboard/vinos`, { waitUntil: 'domcontentloaded' })
    await assertNotLogin(page, 'Sesion demo persistente')
    await waitForVisibleText(page, 'La Taberna del Puerto', 'Sesion demo persistente')
    await assertLocatorExists(page, 'a[href="/dashboard/vinos"][aria-current="page"]', 'Navegacion dashboard marca Vinos activa')

    await context.close()

    const cleanContext = await browser.newContext()
    const cleanPage = await cleanContext.newPage()
    await cleanPage.goto(`${baseUrl}/dashboard?demo_presentacion=1`, { waitUntil: 'domcontentloaded' })
    await assertNotLogin(cleanPage, 'Demo gerente directa')
    await waitForVisibleText(cleanPage, 'Vista gerente - Demo La Taberna', 'Demo gerente directa')
    await cleanContext.close()
  } finally {
    await browser.close()
  }
}

for (const check of checks) {
  const startedAt = Date.now()
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    const elapsed = Date.now() - startedAt
    const noIndex = response.headers.get('x-robots-tag') || ''
    const securityOk = response.headers.get('x-content-type-options') === 'nosniff'
    const privateOk = !check.private || noIndex.includes('noindex')
    let contentOk = true

    if (check.json) {
      const body = await response.json()
      contentOk = check.expectJson ? check.expectJson(body) : true
    } else if (check.expectText?.length) {
      const body = await response.text()
      contentOk = hasExpectedText(body, check.expectText)
    }

    const ok = response.ok && securityOk && privateOk && contentOk
    if (!ok) failures += 1
    const reason = ok ? '' : ` security=${securityOk} private=${privateOk} content=${contentOk}`
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.label} ${response.status} ${elapsed}ms${reason}`)
  } catch (error) {
    failures += 1
    console.log(`FAIL ${check.label} ${error.message}`)
  }
}

if (runBrowserSmoke) {
  try {
    await runBrowserChecks()
  } catch (error) {
    failures += 1
    console.log(`FAIL Flujos navegador Carta Viva ${error.message}`)
  }
} else {
  console.log('SKIP Flujos navegador Carta Viva (usa SMOKE_BROWSER=1 para activarlo).')
}

if (failures) {
  console.error(`\nSmoke test fallido: ${failures} comprobaciones.`)
  process.exitCode = 1
} else {
  console.log(`\nSmoke test correcto en ${baseUrl}.`)
}
