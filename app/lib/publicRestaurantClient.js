export function urlRestaurantePublico(slug, {
  carta = false,
  hub = false,
  demoPresentacion = false,
  pruebaToken = '',
  previewBorrador = false,
} = {}) {
  const query = new URLSearchParams()
  if (carta) query.set('carta', '1')
  if (hub) query.set('hub', '1')
  if (demoPresentacion) query.set('demo_presentacion', '1')
  if (pruebaToken) query.set('prueba', pruebaToken)
  if (previewBorrador) query.set('preview', '1')

  const queryString = query.toString()
  const path = `/api/public/restaurante/${encodeURIComponent(slug)}`
  return queryString ? `${path}?${queryString}` : path
}

export async function cargarRestaurantePublico(slug, {
  jsonSoloSiOk = false,
  authToken = '',
  ...urlOptions
} = {}) {
  const headers = {}
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const res = await fetch(urlRestaurantePublico(slug, urlOptions), {
    headers: Object.keys(headers).length ? headers : undefined,
  })
  const data = jsonSoloSiOk && !res.ok ? {} : await res.json().catch(() => ({}))
  return { res, data, restaurante: data.restaurante }
}

export function evaluarRespuestaRestaurantePublico(res, data, {
  aceptarNoLista = false,
  prefijoError = 'GET restaurante publico',
} = {}) {
  if (res.status === 404) return { type: 'not_found' }
  if (aceptarNoLista && res.status === 409) return { type: 'not_ready', message: data.error }
  if (!res.ok) throw new Error(`${prefijoError} ${res.status}`)
  if (!data.restaurante) return { type: 'not_found' }
  return null
}
