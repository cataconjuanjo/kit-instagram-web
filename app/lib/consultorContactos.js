// FASE K — Bloque 1: helpers puros para el registro de contactos.
// No tocan Supabase, no tocan React. Testeables con node --test.

function toTime(valor) {
  if (!valor) return null
  const t = new Date(valor).getTime()
  return Number.isFinite(t) ? t : null
}

function diffDias(desde, hasta = Date.now()) {
  if (!desde) return null
  const d = toTime(desde)
  if (d == null) return null
  const h = typeof hasta === 'number' ? hasta : toTime(hasta)
  if (h == null) return null
  return Math.max(0, Math.floor((h - d) / 86400000))
}

// Devuelve el contacto más reciente de la lista por restaurante.
// Entrada: array de contactos { restaurante_id, ocurrido_en, ... }.
export function ultimoContactoPorRestaurante(contactos = []) {
  const mapa = new Map()
  for (const c of contactos) {
    if (!c || !c.restaurante_id) continue
    const ts = toTime(c.ocurrido_en)
    if (ts == null) continue
    const actual = mapa.get(c.restaurante_id)
    if (!actual || ts > actual._ts) mapa.set(c.restaurante_id, { ...c, _ts: ts })
  }
  const salida = {}
  for (const [k, v] of mapa.entries()) {
    salida[k] = { ocurrido_en: new Date(v._ts).toISOString(), canal: v.canal, proximo_contacto: v.proximo_contacto || null }
  }
  return salida
}

// "Hace N días" desde el último contacto (o null si no hay).
export function diasDesdeUltimoContacto(contactosDelRestaurante = [], ahora = Date.now()) {
  let ultimo = null
  for (const c of contactosDelRestaurante) {
    const ts = toTime(c?.ocurrido_en)
    if (ts != null && (ultimo == null || ts > ultimo)) ultimo = ts
  }
  if (ultimo == null) return null
  return diffDias(ultimo, ahora)
}

// ¿Tiene contacto programado hoy o vencido (proximo_contacto <= hoy)?
export function contactoProgramadoVencido(contactosDelRestaurante = [], ahora = Date.now()) {
  const hoy = new Date(ahora)
  hoy.setHours(0, 0, 0, 0)
  const limite = hoy.getTime()
  for (const c of contactosDelRestaurante) {
    const prox = c?.proximo_contacto ? new Date(c.proximo_contacto).getTime() : null
    if (prox != null && prox <= limite + 86400000 - 1) return true
  }
  return false
}

// ¿Lleva >N días sin ningún contacto registrado?
export function sinContactoDesde(contactosDelRestaurante = [], dias = 14, ahora = Date.now()) {
  const dias_ = diasDesdeUltimoContacto(contactosDelRestaurante, ahora)
  if (dias_ == null) return true // nunca ha habido contacto → cuenta como "sin contacto"
  return dias_ > dias
}

// Añade a un array de contextos de "Mi día" dos tipos nuevos de tareas:
//  - contacto_vencido: para restaurantes con proximo_contacto <= hoy
//  - sin_contacto: para restaurantes reales sin contacto en >14 días
// Se usa en el Radar antes de llamar a seleccionarTareasMiDia.
export function construirSenalesDeContacto(contexto, contactosDelRestaurante = [], { diasUmbral = 14, ahora = Date.now() } = {}) {
  const sobre = { ...contexto }
  sobre.contactoVencido = contactoProgramadoVencido(contactosDelRestaurante, ahora)
  sobre.sinContactoReciente = sinContactoDesde(contactosDelRestaurante, diasUmbral, ahora)
  return sobre
}

// Genera tareas de Mi día a partir de señales de contacto. Se combinan
// con las existentes (propuestas, alertas, costes) en el selector del
// Radar. Excluye demos.
export function tareasMiDiaDesdeContactos(contextos = [], { ahora = Date.now() } = {}) {
  const tareas = []
  for (const c of contextos) {
    if (!c || !c.restaurante || c.isDemoAgregado) continue
    if (c.contactoVencido) {
      tareas.push({
        restaurante: c.restaurante,
        tipo: 'contacto_vencido',
        verbo: 'Contacto programado vencido',
        urgencia: 85,
        euros: Number(c.capitalLiberable) || 0,
        cta: 'Registrar contacto',
        destino: `/admin/restaurante/${c.restaurante.id}?tab=resumen`,
      })
      continue
    }
    if (c.sinContactoReciente && !c.propuestasInteresan && !c.alertasCriticas) {
      tareas.push({
        restaurante: c.restaurante,
        tipo: 'sin_contacto',
        verbo: 'Sin contacto en más de 14 días',
        urgencia: 55,
        euros: Number(c.capitalLiberable) || 0,
        cta: 'Llamar al restaurante',
        destino: `/admin/restaurante/${c.restaurante.id}?tab=resumen`,
      })
    }
  }
  return tareas
}
