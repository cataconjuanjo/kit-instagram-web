export const CONTENIDO_INICIAL = {
  loading: true,
  error: '',
  vinosActivos: 0,
  vinosConPrecio: 0,
  vinosSinPrecio: 0,
  vinosPorCopa: 0,
  platosActivos: 0,
}

export function decimalPublicacion(valor) {
  if (valor === null || valor === undefined || valor === '') return 0
  const numero = Number(String(valor).replace(',', '.'))
  return Number.isFinite(numero) ? numero : 0
}

export function resumirContenidoCarta(vinos = [], platos = []) {
  const vinosActivos = vinos || []
  const vinosConPrecio = vinosActivos.filter(vino => decimalPublicacion(vino.precio_botella) > 0 || decimalPublicacion(vino.precio_copa) > 0)
  const vinosPorCopa = vinosActivos.filter(vino => decimalPublicacion(vino.precio_copa) > 0)
  return {
    loading: false,
    error: '',
    vinosActivos: vinosActivos.length,
    vinosConPrecio: vinosConPrecio.length,
    vinosSinPrecio: Math.max(0, vinosActivos.length - vinosConPrecio.length),
    vinosPorCopa: vinosPorCopa.length,
    platosActivos: (platos || []).length,
  }
}

export function problemasPublicacionCarta(resumen = {}) {
  const problemas = []
  if (!Number(resumen.vinosActivos || 0)) problemas.push('La carta no tiene vinos visibles.')
  if (!Number(resumen.vinosConPrecio || 0)) problemas.push('La carta no tiene precios visibles.')
  return problemas
}

export function puedePublicarCarta(resumen = {}) {
  return problemasPublicacionCarta(resumen).length === 0
}
