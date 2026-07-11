function texto(valor, limite = 240) {
  return String(valor || '').trim().slice(0, limite)
}

function numero(valor) {
  return Number(valor) || 0
}

function leerDetalle(detalle) {
  if (typeof detalle === 'object' && detalle !== null) return detalle
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function esTablaNoExiste(error) {
  return error?.code === 'PGRST205' || /Could not find the table/i.test(error?.message || '')
}

function esColumnaNoExiste(error) {
  return error?.code === 'PGRST204' || /Could not find.*column|column .* does not exist/i.test(error?.message || '')
}

const EXPOSURE_FORMULA_VERSION = 'recommendation-attribution-v1'
const OUTCOME_FORMULA_VERSION = 'recommendation-outcome-v1'

function servicioFecha(fecha = new Date().toISOString()) {
  return new Date(fecha).toISOString().slice(0, 10)
}

function servicioTipo(fecha = new Date().toISOString()) {
  const hora = new Date(fecha).getHours()
  if (hora >= 12 && hora < 17) return 'comida'
  if (hora >= 20 || hora < 2) return 'cena'
  return 'otro'
}

function recommendationId(evento, detalle) {
  return texto(detalle.recommendation_id || (evento?.id ? `rec_evt_${evento.id}` : ''), 120)
}

function maridajeEstado(detalle) {
  const estado = texto(detalle.maridaje_estado || detalle.estado_maridaje || '', 40)
  if (['fuerte', 'valido', 'debil', 'incompatible'].includes(estado)) return estado
  if (detalle.compatible === false) return 'incompatible'
  return 'sin_dato'
}

function origenExposicion(valor) {
  const origen = texto(valor || 'camarero', 40)
  return ['cliente', 'camarero', 'consultor', 'simulador', 'sistema'].includes(origen) ? origen : 'sistema'
}

function estadoOutcome(resultado) {
  return {
    vendida: 'vendida_confirmada',
    venta_confirmada: 'vendida_confirmada',
    venta_probable: 'vendida_probable',
    venta_posible: 'venta_posible',
    no_vendida: 'no_vendida',
    no_convence: 'rechazada',
    otra: 'rechazada',
    no_stock: 'sin_stock',
    agotado: 'sin_stock',
  }[resultado] || 'sin_resolver'
}

function confianzaOutcome(estado, fuente = 'camarero') {
  if (fuente === 'tpv' || fuente === 'importacion') return 98
  if (fuente === 'cierre' && estado === 'vendida_confirmada') return 94
  if (estado === 'vendida_confirmada') return 86
  if (estado === 'vendida_probable') return 68
  if (estado === 'venta_posible') return 45
  if (estado === 'sin_stock' || estado === 'rechazada' || estado === 'no_vendida') return 85
  return 20
}

function formatoVenta(valor) {
  return ['botella', 'copa'].includes(valor) ? valor : 'desconocido'
}

function marginTypeOutcome(estado, fuente) {
  if (fuente === 'tpv' || fuente === 'importacion') return 'real_tpv'
  if (estado === 'vendida_confirmada') return 'confirmado_sala'
  if (estado === 'vendida_probable' || estado === 'venta_posible') return 'inferido'
  return 'contexto'
}

function quitarColumnasOutcomeOpcionales(payload = []) {
  return payload.map(item => {
    const {
      source_pos_sale_line_id,
      source_pos_import_batch_id,
      formula_version,
      economic_source,
      margin_type,
      economic_snapshot,
      ...resto
    } = item
    return resto
  })
}

function quitarColumnasExposicionOpcionales(payload = []) {
  return payload.map(item => {
    const {
      formula_version,
      economic_source,
      economic_confidence_pct,
      economic_snapshot,
      ...resto
    } = item
    return resto
  })
}

async function upsertExposiciones(supabase, payload = []) {
  let res = await supabase
    .from('recommendation_exposures')
    .upsert(payload, { onConflict: 'restaurante_id,recommendation_id', ignoreDuplicates: true })
  if (!res.error || !esColumnaNoExiste(res.error)) return res

  res = await supabase
    .from('recommendation_exposures')
    .upsert(quitarColumnasExposicionOpcionales(payload), { onConflict: 'restaurante_id,recommendation_id', ignoreDuplicates: true })
  return res
}

async function upsertOutcomesPorEvento(supabase, payload = []) {
  let res = await supabase
    .from('recommendation_outcomes')
    .upsert(payload, { onConflict: 'source_event_id' })
  if (!res.error || !esColumnaNoExiste(res.error)) return res

  res = await supabase
    .from('recommendation_outcomes')
    .upsert(quitarColumnasOutcomeOpcionales(payload), { onConflict: 'source_event_id' })
  return res
}

async function insertOutcomes(supabase, payload = []) {
  let res = await supabase.from('recommendation_outcomes').insert(payload)
  if (!res.error || !esColumnaNoExiste(res.error)) return res

  res = await supabase.from('recommendation_outcomes').insert(quitarColumnasOutcomeOpcionales(payload))
  return res
}

export function exposicionDesdeEvento(evento = {}) {
  if (evento.tipo !== 'recomendacion') return null
  const detalle = leerDetalle(evento.detalle)
  const recId = recommendationId(evento, detalle)
  if (!recId) return null

  return {
    restaurante_id: evento.restaurante_id,
    recommendation_id: recId,
    grupo_recomendacion_id: texto(detalle.grupo_recomendacion_id, 120) || null,
    source_event_id: evento.id || null,
    origen: origenExposicion(detalle.origen),
    vino_id: texto(detalle.vino_id, 80) || null,
    vino_nombre: texto(detalle.vino, 180) || null,
    plato_id: texto(detalle.plato_id, 80) || null,
    consulta: texto(detalle.consulta || detalle.plato, 240) || null,
    etiqueta: texto(detalle.etiqueta || detalle.recommendation_label || detalle.posicion, 120) || null,
    posicion: Math.round(numero(detalle.posicion || detalle.recommendation_position)),
    servicio_fecha: servicioFecha(evento.created_at),
    servicio_tipo: servicioTipo(evento.created_at),
    precio_botella_snapshot: numero(detalle.precio || detalle.precio_recomendado),
    precio_copa_snapshot: numero(detalle.precio_copa || detalle.precio_copa_recomendado),
    coste_snapshot: numero(detalle.coste || detalle.coste_snapshot),
    stock_snapshot: Math.round(numero(detalle.stock || detalle.stock_snapshot)),
    margen_snapshot_pct: numero(detalle.margen || detalle.margen_snapshot_pct),
    maridaje_score: numero(detalle.score || detalle.maridaje_score),
    maridaje_estado: maridajeEstado(detalle),
    score_comercial: numero(detalle.score_comercial),
    confidence_base_pct: numero(detalle.confidence_pct || detalle.confianza_pct),
    formula_version: EXPOSURE_FORMULA_VERSION,
    economic_source: 'snapshot_recomendacion',
    economic_confidence_pct: numero(detalle.confidence_pct || detalle.confianza_pct),
    economic_snapshot: {
      precio_botella_snapshot: numero(detalle.precio || detalle.precio_recomendado),
      precio_copa_snapshot: numero(detalle.precio_copa || detalle.precio_copa_recomendado),
      coste_snapshot: numero(detalle.coste || detalle.coste_snapshot),
      stock_snapshot: Math.round(numero(detalle.stock || detalle.stock_snapshot)),
      margen_snapshot_pct: numero(detalle.margen || detalle.margen_snapshot_pct),
      formula_version: EXPOSURE_FORMULA_VERSION,
      source_event_id: evento.id || null,
    },
    detalle,
  }
}

export function outcomeDesdeEvento(evento = {}) {
  if (evento.tipo !== 'venta') return null
  const detalle = leerDetalle(evento.detalle)
  const recId = recommendationId(evento, detalle)
  if (!recId) return null
  const estado = estadoOutcome(texto(detalle.resultado, 40))
  const fuente = texto(detalle.fuente || detalle.origen || 'camarero', 40)
  const fuenteNormalizada = ['camarero', 'cierre', 'stock', 'tpv', 'importacion', 'motor_inferido'].includes(fuente)
    ? fuente
    : 'camarero'

  return {
    exposure_id: texto(detalle.exposure_id, 80) || null,
    restaurante_id: evento.restaurante_id,
    recommendation_id: recId,
    grupo_recomendacion_id: texto(detalle.grupo_recomendacion_id, 120) || null,
    source_event_id: evento.id || null,
    vino_id: texto(detalle.vino_id, 80) || null,
    vino_nombre: texto(detalle.vino, 180) || null,
    estado,
    fuente: fuenteNormalizada,
    cantidad: Math.max(1, numero(detalle.cantidad) || 1),
    formato_venta: formatoVenta(detalle.formato_venta),
    importe_estimado: numero(detalle.importe_vino_estimado),
    confidence_pct: confianzaOutcome(estado, fuenteNormalizada),
    servicio_fecha: servicioFecha(evento.created_at),
    source_pos_sale_line_id: texto(detalle.pos_sale_line_id, 80) || null,
    source_pos_import_batch_id: texto(detalle.pos_import_batch_id, 80) || null,
    formula_version: OUTCOME_FORMULA_VERSION,
    economic_source: fuenteNormalizada,
    margin_type: marginTypeOutcome(estado, fuenteNormalizada),
    economic_snapshot: {
      importe_estimado: numero(detalle.importe_vino_estimado),
      cantidad: Math.max(1, numero(detalle.cantidad) || 1),
      formato_venta: formatoVenta(detalle.formato_venta),
      confidence_pct: confianzaOutcome(estado, fuenteNormalizada),
      source_pos_sale_line_id: texto(detalle.pos_sale_line_id, 80) || null,
      formula_version: OUTCOME_FORMULA_VERSION,
    },
    detalle,
  }
}

export function outcomeManual(input = {}, fuente = 'cierre') {
  const estado = estadoOutcome(texto(input.resultado || input.estado, 40))
  return {
    restaurante_id: input.restaurante_id,
    recommendation_id: texto(input.recommendation_id, 120) || null,
    grupo_recomendacion_id: texto(input.grupo_recomendacion_id, 120) || null,
    vino_id: texto(input.vino_id, 80) || null,
    vino_nombre: texto(input.vino, 180) || null,
    estado,
    fuente,
    cantidad: Math.max(1, numero(input.cantidad) || 1),
    formato_venta: formatoVenta(input.formato_venta),
    importe_estimado: numero(input.importe_estimado || input.importe_vino_estimado),
    confidence_pct: confianzaOutcome(estado, fuente),
    servicio_fecha: input.servicio_fecha || servicioFecha(input.created_at),
    formula_version: OUTCOME_FORMULA_VERSION,
    economic_source: fuente,
    margin_type: marginTypeOutcome(estado, fuente),
    economic_snapshot: {
      importe_estimado: numero(input.importe_estimado || input.importe_vino_estimado),
      cantidad: Math.max(1, numero(input.cantidad) || 1),
      formato_venta: formatoVenta(input.formato_venta),
      confidence_pct: confianzaOutcome(estado, fuente),
      formula_version: OUTCOME_FORMULA_VERSION,
    },
    detalle: input.detalle || input,
  }
}

export async function guardarExposiciones(supabase, exposiciones = []) {
  const payload = exposiciones.filter(Boolean)
  if (!payload.length) return { ok: true, inserted: 0 }

  const { error } = await upsertExposiciones(supabase, payload)

  if (error) {
    if (esTablaNoExiste(error) || esColumnaNoExiste(error)) return { ok: false, pendingMigration: true }
    throw error
  }
  return { ok: true, inserted: payload.length }
}

export async function guardarOutcomes(supabase, outcomes = []) {
  const payload = outcomes.filter(Boolean)
  if (!payload.length) return { ok: true, inserted: 0 }

  const conEvento = payload.filter(item => item.source_event_id)
  const sinEvento = payload.filter(item => !item.source_event_id)
  let inserted = 0

  if (conEvento.length) {
    const { error } = await upsertOutcomesPorEvento(supabase, conEvento)
    if (error) {
      if (esTablaNoExiste(error) || esColumnaNoExiste(error)) return { ok: false, pendingMigration: true }
      throw error
    }
    inserted += conEvento.length
  }

  if (sinEvento.length) {
    const { error } = await insertOutcomes(supabase, sinEvento)
    if (error) {
      if (esTablaNoExiste(error) || esColumnaNoExiste(error)) return { ok: false, pendingMigration: true }
      throw error
    }
    inserted += sinEvento.length
  }

  return { ok: true, inserted }
}

export async function guardarAtribucionDesdeEventos(supabase, eventos = []) {
  try {
    const exposiciones = eventos.map(exposicionDesdeEvento).filter(Boolean)
    const outcomes = eventos.map(outcomeDesdeEvento).filter(Boolean)
    const [exposicionesRes, outcomesRes] = await Promise.all([
      guardarExposiciones(supabase, exposiciones),
      guardarOutcomes(supabase, outcomes),
    ])
    return { exposiciones: exposicionesRes, outcomes: outcomesRes }
  } catch (error) {
    console.warn('[recommendationAttribution] atribucion no guardada:', error?.message || error)
    return { ok: false, error: error?.message || 'No se pudo guardar atribucion.' }
  }
}
