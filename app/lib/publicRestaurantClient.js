export function urlRestaurantePublico(slug, {
  carta = false,
  pruebaToken = '',
} = {}) {
  const query = new URLSearchParams()
  if (carta) query.set('carta', '1')
  if (pruebaToken) query.set('prueba', pruebaToken)

  const queryString = query.toString()
  const path = `/api/public/restaurante/${encodeURIComponent(slug)}`
  return queryString ? `${path}?${queryString}` : path
}

export async function cargarRestaurantePublico(slug, {
  jsonSoloSiOk = false,
  ...urlOptions
} = {}) {
  const res = await fetch(urlRestaurantePublico(slug, urlOptions))
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
