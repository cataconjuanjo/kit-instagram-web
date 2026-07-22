export function numeroContexto(valor) {
  const numero = Number(String(valor || '').replace(',', '.'))
  return Number.isFinite(numero) && numero > 0 ? numero : 0
}

export function precioBotellaVenta(vino) {
  return Number(vino?.precio_botella) || 0
}

export function formatoVentaParaVino(vino, formatoContexto = 'botella') {
  if (formatoContexto === 'copa' && Number(vino?.precio_copa) > 0) return 'copa'
  return 'botella'
}

export function precioUnidadVenta(vino, formato) {
  return formato === 'copa'
    ? Number(vino?.precio_copa) || 0
    : precioBotellaVenta(vino)
}

export function calcularTicketMesaVenta({ platosMesaVenta = [], consultaVenta = '' } = {}) {
  if (platosMesaVenta.length) {
    return platosMesaVenta.reduce((sum, plato) => sum + (Number(plato.precio) || 0), 0)
  }

  const preciosEnConsulta = String(consultaVenta || '')
    .match(/\((\d+(?:[.,]\d{1,2})?)\s*(?:eur|\u20ac)\)/gi)
    ?.map(match => Number(match.replace(/[^\d,.]/g, '').replace(',', '.')) || 0) || []

  return preciosEnConsulta.reduce((sum, precio) => sum + precio, 0)
}

export function calcularRangoBotellaParaTicket(ticketComida, precioMedio) {
  if (!ticketComida) {
    return {
      min: Math.max(18, precioMedio * 0.65),
      ideal: precioMedio,
      max: Math.max(32, precioMedio * 1.25),
      lectura: 'Sin ticket de comida definido: uso el precio medio de la carta como referencia.',
    }
  }

  const min = Math.max(18, ticketComida * 0.35)
  const ideal = Math.max(22, ticketComida * 0.55)
  const max = Math.max(30, ticketComida * 0.8)

  return {
    min,
    ideal,
    max,
    lectura: `Mesa estimada ${ticketComida.toFixed(2)} EUR: botella l\u00f3gica entre ${min.toFixed(0)} y ${max.toFixed(0)} EUR.`,
  }
}

export function calcularTicketReferenciaVenta({ restaurante = {}, ticketMesa = 0, platosVenta = [], vinos = [] } = {}) {
  const ticketConfigurado = Number(restaurante?.ticket_medio || restaurante?.ticket_medio_comida || restaurante?.ticket_comida) || 0
  if (ticketConfigurado > 0) return { valor: ticketConfigurado, fuente: 'configurado' }
  if (ticketMesa > 0) return { valor: ticketMesa, fuente: 'mesa' }

  const platosConPrecio = platosVenta.filter(plato => Number(plato.precio) > 0)
  if (platosConPrecio.length) {
    const mediaPlato = platosConPrecio.reduce((sum, plato) => sum + Number(plato.precio), 0) / platosConPrecio.length
    return { valor: Math.round(mediaPlato * 2.5), fuente: 'estimado' }
  }

  const vinosConPrecio = vinos.filter(vino => vino?.activo !== false && vino?.stock !== 0 && precioBotellaVenta(vino) > 0)
  const precioMedioCarta = vinosConPrecio.length
    ? vinosConPrecio.reduce((sum, vino) => sum + precioBotellaVenta(vino), 0) / vinosConPrecio.length
    : 30
  return { valor: Math.max(40, precioMedioCarta / 0.75), fuente: 'carta' }
}

export function calcularGamasVenta(ticketReferencia) {
  const ticket = Number(ticketReferencia) || 0
  const tBaja = Math.max(22, ticket * 0.60)
  const tMedia = Math.max(tBaja + 10, ticket * 1.05)
  const tAlta = Math.max(tMedia + 14, ticket * 1.65)
  const tMuyAlta = Math.max(tAlta + 24, ticket * 2.50)
  const rangos = [
    { id: 'auto', label: 'Sin l\u00edmite', min: 0, max: Infinity, helper: 'sin filtro' },
    { id: 'baja', label: 'Baja', min: 0, max: tBaja },
    { id: 'media', label: 'Media', min: tBaja, max: tMedia },
    { id: 'alta', label: 'Alta', min: tMedia, max: tAlta },
    { id: 'muy_alta', label: 'Muy alta', min: tAlta, max: tMuyAlta },
    { id: 'premium', label: 'Premium', min: tMuyAlta, max: Infinity },
  ]

  return rangos.map(gama => ({
    ...gama,
    helper: gama.helper || (gama.max === Infinity
      ? `desde ${Math.round(gama.min)} EUR`
      : gama.min === 0
        ? `hasta ${Math.round(gama.max)} EUR`
        : `${Math.round(gama.min)}-${Math.round(gama.max)} EUR`),
  }))
}

export function calcularGamaActivaVenta(gamas = [], gamaPerfil = 'auto') {
  return gamas.find(gama => gama.id === gamaPerfil) || gamas[0]
}

export function calcularPrecioMedioVinosVenta(vinos = [], esElegible = () => false) {
  const disponibles = vinos.filter(vino => esElegible(vino))
  if (!disponibles.length) return 28
  return disponibles.reduce((sum, vino) => sum + precioBotellaVenta(vino), 0) / disponibles.length
}
