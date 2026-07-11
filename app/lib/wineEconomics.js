export const DEFAULT_WINE_ECONOMICS = {
  ivaVentaPct: 10,
  costeIncluyeIva: false,
  pvpIncluyeIva: true,
  margenObjetivoBotellaPct: 65,
  margenObjetivoCopaPct: 70,
  copasPorBotella: 5,
  mermaCopaPct: 10,
  precioMinimoCopa: 4.5,
}

export const BY_THE_GLASS_REFERENCE = {
  source: 'Dearden, Guo and Meyerhoefer, Journal of Wine Economics, 2021',
  scope: 'Restaurantes de Nueva York; correlacion condicionada, no efecto causal garantizado.',
  bottlePriceLiftPct: 5,
  bottleMarginLiftPct: 12.2,
  markupLiftPct: 14,
  usage: 'Referencia externa para simular escenarios de botella + copa, no promesa automatica de resultado.',
}

export const POSITIONING_MARKUP_REFERENCE = {
  source: 'Livat and Remaud, Academy of Wine Business Research, 2016',
  scope: 'Encuesta internacional a sommeliers; mark-up declarado por segmentos de coste.',
  finding: 'El mark-up depende mucho del coste del vino, del ticket medio, del estilo fine dining y del efecto hotel.',
  usage: 'Referencia externa para ajustar el margen objetivo por posicionamiento y banda de coste, no promesa automatica.',
}

export function numero(valor) {
  return Number(valor) || 0
}

function textoNormalizado(valor = '') {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function redondear(valor, decimales = 2) {
  const factor = 10 ** decimales
  return Math.round(numero(valor) * factor) / factor
}

export function normalizarEconomia(config = {}) {
  return { ...DEFAULT_WINE_ECONOMICS, ...(config || {}) }
}

export function quitarIva(valor, ivaPct = DEFAULT_WINE_ECONOMICS.ivaVentaPct) {
  const base = 1 + numero(ivaPct) / 100
  return base ? redondear(numero(valor) / base, 4) : numero(valor)
}

export function anadirIva(valor, ivaPct = DEFAULT_WINE_ECONOMICS.ivaVentaPct) {
  return redondear(numero(valor) * (1 + numero(ivaPct) / 100), 4)
}

export function precioNetoVenta(precio, config = {}) {
  const economia = normalizarEconomia(config)
  return economia.pvpIncluyeIva ? quitarIva(precio, economia.ivaVentaPct) : numero(precio)
}

export function costeNetoCompra(coste, config = {}) {
  const economia = normalizarEconomia(config)
  return economia.costeIncluyeIva ? quitarIva(coste, economia.ivaVentaPct) : numero(coste)
}

export function beneficioBruto(precioVenta, costeCompra, config = {}) {
  return redondear(precioNetoVenta(precioVenta, config) - costeNetoCompra(costeCompra, config), 2)
}

export function margenBrutoPct(precioVenta, costeCompra, config = {}) {
  const precio = precioNetoVenta(precioVenta, config)
  if (!precio) return 0
  return redondear((beneficioBruto(precioVenta, costeCompra, config) / precio) * 100, 2)
}

export function beverageCostPct(precioVenta, costeCompra, config = {}) {
  const precio = precioNetoVenta(precioVenta, config)
  if (!precio) return 0
  return redondear((costeNetoCompra(costeCompra, config) / precio) * 100, 2)
}

export function copasVendibles(config = {}) {
  const economia = normalizarEconomia(config)
  return Math.max(1, numero(economia.copasPorBotella) * (1 - numero(economia.mermaCopaPct) / 100))
}

export function precioCopaObjetivo(costeCompra, config = {}) {
  const economia = normalizarEconomia(config)
  const coste = costeNetoCompra(costeCompra, economia)
  const margenObjetivo = Math.min(95, Math.max(1, numero(economia.margenObjetivoCopaPct))) / 100
  const base = (coste / copasVendibles(economia)) / (1 - margenObjetivo)
  const bruto = economia.pvpIncluyeIva ? anadirIva(base, economia.ivaVentaPct) : base
  const sugerido = Math.max(numero(economia.precioMinimoCopa), bruto)
  return redondear(Math.ceil(sugerido * 2) / 2, 2)
}

export function ticketMedioComida(restaurante = {}) {
  restaurante = restaurante || {}
  return numero(restaurante.ticket_medio_comida || restaurante.ticket_comida || restaurante.ticket_medio)
}

export function inferirPosicionamientoRestaurante(restaurante = {}) {
  restaurante = restaurante || {}
  const ticket = ticketMedioComida(restaurante)
  const texto = textoNormalizado([
    restaurante.posicionamiento,
    restaurante.estilo,
    restaurante.tipo_restaurante,
    restaurante.tipo,
    restaurante.nombre,
    restaurante.descripcion,
  ].filter(Boolean).join(' '))
  const hotel = Boolean(restaurante.es_hotel || restaurante.hotel || texto.includes('hotel'))
  const fineDining = Boolean(
    restaurante.fine_dining ||
    texto.includes('fine dining') ||
    texto.includes('gastronom') ||
    texto.includes('alta cocina') ||
    ticket >= 55
  )
  const casual = Boolean(
    texto.includes('casual') ||
    texto.includes('bistro') ||
    texto.includes('taberna') ||
    texto.includes('bar') ||
    (ticket > 0 && ticket < 28)
  )

  if (hotel && fineDining) return { key: 'hotel_fine_dining', label: 'Hotel / gastronomico', ticket, ajustePct: 4 }
  if (fineDining) return { key: 'fine_dining', label: 'Gastronomico', ticket, ajustePct: 3 }
  if (hotel) return { key: 'hotel', label: 'Hotel', ticket, ajustePct: 2 }
  if (casual) return { key: 'casual', label: 'Casual', ticket, ajustePct: -2 }
  if (ticket >= 40) return { key: 'ticket_medio_alto', label: 'Ticket medio alto', ticket, ajustePct: 1 }
  return { key: 'equilibrado', label: 'Equilibrado', ticket, ajustePct: 0 }
}

export function ajusteMargenPorCoste(costeCompra) {
  const coste = costeNetoCompra(costeCompra)
  if (!coste) return { key: 'sin_coste', label: 'Sin coste', ajustePct: 0 }
  if (coste <= 10) return { key: 'entrada', label: 'Entrada', ajustePct: 2 }
  if (coste <= 20) return { key: 'medio', label: 'Medio', ajustePct: 1 }
  if (coste <= 30) return { key: 'medio_alto', label: 'Medio alto', ajustePct: 0 }
  if (coste <= 50) return { key: 'premium', label: 'Premium', ajustePct: -2 }
  return { key: 'alta_gama', label: 'Alta gama', ajustePct: -4 }
}

export function margenObjetivoContextual(margenBasePct, costeCompra, restaurante = {}) {
  restaurante = restaurante || {}
  const posicionamiento = inferirPosicionamientoRestaurante(restaurante)
  const bandaCoste = ajusteMargenPorCoste(costeCompra)
  const objetivo = Math.min(78, Math.max(48, numero(margenBasePct) + posicionamiento.ajustePct + bandaCoste.ajustePct))
  return {
    objetivo: redondear(objetivo, 2),
    base: numero(margenBasePct),
    posicionamiento,
    bandaCoste,
    referencia: POSITIONING_MARKUP_REFERENCE,
  }
}

export function valorStockCoste(stock, costeCompra, config = {}) {
  return redondear(numero(stock) * costeNetoCompra(costeCompra, config), 2)
}

export function snapshotEconomicoVino(vino = {}, config = {}) {
  const precioBotella = numero(vino.precio_botella)
  const precioCopa = numero(vino.precio_copa)
  const coste = numero(vino.coste_compra)
  return {
    precio_botella_snapshot: redondear(precioBotella, 2),
    precio_copa_snapshot: redondear(precioCopa, 2),
    coste_snapshot: redondear(coste, 2),
    stock_snapshot: Math.round(numero(vino.stock)),
    margen_snapshot_pct: margenBrutoPct(precioBotella, coste, config),
    beneficio_bruto_snapshot: beneficioBruto(precioBotella, coste, config),
    beverage_cost_snapshot_pct: beverageCostPct(precioBotella, coste, config),
  }
}
