import { supabaseAdmin } from './supabaseAdmin'

const FALLBACK_OG_IMAGE = '/assets/og-carta-viva-2026.jpg'
const SELECT_RESTAURANTE_SEO = [
  'slug', 'nombre', 'ciudad', 'logo_url', 'banner_url',
  'hub_activo', 'carta_publica_activa',
].join(', ')

function slugValido(slug) {
  return /^[a-z0-9_-]{1,120}$/i.test(String(slug || '').trim())
}

function limpiarTexto(valor, fallback = '') {
  return String(valor || fallback || '').replace(/\s+/g, ' ').trim()
}

function normalizarImagen(valor) {
  const raw = String(valor || '').trim()
  if (!raw) return FALLBACK_OG_IMAGE
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : FALLBACK_OG_IMAGE
  } catch {
    return FALLBACK_OG_IMAGE
  }
}

function noIndexPublico() {
  return {
    index: false,
    follow: true,
    googleBot: {
      index: false,
      follow: true,
      noimageindex: false,
    },
  }
}

function metadataFallback(tipo, slug) {
  const canonical = tipo === 'hub' ? `/r/${slug}` : `/carta/${slug}`
  return {
    title: tipo === 'hub' ? 'Hub Carta Viva' : 'Carta de vinos Carta Viva',
    description: 'Experiencia Carta Viva para consultar carta, enlaces y recomendaciones del restaurante.',
    alternates: { canonical },
    robots: noIndexPublico(),
    openGraph: {
      title: tipo === 'hub' ? 'Hub Carta Viva' : 'Carta de vinos Carta Viva',
      description: 'Carta digital y experiencia de vino para restaurantes.',
      url: canonical,
      siteName: 'Carta Viva',
      type: 'website',
      images: [{ url: FALLBACK_OG_IMAGE, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: tipo === 'hub' ? 'Hub Carta Viva' : 'Carta de vinos Carta Viva',
      description: 'Carta digital y experiencia de vino para restaurantes.',
      images: [FALLBACK_OG_IMAGE],
    },
  }
}

async function cargarRestauranteSeo(slug) {
  if (!slugValido(slug)) return null
  const { data, error } = await supabaseAdmin
    .from('restaurantes')
    .select(SELECT_RESTAURANTE_SEO)
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('[public-metadata:restaurante]', {
      slug,
      code: error.code || '',
      message: error.message || 'No se pudo cargar metadata publica',
    })
    return null
  }

  return data || null
}

export async function metadataCartaPublica(slug) {
  const restaurante = await cargarRestauranteSeo(slug)
  if (!restaurante) return metadataFallback('carta', slug)

  const nombre = limpiarTexto(restaurante.nombre, 'restaurante')
  const ciudad = limpiarTexto(restaurante.ciudad)
  const canonical = `/carta/${restaurante.slug || slug}`
  const title = `Carta de vinos de ${nombre}`
  const description = ciudad
    ? `Carta digital de vinos de ${nombre} en ${ciudad}. Consulta vinos, precios y recomendaciones desde Carta Viva.`
    : `Carta digital de vinos de ${nombre}. Consulta vinos, precios y recomendaciones desde Carta Viva.`
  const image = normalizarImagen(restaurante.banner_url || restaurante.logo_url)

  return {
    title,
    description,
    alternates: { canonical },
    robots: noIndexPublico(),
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Carta Viva',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export async function metadataHubPublico(slug) {
  const restaurante = await cargarRestauranteSeo(slug)
  if (!restaurante) return metadataFallback('hub', slug)

  const nombre = limpiarTexto(restaurante.nombre, 'restaurante')
  const ciudad = limpiarTexto(restaurante.ciudad)
  const canonical = `/r/${restaurante.slug || slug}`
  const title = `${nombre} en Carta Viva`
  const description = ciudad
    ? `Hub digital de ${nombre} en ${ciudad}: carta, enlaces y experiencia de vino en Carta Viva.`
    : `Hub digital de ${nombre}: carta, enlaces y experiencia de vino en Carta Viva.`
  const image = normalizarImagen(restaurante.banner_url || restaurante.logo_url)

  return {
    title,
    description,
    alternates: { canonical },
    robots: noIndexPublico(),
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Carta Viva',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}
