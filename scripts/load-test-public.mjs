const DEFAULT_BASE_URL = 'https://www.cataconjuanjo.com'
const DEFAULT_CONCURRENCY = 100

function argValue(name, fallback = '') {
  const prefix = `--${name}=`
  const found = process.argv.find(arg => arg.startsWith(prefix))
  return found ? found.slice(prefix.length) : fallback
}

function intArg(name, fallback) {
  const raw = argValue(name, '')
  const parsed = Number(raw || process.env[`LOAD_TEST_${name.toUpperCase()}`] || fallback)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const baseUrl = (argValue('base-url', process.env.LOAD_TEST_BASE_URL || DEFAULT_BASE_URL)).replace(/\/$/, '')
const concurrency = intArg('concurrency', DEFAULT_CONCURRENCY)
const slug = argValue('slug', process.env.LOAD_TEST_SLUG || 'gelin-restaurante')
const scenario = argValue('scenario', process.env.LOAD_TEST_SCENARIO || 'restaurant')

const restaurantPaths = [
  `/carta/${slug}`,
  `/api/public/restaurante/${slug}?carta=1`,
  `/r/${slug}`,
  `/api/public/restaurante/${slug}?hub=1`,
]

const kioskPaths = [
  `/kiosko/${slug}`,
  `/api/kiosko/${slug}/meta`,
  `/api/kiosko/${slug}/vinos`,
  `/api/kiosko/${slug}/gourmet`,
]

const scenarioPaths = scenario === 'kiosk'
  ? kioskPaths
  : scenario === 'both'
    ? [...restaurantPaths, ...kioskPaths]
    : restaurantPaths

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))]
}

async function timedGet(path, userId) {
  const started = performance.now()
  const url = `${baseUrl}${path}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': `CartaVivaLoadTest/1.0 user-${userId}`,
      },
    })
    await res.arrayBuffer()
    return {
      ok: res.ok || (res.status >= 300 && res.status < 400),
      status: res.status,
      path,
      cache: res.headers.get('x-vercel-cache') || 'none',
      ms: Math.round(performance.now() - started),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      path,
      cache: 'error',
      ms: Math.round(performance.now() - started),
      error: error.message,
    }
  }
}

async function runUser(userId) {
  const paths = scenarioPaths
  const results = []
  for (const path of paths) {
    results.push(await timedGet(path, userId))
  }
  return results
}

const started = performance.now()
const results = (await Promise.all(
  Array.from({ length: concurrency }, (_, index) => runUser(index + 1))
)).flat()
const totalMs = Math.round(performance.now() - started)

const durations = results.map(item => item.ms)
const failures = results.filter(item => !item.ok)
const statusCounts = new Map()
const cacheCounts = new Map()
const pathStats = new Map()
for (const result of results) {
  statusCounts.set(result.status, (statusCounts.get(result.status) || 0) + 1)
  cacheCounts.set(result.cache, (cacheCounts.get(result.cache) || 0) + 1)
  const current = pathStats.get(result.path) || {
    count: 0,
    failures: 0,
    durations: [],
    cacheCounts: new Map(),
    statusCounts: new Map(),
  }
  current.count += 1
  if (!result.ok) current.failures += 1
  current.durations.push(result.ms)
  current.cacheCounts.set(result.cache, (current.cacheCounts.get(result.cache) || 0) + 1)
  current.statusCounts.set(result.status, (current.statusCounts.get(result.status) || 0) + 1)
  pathStats.set(result.path, current)
}

console.log(`Base URL: ${baseUrl}`)
console.log(`Slug: ${slug}`)
console.log(`Escenario: ${scenario}`)
console.log(`Usuarios simultaneos: ${concurrency}`)
console.log(`Requests totales: ${results.length}`)
console.log(`Duracion total: ${totalMs} ms`)
console.log(`Latencia p50/p95/max: ${percentile(durations, 50)} / ${percentile(durations, 95)} / ${Math.max(...durations)} ms`)
console.log(`Estados: ${JSON.stringify(Object.fromEntries(statusCounts))}`)
console.log(`x-vercel-cache: ${JSON.stringify(Object.fromEntries(cacheCounts))}`)
console.log('Por ruta:')
for (const [path, stats] of pathStats) {
  console.log([
    `- ${path}`,
    `count=${stats.count}`,
    `p95=${percentile(stats.durations, 95)}ms`,
    `status=${JSON.stringify(Object.fromEntries(stats.statusCounts))}`,
    `cache=${JSON.stringify(Object.fromEntries(stats.cacheCounts))}`,
  ].join(' '))
}

if (failures.length) {
  console.log('Fallos:')
  for (const failure of failures.slice(0, 10)) {
    console.log(`- ${failure.status} ${failure.path} ${failure.error || ''}`.trim())
  }
  process.exitCode = 1
}
