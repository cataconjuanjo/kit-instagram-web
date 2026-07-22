function texto(valor, limite = 80) {
  return String(valor || '')
    .trim()
    .replace(/[^\w .-]/g, '')
    .slice(0, limite)
}

function limpiarAtribucion(atribucion = {}) {
  return Object.fromEntries(Object.entries({
    qr_source: texto(atribucion.qr_source || atribucion.source, 40),
    qr_campaign: texto(atribucion.qr_campaign || atribucion.campaign, 80),
    qr_format: texto(atribucion.qr_format || atribucion.format, 40),
    qr_table: texto(atribucion.qr_table || atribucion.table, 40),
    qr_experience: texto(atribucion.qr_experience || atribucion.experience, 60),
  }).filter(([, valor]) => Boolean(valor)))
}

export function leerAtribucionPublica(searchParams) {
  const params = searchParams || new URLSearchParams()
  return limpiarAtribucion({
    qr_source: params.get('cv_source'),
    qr_campaign: params.get('cv_campaign'),
    qr_format: params.get('cv_format'),
    qr_table: params.get('cv_table'),
    qr_experience: params.get('cv_exp'),
  })
}

export function aplicarAtribucionUrl(url, atribucion = {}) {
  if (!url) return ''
  const limpia = limpiarAtribucion(atribucion)
  if (!Object.keys(limpia).length) return url

  try {
    const destino = new URL(url)
    const map = {
      qr_source: 'cv_source',
      qr_campaign: 'cv_campaign',
      qr_format: 'cv_format',
      qr_table: 'cv_table',
      qr_experience: 'cv_exp',
    }
    Object.entries(map).forEach(([key, param]) => {
      if (limpia[key]) destino.searchParams.set(param, limpia[key])
    })
    return destino.toString()
  } catch {
    return url
  }
}
