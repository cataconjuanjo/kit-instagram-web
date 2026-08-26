import { maxFechaISO } from './actividadReal'

export function esDemoTaberna(restaurante) {
  return restaurante?.slug === 'taberna-del-puerto' || restaurante?.email === 'demo@taberna-del-puerto.com'
}

const TZ = 'Europe/Madrid'

function midnightMadridUTC(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  if (Number.isNaN(d.getTime())) return null
  // Date in Madrid timezone — sv locale gives YYYY-MM-DD reliably
  const dateStr = new Intl.DateTimeFormat('sv', { timeZone: TZ }).format(d)
  // Compute offset at noon (DST-safe: Spain transitions at 2am local, not noon)
  const noonUTC = new Date(`${dateStr}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(noonUTC)
  const get = type => parts.find(p => p.type === type)?.value ?? '00'
  const noonMadridISO = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`
  const offsetMs = noonUTC.getTime() - new Date(noonMadridISO).getTime()
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + offsetMs)
}

function inicioDiaISO(fecha) {
  const d = midnightMadridUTC(fecha || new Date())
  return d ? d.toISOString() : null
}

function finDiaISO(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  if (Number.isNaN(d.getTime())) return null
  const dateStr = new Intl.DateTimeFormat('sv', { timeZone: TZ }).format(d)
  const [y, m, day] = dateStr.split('-').map(Number)
  // Use noon of the next calendar day in Madrid as anchor to compute its midnight
  const nextMidnight = midnightMadridUTC(new Date(Date.UTC(y, m - 1, day + 1, 12, 0, 0)))
  return nextMidnight ? nextMidnight.toISOString() : null
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
