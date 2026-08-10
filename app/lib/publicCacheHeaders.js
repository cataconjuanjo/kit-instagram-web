export function publicCdnCacheHeaders({
  browserMaxAge = 0,
  cdnMaxAge = 60,
  staleWhileRevalidate = 300,
} = {}) {
  const browserCache = browserMaxAge > 0
    ? `public, max-age=${browserMaxAge}`
    : 'public, max-age=0, must-revalidate'

  return {
    'Cache-Control': browserCache,
    'Vercel-CDN-Cache-Control': `public, s-maxage=${cdnMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
  }
}

export function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
  }
}
