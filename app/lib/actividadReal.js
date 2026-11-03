import { formatoFechaCorta } from './formatoEs'

export function actividadRealDesdeISO(restaurante) {
  if (!restaurante?.actividad_real_desde) return null
  const fecha = new Date(restaurante.actividad_real_desde)
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString()
}

export function maxFechaISO(...fechas) {
  const validas = fechas
    .filter(Boolean)
    .map(fecha => new Date(fecha))
    .filter(fecha => !Number.isNaN(fecha.getTime()))

  if (!validas.length) return null
  return new Date(Math.max(...validas.map(fecha => fecha.getTime()))).toISOString()
}

export function etiquetaActividadReal(restaurante) {
  const desde = actividadRealDesdeISO(restaurante)
  if (!desde) return 'No iniciada'
  // A7: "1/1/2025" -> "1 ene 2025" via helper canonico es-ES.
  return formatoFechaCorta(desde)
}
