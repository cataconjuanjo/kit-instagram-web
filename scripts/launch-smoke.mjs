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
    path: `/api/public/restaurante/${demoSlug}?hub=1`,
    label: 'Datos hub demo',
    json: true,
    expectJson: body => body?.restaurante?.slug === demoSlug,
  },
  {
    path: `/api/public/restaurante/${demoSlug}?carta=1`,
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
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 })
  console.log(`PASS ${label} contiene "${text}"`)
}

async function assertNotLogin(page, label) {
  if (new URL(page.url()).pathname === '/login') throw new Error(`${label} termino en /login`)
}

async function runBrowserChecks() {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()

  try {
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

    await page.goto(`${baseUrl}/dashboard/vinos`, { waitUntil: 'domcontentloaded' })
    await assertNotLogin(page, 'Sesion demo persistente')
    await waitForVisibleText(page, 'La Taberna del Puerto', 'Sesion demo persistente')

    await context.close()

    const cleanContext = await browser.newContext()
    const cleanPage = await cleanContext.newPage()
    await cleanPage.goto(`${baseUrl}/dashboard?demo_presentacion=1`, { waitUntil: 'domcontentloaded' })
    await assertNotLogin(cleanPage, 'Demo gerente directa')
    await waitForVisibleText(cleanPage, 'Vista gerente - Demo La Taberna', 'Demo gerente directa')
    await waitForVisibleText(cleanPage, 'La Taberna del Puerto', 'Dashboard demo directo')
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
    console.log(`FAIL Flujo navegador demo gerente ${error.message}`)
  }
} else {
  console.log('SKIP Flujo navegador demo gerente (usa SMOKE_BROWSER=1 para activarlo).')
}

if (failures) {
  console.error(`\nSmoke test fallido: ${failures} comprobaciones.`)
  process.exitCode = 1
} else {
  console.log(`\nSmoke test correcto en ${baseUrl}.`)
}
