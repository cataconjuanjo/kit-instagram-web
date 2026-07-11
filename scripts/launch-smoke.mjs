const baseUrl = (process.env.SMOKE_BASE_URL || 'https://www.cataconjuanjo.com').replace(/\/$/, '')

const checks = [
  { path: '/', label: 'Web principal' },
  { path: '/cartavinos', label: 'Landing Carta Viva' },
  { path: '/login', label: 'Login privado', private: true },
  { path: '/dashboard', label: 'Dashboard', private: true },
  { path: '/admin/consultoria', label: 'Radar consultor', private: true },
  { path: '/carta/lo-de-carmen', label: 'Carta pública real' },
  { path: '/camarero/lo-de-carmen', label: 'Modo camarero' },
  { path: '/api/health', label: 'Salud de servicios', health: true },
]

let failures = 0

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
    let healthOk = true
    if (check.health) {
      const body = await response.json()
      healthOk = body.status === 'ok'
    }
    const privateOk = !check.private || noIndex.includes('noindex')
    const ok = response.ok && securityOk && privateOk && healthOk
    if (!ok) failures += 1
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.label} ${response.status} ${elapsed}ms`)
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
