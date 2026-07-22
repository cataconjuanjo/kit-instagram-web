import { limpiarTextoPublico } from './publicText'

const TIPOS_SOCIALES = new Set(['instagram', 'facebook'])

export function crearQueryCartaHub({ demoPresentacion = false, pruebaToken = '' } = {}) {
  const params = new URLSearchParams()
  if (demoPresentacion) params.set('demo_presentacion', '1')
  if (pruebaToken) params.set('prueba', pruebaToken)

  const query = params.toString()
  return query ? `?${query}` : ''
}

export function crearLinksSocialesHub(restaurante = {}, links = []) {
  const linksBase = [
    restaurante.instagram_url && { id: 'instagram-url', tipo: 'instagram', url: restaurante.instagram_url },
    restaurante.facebook_url && { id: 'facebook-url', tipo: 'facebook', url: restaurante.facebook_url },
    ...links.filter(link => TIPOS_SOCIALES.has(link.tipo)),
  ].filter(Boolean)

  return linksBase.filter((link, index, lista) => {
    const clave = `${link.tipo}-${link.url}`
    return lista.findIndex(item => `${item.tipo}-${item.url}` === clave) === index
  })
}

export function crearLinksPrincipalesHub(links = []) {
  return links.filter(link => !TIPOS_SOCIALES.has(link.tipo))
}

export function esLinkCartaHub(link = {}) {
  const tituloLimpio = limpiarTextoPublico(link.titulo).toLowerCase()
  return link.tipo === 'carta'
    || link.tipo === 'carta_vinos'
    || link.url === '#carta'
    || tituloLimpio.includes('carta de vinos')
}

export function hrefLinkHub(link = {}, restauranteSlug = '', queryCarta = '') {
  if (esLinkCartaHub(link)) {
    return `/carta/${restauranteSlug}${queryCarta}`
  }

  return link.url || '#'
}

export function targetLinkHub(href = '') {
  return href.startsWith('/') ? '_self' : '_blank'
}
