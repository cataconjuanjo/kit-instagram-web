export function estadoCartaPublica({ loading, loadError, restaurante, idioma = 'es', textos = {} }) {
  if (loading) {
    return {
      title: textos.cargando || 'CARGANDO',
      text: idioma === 'en' ? 'Preparing the live wine list.' : 'Preparando la carta viva del restaurante.',
      loadingState: true,
    }
  }

  if (loadError?.type === 'network') {
    return {
      title: textos.errorCargaTitulo || 'No hemos podido cargar la carta',
      text: textos.errorCargaTexto || 'Revisa la conexión o vuelve a intentarlo en unos segundos.',
      retryable: true,
    }
  }

  if (loadError?.type === 'not_ready') {
    return {
      title: textos.cartaRevisionTitulo || 'Carta en revisión',
      text: textos.cartaRevisionTexto || 'El restaurante está ajustando su carta antes de volver a publicarla.',
      retryable: true,
    }
  }

  if (!restaurante) {
    return {
      title: textos.noEncontrado || 'Carta no encontrada',
      text: textos.noEncontradoTexto || 'Comprueba que el QR o el enlace sea el último.',
    }
  }

  if (!restaurante.carta_disponible) {
    return {
      title: textos.cartaNoDisponible || 'Carta no disponible',
      text: textos.cartaNoDisponibleTexto || 'El restaurante está revisando su carta.',
      retryable: true,
    }
  }

  return null
}

export function estadoModoCamarero({ loading, loadError, restaurante, slug = '' }) {
  if (loading) {
    return {
      title: 'Preparando sala',
      text: 'Cargando vinos, platos y contexto de servicio.',
      loadingState: true,
    }
  }

  if (loadError?.type === 'network') {
    return {
      title: 'No hemos podido cargar el modo camarero',
      text: 'Revisa la conexión o vuelve a intentarlo en unos segundos.',
      retryable: true,
    }
  }

  if (!restaurante) {
    return {
      title: 'Acceso de sala no encontrado',
      text: 'Comprueba que el enlace pertenece al restaurante correcto o vuelve a abrir el QR interno de sala.',
    }
  }

  if (!restaurante.sala_disponible) {
    return {
      title: 'Modo sala pendiente de activar',
      text: 'Este restaurante todavía no tiene activado el acceso de sala. Puedes abrir la carta pública o pedir al gerente que active el Plan Sala.',
      eyebrow: 'Carta Viva',
      secondaryHref: slug ? `/carta/${slug}` : '',
      secondaryLabel: 'Abrir carta pública',
    }
  }

  return null
}
