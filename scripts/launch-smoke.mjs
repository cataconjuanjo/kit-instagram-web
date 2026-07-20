const baseUrl = (process.env.SMOKE_BASE_URL || 'https://www.cataconjuanjo.com').replace(/\/$/, '')
const demoSlug = process.env.SMOKE_DEMO_SLUG || 'taberna-del-puerto'

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

if (failures) {
  console.error(`\nSmoke test fallido: ${failures} comprobaciones.`)
  process.exitCode = 1
} else {
  console.log(`\nSmoke test correcto en ${baseUrl}.`)
}
