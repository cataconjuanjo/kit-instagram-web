const MS_DIA = 24 * 60 * 60 * 1000
const PESO_PRIORIDAD = { alta: 3, media: 2, baja: 1 }

function numero(valor) {
  return Number(valor) || 0
}

function fechaValida(valor) {
  if (!valor) return null
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

function diasDesde(valor) {
  const fecha = fechaValida(valor)
  if (!fecha) return null
  return Math.max(0, Math.floor((Date.now() - fecha.getTime()) / MS_DIA))
}

function objeto(valor) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
}

function resumenJson(fila = {}) {
  return objeto(fila.resumen)
}

function kpisResumen(fila = {}) {
  const resumen = resumenJson(fila)
  return objeto(fila.kpis || resumen.kpis)
}

function textoBloqueo(tipo, titulo, detalle, peso = 1) {
  return { tipo, titulo, detalle, peso }
}

function estadoEntrega(fila = {}, preferencias = {}) {
  const status = fila.delivery_status || (fila.sent_at ? 'sent' : 'draft')
  return {
    status,
    channel: fila.delivery_channel || fila.sent_channel || preferencias.channel || 'email',
    enabled: preferencias.enabled !== false,
    recipient_email: fila.recipient_email || preferencias.recipient_email || null,
    sent_at: fila.sent_at || null,
    last_attempt_at: fila.last_send_attempt_at || null,
    error: fila.delivery_error || preferencias.last_error || null,
  }
}

function bloqueosDesdeKpis(kpis = {}, fila = null, preferencias = {}, alertas = []) {
  const bloqueos = []
  const entrega = estadoEntrega(fila || {}, preferencias)

  if (!fila) {
    bloqueos.push(textoBloqueo(
      'sin_foto',
      'Sin foto semanal',
      'No hay resumen semanal guardado para ordenar seguimiento.',
      5
    ))
  }

  if (entrega.status === 'failed') {
    bloqueos.push(textoBloqueo(
      'envio_fallido',
      'Envio semanal fallido',
      entrega.error || 'La rutina semanal no llego al restaurante.',
      5
    ))
  }

  if (entrega.enabled && fila && !entrega.sent_at && !['disabled', 'manual'].includes(entrega.status)) {
    bloqueos.push(textoBloqueo(
      'envio_pendiente',
      'Resumen sin enviar',
      'La foto existe, pero todavia no consta como enviada.',
      2
    ))
  }

  if (numero(kpis.ventas_sin_coste) > 0) {
    bloqueos.push(textoBloqueo(
      'costes',
      'Ventas sin coste',
      `${numero(kpis.ventas_sin_coste)} ventas no defienden margen completo.`,
      4
    ))
  }

  if (numero(kpis.cobertura_economica_pct) > 0 && numero(kpis.cobertura_economica_pct) < 70) {
    bloqueos.push(textoBloqueo(
      'cobertura',
      'Cobertura economica baja',
      `${Math.round(numero(kpis.cobertura_economica_pct))}% de referencias con PVP y coste.`,
      4
    ))
  }

  if (numero(kpis.ventas_tpv_no_atribuidas) > 0) {
    bloqueos.push(textoBloqueo(
      'tpv_no_atribuido',
      'TPV sin atribuir',
      `${numero(kpis.ventas_tpv_no_atribuidas)} ventas reales no conectan con recomendacion.`,
      3
    ))
  }

  if (numero(kpis.tpv_match_pct) > 0 && numero(kpis.tpv_match_pct) < 80) {
    bloqueos.push(textoBloqueo(
      'matching_tpv',
      'Matching TPV debil',
      `${Math.round(numero(kpis.tpv_match_pct))}% de lineas TPV quedan reconocidas.`,
      3
    ))
  }

  const criticas = (alertas || []).filter(alerta => alerta.severidad === 'critica').length
  if (criticas > 0) {
    bloqueos.push(textoBloqueo(
      'alertas_criticas',
      'Alertas criticas abiertas',
      `${criticas} alertas criticas siguen abiertas.`,
      4
    ))
  }

  return bloqueos.sort((a, b) => b.peso - a.peso)
}

function accionSemanal({ fila, kpis, bloqueos, recomendaciones = [], alertas = [] }) {
  const decision = resumenJson(fila).decisiones?.[0]
  if (decision?.titulo) return decision.titulo
  const recomendacion = recomendaciones.find(item => item.prioridad === 'alta') || recomendaciones[0]
  if (recomendacion?.titulo) return recomendacion.titulo
  const alerta = alertas.find(item => item.severidad === 'critica') || alertas[0]
  if (alerta?.titulo) return alerta.titulo
  if (bloqueos[0]?.titulo) return bloqueos[0].titulo
  if (numero(kpis.recuperable_semana) > 0) return 'Convertir dinero por capturar en accion'
  return 'Mantener seguimiento semanal'
}

export function crearLecturaSemanalConsultor({
  restaurante = {},
  resumenSemanal = null,
  preferencias = {},
  alertas = [],
  recomendaciones = [],
} = {}) {
  const kpisRaw = kpisResumen(resumenSemanal || {})
  const kpis = {
    beneficio_bruto: numero(kpisRaw.beneficio_bruto),
    beneficio_recomendacion: numero(kpisRaw.beneficio_recomendacion),
    recuperable_semana: numero(kpisRaw.recuperable_semana),
    oportunidad_anual: numero(kpisRaw.oportunidad_anual),
    ventas_kpi: numero(kpisRaw.ventas_kpi),
    ventas_sin_coste: numero(kpisRaw.ventas_sin_coste),
    ventas_tpv_no_atribuidas: numero(kpisRaw.ventas_tpv_no_atribuidas),
    cobertura_economica_pct: numero(kpisRaw.cobertura_economica_pct),
    tpv_match_pct: numero(kpisRaw.tpv_match_pct),
  }
  const entrega = estadoEntrega(resumenSemanal || {}, preferencias)
  const bloqueos = bloqueosDesdeKpis(kpis, resumenSemanal, preferencias, alertas)
  const dias = diasDesde(resumenSemanal?.updated_at || resumenSemanal?.generated_at || resumenSemanal?.periodo_fin)
  const fotoReciente = dias !== null && dias <= 10
  const score = Math.min(100, Math.round(
    (numero(kpis.recuperable_semana) > 0 ? Math.min(32, numero(kpis.recuperable_semana) / 10) : 0) +
    (numero(kpis.oportunidad_anual) > 0 ? Math.min(28, numero(kpis.oportunidad_anual) / 500) : 0) +
    bloqueos.reduce((sum, bloqueo) => sum + bloqueo.peso * 5, 0) +
    (!fotoReciente ? 12 : 0)
  ))
  const prioridad = score >= 65 ? 'alta' : score >= 35 ? 'media' : 'baja'

  return {
    restaurante_id: restaurante.id || resumenSemanal?.restaurante_id || null,
    periodo_key: resumenSemanal?.periodo_key || null,
    periodo_inicio: resumenSemanal?.periodo_inicio || null,
    periodo_fin: resumenSemanal?.periodo_fin || null,
    ultima_foto_at: resumenSemanal?.updated_at || resumenSemanal?.generated_at || resumenSemanal?.periodo_fin || null,
    dias_desde_foto: dias,
    foto_reciente: fotoReciente,
    titular: resumenSemanal?.titular || resumenJson(resumenSemanal || {}).titular || null,
    confianza: resumenSemanal?.confianza || resumenJson(resumenSemanal || {}).confianza || 'baja',
    kpis,
    delivery: entrega,
    bloqueos,
    score,
    prioridad,
    siguiente_accion: accionSemanal({ fila: resumenSemanal || {}, kpis, bloqueos, recomendaciones, alertas }),
  }
}

function claveBloqueo(bloqueo) {
  return bloqueo?.tipo || 'otro'
}

export function crearAgendaConsultorSemanal(items = []) {
  const lecturas = items.map(item => ({ ...item.semanal, restaurante: item.restaurante })).filter(item => item.restaurante_id)
  const resumen = {
    restaurantes: lecturas.length,
    fotos_recientes: lecturas.filter(item => item.foto_reciente).length,
    sin_foto: lecturas.filter(item => !item.periodo_key).length,
    envio_pendiente: lecturas.filter(item => ['draft', 'pending'].includes(item.delivery?.status)).length,
    envio_fallido: lecturas.filter(item => item.delivery?.status === 'failed').length,
    beneficio_bruto: lecturas.reduce((sum, item) => sum + numero(item.kpis?.beneficio_bruto), 0),
    recuperable_semana: lecturas.reduce((sum, item) => sum + numero(item.kpis?.recuperable_semana), 0),
    oportunidad_anual: lecturas.reduce((sum, item) => sum + numero(item.kpis?.oportunidad_anual), 0),
  }

  const bloqueosMapa = new Map()
  for (const lectura of lecturas) {
    for (const bloqueo of lectura.bloqueos || []) {
      const clave = claveBloqueo(bloqueo)
      const actual = bloqueosMapa.get(clave) || { ...bloqueo, total: 0, restaurantes: [] }
      actual.total += 1
      actual.restaurantes.push({
        id: lectura.restaurante_id,
        nombre: lectura.restaurante?.nombre || 'Restaurante',
      })
      bloqueosMapa.set(clave, actual)
    }
  }

  const bloqueos = [...bloqueosMapa.values()]
    .sort((a, b) => b.total - a.total || b.peso - a.peso)
    .slice(0, 6)

  const agenda_semana = lecturas
    .filter(item => item.score > 0)
    .sort((a, b) =>
      (PESO_PRIORIDAD[b.prioridad] || 0) - (PESO_PRIORIDAD[a.prioridad] || 0) ||
      b.score - a.score ||
      numero(b.kpis?.recuperable_semana) - numero(a.kpis?.recuperable_semana) ||
      numero(b.kpis?.oportunidad_anual) - numero(a.kpis?.oportunidad_anual)
    )
    .slice(0, 6)
    .map(item => ({
      restaurante_id: item.restaurante_id,
      restaurante: item.restaurante,
      prioridad: item.prioridad,
      score: item.score,
      titular: item.titular,
      siguiente_accion: item.siguiente_accion,
      recuperable_semana: item.kpis?.recuperable_semana || 0,
      oportunidad_anual: item.kpis?.oportunidad_anual || 0,
      delivery_status: item.delivery?.status || 'draft',
      bloqueo_principal: item.bloqueos?.[0] || null,
    }))

  return { resumen, bloqueos, agenda_semana }
}
