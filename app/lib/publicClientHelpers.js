export function slugDesdeRuta(routeParams, segmento) {
  const param = routeParams?.slug
  if (Array.isArray(param)) return param[0] || ''
  if (typeof param === 'string') return param
  if (typeof window === 'undefined') return ''
  const partes = window.location.pathname.split('/').filter(Boolean)
  const indice = partes.indexOf(segmento)
  return indice >= 0 ? decodeURIComponent(partes[indice + 1] || '') : ''
}

export function reportarErrorCliente(digest, error) {
  if (typeof window === 'undefined') return
  const message = error instanceof Error ? error.message : String(error || 'Error de carga')
  console.warn(`[${digest}]`, error)
  fetch('/api/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      digest,
      message,
      path: `${window.location.pathname}${window.location.search}`,
    }),
  }).catch(() => {})
}
