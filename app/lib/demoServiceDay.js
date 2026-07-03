import { maxFechaISO } from './actividadReal'

export function esDemoTaberna(restaurante) {
  return restaurante?.slug === 'taberna-del-puerto' || restaurante?.email === 'demo@taberna-del-puerto.com'
}

function inicioDiaISO(fecha) {
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function finDiaISO(fecha) {
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return null
  d.setHours(24, 0, 0, 0)
  return d.toISOString()
}

function filtrarTipo(query, tipo) {
  return tipo ? query.eq('tipo', tipo) : query
}

export function aplicarVentana(query, ventana) {
  let siguiente = query.gte('created_at', ventana.desde)
  if (ventana.hasta) siguiente = siguiente.lt('created_at', ventana.hasta)
  return siguiente
}

export async function resolverVentanaDiaOperativo(supabase, restaurante, { tipo } = {}) {
  const hoy = inicioDiaISO(new Date())
  const desdeHoy = restaurante?.actividad_real_desde
    ? maxFechaISO(hoy, restaurante.actividad_real_desde)
    : hoy

  let consultaHoy = supabase
    .from('estadisticas')
    .select('created_at', { count: 'exact', head: true })
    .eq('restaurante_id', restaurante.id)
    .gte('created_at', desdeHoy)
  consultaHoy = filtrarTipo(consultaHoy, tipo)

  const { count } = await consultaHoy
  if (count || !esDemoTaberna(restaurante)) {
    return { desde: desdeHoy, hasta: null, etiqueta: 'hoy' }
  }

  let consultaUltimoDia = supabase
    .from('estadisticas')
    .select('created_at')
    .eq('restaurante_id', restaurante.id)
    .order('created_at', { ascending: false })
    .limit(1)
  consultaUltimoDia = filtrarTipo(consultaUltimoDia, tipo)

  const { data } = await consultaUltimoDia
  const ultimaFecha = data?.[0]?.created_at
  const desde = inicioDiaISO(ultimaFecha) || desdeHoy
  const hasta = finDiaISO(ultimaFecha)

  return { desde, hasta, etiqueta: ultimaFecha ? 'ultimo_dia_demo' : 'hoy' }
}
