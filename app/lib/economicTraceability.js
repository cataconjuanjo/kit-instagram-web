import {
  DEFAULT_WINE_ECONOMICS,
  costeNetoCompra,
  numero,
  precioNetoVenta,
  redondear,
} from './wineEconomics'

export const ECONOMIC_TRACE_FORMULA_VERSION = 'economic-trace-v1'

export const DEFAULT_ECONOMIC_TRACE_SETTINGS = {
  formula_version: ECONOMIC_TRACE_FORMULA_VERSION,
  iva_venta_pct: DEFAULT_WINE_ECONOMICS.ivaVentaPct,
  pvp_incluye_iva: DEFAULT_WINE_ECONOMICS.pvpIncluyeIva,
  coste_incluye_iva: DEFAULT_WINE_ECONOMICS.costeIncluyeIva,
  formato_botella_ml: 750,
  copas_por_botella: DEFAULT_WINE_ECONOMICS.copasPorBotella,
  merma_copa_pct: DEFAULT_WINE_ECONOMICS.mermaCopaPct,
  margen_objetivo_botella_pct: DEFAULT_WINE_ECONOMICS.margenObjetivoBotellaPct,
  margen_objetivo_copa_pct: DEFAULT_WINE_ECONOMICS.margenObjetivoCopaPct,
  precio_minimo_copa: DEFAULT_WINE_ECONOMICS.precioMinimoCopa,
  stock_seguridad_default: 2,
}

function bool(valor, fallback = false) {
  if (typeof valor === 'boolean') return valor
  if (valor === 'true' || valor === '1') return true
  if (valor === 'false' || valor === '0') return false
  return fallback
}

function pct(valor, fallback) {
  const n = numero(valor)
  return n > 0 ? Math.min(95, Math.max(0, n)) : fallback
}

function valorPositivo(valor, fallback) {
  const n = numero(valor)
  return n > 0 ? n : fallback
}

function clampPct(valor) {
  return Math.max(0, Math.min(100, Math.round(numero(valor))))
}

function leerJson(valor) {
  if (!valor) return {}
  if (typeof valor === 'object') return valor
  try {
    return JSON.parse(valor)
  } catch {
    return {}
  }
}

function normalizarTexto(valor = '') {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizarAjustesEconomicos(settings = {}) {
  const base = { ...DEFAULT_ECONOMIC_TRACE_SETTINGS, ...(settings || {}) }
  return {
    formula_version: base.formula_version || ECONOMIC_TRACE_FORMULA_VERSION,
    iva_venta_pct: pct(base.iva_venta_pct, DEFAULT_ECONOMIC_TRACE_SETTINGS.iva_venta_pct),
    pvp_incluye_iva: bool(base.pvp_incluye_iva, DEFAULT_ECONOMIC_TRACE_SETTINGS.pvp_incluye_iva),
    coste_incluye_iva: bool(base.coste_incluye_iva, DEFAULT_ECONOMIC_TRACE_SETTINGS.coste_incluye_iva),
    formato_botella_ml: Math.round(valorPositivo(base.formato_botella_ml, DEFAULT_ECONOMIC_TRACE_SETTINGS.formato_botella_ml)),
    copas_por_botella: valorPositivo(base.copas_por_botella, DEFAULT_ECONOMIC_TRACE_SETTINGS.copas_por_botella),
    merma_copa_pct: pct(base.merma_copa_pct, DEFAULT_ECONOMIC_TRACE_SETTINGS.merma_copa_pct),
    margen_objetivo_botella_pct: pct(base.margen_objetivo_botella_pct, DEFAULT_ECONOMIC_TRACE_SETTINGS.margen_objetivo_botella_pct),
    margen_objetivo_copa_pct: pct(base.margen_objetivo_copa_pct, DEFAULT_ECONOMIC_TRACE_SETTINGS.margen_objetivo_copa_pct),
    precio_minimo_copa: valorPositivo(base.precio_minimo_copa, DEFAULT_ECONOMIC_TRACE_SETTINGS.precio_minimo_copa),
    stock_seguridad_default: valorPositivo(base.stock_seguridad_default, DEFAULT_ECONOMIC_TRACE_SETTINGS.stock_seguridad_default),
  }
}

export function ajustesAConfig(settings = {}) {
  const normalizados = normalizarAjustesEconomicos(settings)
  return {
    ivaVentaPct: normalizados.iva_venta_pct,
    pvpIncluyeIva: normalizados.pvp_incluye_iva,
    costeIncluyeIva: normalizados.coste_incluye_iva,
    copasPorBotella: normalizados.copas_por_botella,
    mermaCopaPct: normalizados.merma_copa_pct,
    margenObjetivoBotellaPct: normalizados.margen_objetivo_botella_pct,
    margenObjetivoCopaPct: normalizados.margen_objetivo_copa_pct,
    precioMinimoCopa: normalizados.precio_minimo_copa,
  }
}

function vinoKey(vino = {}) {
  return String(vino.id || '') || normalizarTexto(vino.nombre)
}

function crearMapaVinos(vinos = []) {
  const porId = new Map()
  const porNombre = new Map()
  vinos.forEach(vino => {
    if (vino.id) porId.set(String(vino.id), vino)
    const nombre = normalizarTexto(vino.nombre)
    if (nombre && !porNombre.has(nombre)) porNombre.set(nombre, vino)
  })
  return { porId, porNombre }
}

function buscarVino(item = {}, mapas) {
  if (item.vino_id && mapas.porId.has(String(item.vino_id))) return mapas.porId.get(String(item.vino_id))
  const detalle = leerJson(item.detalle)
  const nombre = normalizarTexto(item.vino_nombre || item.vino || detalle.vino)
  return nombre ? mapas.porNombre.get(nombre) : null
}

function importeOutcome(outcome = {}, vino = null) {
  const detalle = leerJson(outcome.detalle)
  const cantidad = Math.max(1, numero(outcome.cantidad) || numero(detalle.cantidad) || 1)
  const estimado = numero(outcome.importe_estimado) || numero(detalle.importe_vino_estimado)
  if (estimado) return estimado
  if (outcome.formato_venta === 'copa' || detalle.formato_venta === 'copa') return numero(vino?.precio_copa) * cantidad
  return numero(vino?.precio_botella) * cantidad
}

function beneficioOutcome(outcome = {}, vino = null, settings = {}) {
  if (!vino) return 0
  const config = settings.ivaVentaPct !== undefined ? settings : ajustesAConfig(settings)
  const cantidad = Math.max(1, numero(outcome.cantidad) || 1)
  const bruto = importeOutcome(outcome, vino)
  const coste = costeNetoCompra(vino.coste_compra, config)
  if (!bruto || !coste) return 0
  const ingresoNeto = precioNetoVenta(bruto, config)
  const copasPorBotella = numero(settings.copas_por_botella) || numero(config.copasPorBotella) || 5
  const costeTotal = outcome.formato_venta === 'copa'
    ? (coste / Math.max(1, copasPorBotella)) * cantidad
    : coste * cantidad
  return redondear(ingresoNeto - costeTotal, 2)
}

function tipoMargenOutcome(outcome = {}) {
  const fuente = outcome.fuente || leerJson(outcome.detalle).fuente
  if (['tpv', 'importacion'].includes(fuente) || outcome.source_pos_sale_line_id) return 'real_tpv'
  if (outcome.estado === 'vendida_confirmada') return 'confirmado_sala'
  if (['vendida_probable', 'venta_posible'].includes(outcome.estado)) return 'inferido'
  return 'contexto'
}

function estadoFuente(pctValor, total = 0) {
  if (!total) return 'baja'
  if (pctValor >= 75) return 'alta'
  if (pctValor >= 40) return 'media'
  return 'baja'
}

function fuente(titulo, data) {
  return {
    id: data.id,
    titulo,
    tipo: data.tipo,
    total: data.total || 0,
    porcentaje: clampPct(data.porcentaje),
    confianza: data.confianza || estadoFuente(data.porcentaje, data.total),
    formula_version: data.formula_version || ECONOMIC_TRACE_FORMULA_VERSION,
    detalle: data.detalle,
  }
}

function advertencia(severidad, titulo, detalle, accion, href = '/dashboard') {
  return { severidad, titulo, detalle, accion, href }
}

function sumarEscenarios(escenarios = []) {
  return redondear((escenarios || [])
    .filter(item => !['descartado'].includes(item.estado))
    .reduce((sum, item) => sum + numero(item.impacto_margen), 0), 2)
}

function crearResumenOutcomes(outcomes = [], vinos = [], settings = {}) {
  const mapas = crearMapaVinos(vinos)
  const resumen = {
    real_tpv: 0,
    confirmado_sala: 0,
    inferido: 0,
    contexto: 0,
  }
  const lineas = []

  outcomes.forEach(outcome => {
    const tipo = tipoMargenOutcome(outcome)
    const vino = buscarVino(outcome, mapas)
    const beneficio = beneficioOutcome(outcome, vino, settings)
    resumen[tipo] = redondear(resumen[tipo] + Math.max(0, beneficio), 2)
    if (beneficio > 0) {
      lineas.push({
        id: outcome.id,
        vino: vino?.nombre || outcome.vino_nombre || 'Vino sin identificar',
        fuente: outcome.fuente || leerJson(outcome.detalle).fuente || 'sin fuente',
        estado: outcome.estado,
        tipo_margen: tipo,
        beneficio,
        confianza_pct: numero(outcome.confidence_pct),
        fecha: outcome.servicio_fecha || outcome.created_at,
      })
    }
  })

  return {
    resumen,
    lineas: lineas.sort((a, b) => b.beneficio - a.beneficio).slice(0, 12),
  }
}

function detectarCambiosSnapshot(exposiciones = [], vinos = []) {
  const mapas = crearMapaVinos(vinos)
  const cambios = []

  exposiciones.forEach(exposure => {
    const vino = buscarVino(exposure, mapas)
    if (!vino) return
    const deltaPrecio = redondear(numero(vino.precio_botella) - numero(exposure.precio_botella_snapshot), 2)
    const deltaCoste = redondear(numero(vino.coste_compra) - numero(exposure.coste_snapshot), 2)
    const deltaStock = redondear(numero(vino.stock) - numero(exposure.stock_snapshot), 2)
    const muevePrecio = numero(exposure.precio_botella_snapshot) && Math.abs(deltaPrecio) >= 0.5
    const mueveCoste = numero(exposure.coste_snapshot) && Math.abs(deltaCoste) >= 0.5
    const mueveStock = Math.abs(deltaStock) >= 2
    if (!muevePrecio && !mueveCoste && !mueveStock) return

    cambios.push({
      id: exposure.id,
      vino: vino.nombre || exposure.vino_nombre || 'Vino',
      fecha: exposure.servicio_fecha || exposure.created_at,
      precio_snapshot: numero(exposure.precio_botella_snapshot),
      precio_actual: numero(vino.precio_botella),
      coste_snapshot: numero(exposure.coste_snapshot),
      coste_actual: numero(vino.coste_compra),
      stock_snapshot: numero(exposure.stock_snapshot),
      stock_actual: numero(vino.stock),
      delta_precio: deltaPrecio,
      delta_coste: deltaCoste,
      delta_stock: deltaStock,
    })
  })

  return cambios.slice(0, 12)
}

function compararReportes(reports = []) {
  const [ultimo, anterior] = reports || []
  if (!ultimo || !anterior) return null
  const r1 = leerJson(ultimo.resumen)
  const r0 = leerJson(anterior.resumen)
  return {
    ultimo_id: ultimo.id,
    anterior_id: anterior.id,
    delta_rigor: redondear(numero(r1.puntuacion_rigor) - numero(r0.puntuacion_rigor), 1),
    delta_real_tpv: redondear(numero(r1.beneficio_real_tpv) - numero(r0.beneficio_real_tpv), 2),
    delta_oportunidad: redondear(numero(r1.oportunidad_estimada) - numero(r0.oportunidad_estimada), 2),
    fecha_ultimo: ultimo.created_at,
    fecha_anterior: anterior.created_at,
  }
}

function estadoDefensa({ valor = 0, confianza = 0, bloqueo = false, estimada = false } = {}) {
  if (bloqueo) return 'no_presentar'
  if (numero(valor) <= 0) return 'sin_dato'
  if (confianza >= 75 && !estimada) return 'presentable'
  if (confianza >= 55) return 'presentar_con_contexto'
  return 'no_presentar'
}

function defensaCifra({
  id,
  titulo,
  valor,
  unidad = 'EUR',
  tipo = 'resultado',
  confianza = 0,
  fuente,
  lectura,
  base,
  falta,
  accion,
  href = '/dashboard/trazabilidad',
  estimada = false,
  bloqueo = false,
} = {}) {
  const estado = estadoDefensa({ valor, confianza, bloqueo, estimada })
  return {
    id,
    titulo,
    valor: redondear(valor, unidad === 'pct' ? 0 : 2),
    unidad,
    tipo,
    estado,
    confianza_pct: clampPct(confianza),
    fuente,
    lectura,
    base,
    falta,
    accion,
    href,
  }
}

function crearDefensaCifras({ resumen, fuentes, settingsPersistidos, totalActivos, conCosteYPvp, advertencias }) {
  const fuenteTpv = fuentes.find(item => item.id === 'tpv') || {}
  const fuenteSala = fuentes.find(item => item.id === 'sala') || {}
  const fuenteSimulador = fuentes.find(item => item.id === 'simulador') || {}
  const fuenteSnapshots = fuentes.find(item => item.id === 'snapshots') || {}
  const costePendiente = Math.max(0, totalActivos - conCosteYPvp.length)
  const bloqueoBase = !settingsPersistidos || costePendiente > 0

  const cifras = [
    defensaCifra({
      id: 'beneficio_real_tpv',
      titulo: 'Beneficio real TPV',
      valor: resumen.beneficio_real_tpv,
      tipo: 'real',
      confianza: fuenteTpv.confianza === 'alta' ? 95 : fuenteTpv.confianza === 'media' ? 65 : 25,
      fuente: 'Lineas TPV vinculadas a vino',
      lectura: 'Es la cifra mas defendible porque nace de venta real.',
      base: fuenteTpv.detalle,
      falta: fuenteTpv.confianza === 'alta' ? 'Nada critico.' : 'Vincular mas lineas TPV a vinos reales.',
      accion: 'Revisar importacion TPV y alias de vinos.',
      href: '/dashboard/tpv',
    }),
    defensaCifra({
      id: 'beneficio_confirmado_sala',
      titulo: 'Beneficio confirmado por sala',
      valor: resumen.beneficio_confirmado_sala,
      tipo: 'confirmado',
      confianza: fuenteSala.confianza === 'alta' ? 82 : fuenteSala.confianza === 'media' ? 58 : 35,
      fuente: 'Cierre de servicio y resultados validados',
      lectura: 'Puede presentarse como venta confirmada si el cierre esta bien usado.',
      base: fuenteSala.detalle,
      falta: fuenteSala.confianza === 'alta' ? 'Nada critico.' : 'Cerrar mas recomendaciones con resultado concreto.',
      accion: 'Completar cierres pendientes de sala.',
      href: '/dashboard/cierre',
    }),
    defensaCifra({
      id: 'beneficio_inferido',
      titulo: 'Beneficio inferido',
      valor: resumen.beneficio_inferido,
      tipo: 'inferido',
      confianza: fuenteSala.confianza === 'alta' ? 62 : fuenteSala.confianza === 'media' ? 48 : 25,
      fuente: 'Resultados probables o contexto de sala',
      lectura: 'Sirve para decidir internamente, no para venderlo como resultado cerrado.',
      base: fuenteSala.detalle,
      falta: 'Confirmar con TPV o cierre de servicio.',
      accion: 'Convertir inferidos en ventas confirmadas.',
      href: '/dashboard/cierre',
      estimada: true,
    }),
    defensaCifra({
      id: 'oportunidad_estimada',
      titulo: 'Oportunidad estimada',
      valor: resumen.oportunidad_estimada,
      tipo: 'estimado',
      confianza: fuenteSimulador.confianza === 'media' ? 58 : fuenteSimulador.confianza === 'alta' ? 72 : 32,
      fuente: 'Simulador y escenarios guardados',
      lectura: 'Es potencial: conviene presentarlo como escenario, no como beneficio conseguido.',
      base: fuenteSimulador.detalle,
      falta: 'Aplicar acciones y medir resultado posterior.',
      accion: 'Guardar escenario y marcar acciones aplicadas.',
      href: '/dashboard/simulador',
      estimada: true,
    }),
    defensaCifra({
      id: 'rigor_economico',
      titulo: 'Rigor economico',
      valor: resumen.puntuacion_rigor,
      unidad: 'pct',
      tipo: 'control',
      confianza: resumen.puntuacion_rigor,
      fuente: 'Cobertura de costes, TPV, snapshots, fuentes y formulas',
      lectura: resumen.puntuacion_rigor >= 75
        ? 'La foto economica es presentable.'
        : 'La foto sirve para decidir, pero conviene cerrar huecos antes de presentarla.',
      base: `${conCosteYPvp.length}/${totalActivos || 0} vinos activos con coste y PVP. ${fuenteSnapshots.detalle || ''}`,
      falta: bloqueoBase ? 'Guardar ajustes economicos y completar costes/PVP.' : 'Mejorar TPV o cierres para subir confianza.',
      accion: 'Completar los huecos marcados en advertencias.',
      href: '/dashboard/trazabilidad',
      bloqueo: resumen.puntuacion_rigor < 35 || advertencias.some(item => item.severidad === 'alta') && !settingsPersistidos,
    }),
  ]

  return cifras
}

export function generarTrazabilidadEconomica({
  restaurante = {},
  settings = {},
  settingsPersistidos = false,
  vinos = [],
  exposiciones = [],
  outcomes = [],
  posLines = [],
  escenarios = [],
  radarActions = [],
  reports = [],
  migrationPending = [],
} = {}) {
  const ajustes = normalizarAjustesEconomicos(settings)
  const config = ajustesAConfig(ajustes)
  const activos = (vinos || []).filter(vino => vino.activo !== false)
  const totalActivos = activos.length
  const conCoste = activos.filter(vino => numero(vino.coste_compra) > 0)
  const conPvp = activos.filter(vino => numero(vino.precio_botella) > 0 || numero(vino.precio_copa) > 0)
  const conCosteYPvp = activos.filter(vino => numero(vino.coste_compra) > 0 && (numero(vino.precio_botella) > 0 || numero(vino.precio_copa) > 0))
  const conStockMinimo = activos.filter(vino => numero(vino.stock_minimo) > 0)
  const snapshotsCompletos = (exposiciones || []).filter(item =>
    numero(item.precio_botella_snapshot) > 0 &&
    numero(item.coste_snapshot) > 0 &&
    item.stock_snapshot !== null &&
    item.stock_snapshot !== undefined
  )
  const outcomesConConfianza = (outcomes || []).filter(item => numero(item.confidence_pct) > 0)
  const outcomesConFuente = (outcomes || []).filter(item => item.fuente)
  const outcomesTpv = (outcomes || []).filter(item => tipoMargenOutcome(item) === 'real_tpv')
  const posMatch = (posLines || []).filter(item => item.vino_id && !item.duplicada)
  const escenariosConFormula = (escenarios || []).filter(item => item.formula_version)
  const escenariosConImpacto = (escenarios || []).filter(item => numero(item.impacto_margen) || numero(item.impacto_capital))
  const formulaExposiciones = (exposiciones || []).filter(item => item.formula_version)
  const formulaOutcomes = (outcomes || []).filter(item => item.formula_version)
  const pctDatos = totalActivos ? Math.round((conCosteYPvp.length / totalActivos) * 100) : 0
  const pctStock = totalActivos ? Math.round((conStockMinimo.length / totalActivos) * 100) : 0
  const pctSnapshots = exposiciones.length ? Math.round((snapshotsCompletos.length / exposiciones.length) * 100) : 0
  const pctOutcomes = outcomes.length ? Math.round((outcomesConConfianza.length / outcomes.length) * 100) : 0
  const pctFuente = outcomes.length ? Math.round((outcomesConFuente.length / outcomes.length) * 100) : 0
  const pctTpv = posLines.length ? Math.round((posMatch.length / posLines.length) * 100) : (outcomesTpv.length ? 100 : 0)
  const pctFormula = (exposiciones.length + outcomes.length + escenarios.length)
    ? Math.round(((formulaExposiciones.length + formulaOutcomes.length + escenariosConFormula.length) / (exposiciones.length + outcomes.length + escenarios.length)) * 100)
    : 0
  const beneficio = crearResumenOutcomes(outcomes, activos, ajustes)
  const oportunidadEstimada = sumarEscenarios(escenarios)
  const cambiosSnapshot = detectarCambiosSnapshot(exposiciones, activos)
  const advertencias = []

  if (!settingsPersistidos) {
    advertencias.push(advertencia(
      'alta',
      'Normalizacion economica sin guardar',
      'La app esta usando valores por defecto de IVA, copas, merma y margen objetivo.',
      'Guardar ajustes economicos del restaurante.',
      '/dashboard/trazabilidad'
    ))
  }
  if (totalActivos && conCoste.length < totalActivos) {
    advertencias.push(advertencia('alta', 'Costes incompletos', `${totalActivos - conCoste.length} vinos activos no tienen coste de compra.`, 'Completar coste antes de defender margen.', '/dashboard/bodega#referencias'))
  }
  if (totalActivos && conPvp.length < totalActivos) {
    advertencias.push(advertencia('media', 'PVP incompleto', `${totalActivos - conPvp.length} vinos activos no tienen PVP botella o copa.`, 'Completar PVP para que el margen no sea estimado.', '/dashboard/precios'))
  }
  if (exposiciones.length && pctSnapshots < 70) {
    advertencias.push(advertencia('media', 'Historico incompleto', `Solo ${pctSnapshots}% de recomendaciones conservan precio, coste y stock del momento.`, 'Registrar mejor la foto de cada recomendacion para defender cambios de margen.', '/dashboard/estadisticas'))
  }
  if (outcomes.length && pctFuente < 80) {
    advertencias.push(advertencia('media', 'Fuentes mezcladas', `Hay resultados sin fuente clara; TPV, cierre y estimacion deben verse separados.`, 'Revisar cierre y TPV para distinguir real, probable e inferido.', '/dashboard/cierre'))
  }
  if (!posLines.length && !outcomesTpv.length) {
    advertencias.push(advertencia('media', 'Sin TPV real', 'No hay lineas TPV para contrastar el margen real con venta confirmada.', 'Importar CSV del TPV semanal.', '/dashboard/tpv'))
  }
  if (migrationPending.length) {
    advertencias.push(advertencia('alta', 'Base de datos pendiente', `Faltan piezas para guardar la auditoria completa: ${migrationPending.join(', ')}.`, 'Actualizar Supabase para poder guardar fotos y ajustes economicos.', '/dashboard/trazabilidad'))
  }

  const fuentes = [
    fuente('TPV real', {
      id: 'tpv',
      tipo: 'venta_real',
      total: posLines.length || outcomesTpv.length,
      porcentaje: pctTpv,
      confianza: outcomesTpv.length || posMatch.length ? 'alta' : 'baja',
      formula_version: ECONOMIC_TRACE_FORMULA_VERSION,
      detalle: posLines.length
        ? `${posMatch.length}/${posLines.length} lineas TPV vinculadas a vino.`
        : `${outcomesTpv.length} resultados TPV en atribucion.`,
    }),
    fuente('Cierre y sala', {
      id: 'sala',
      tipo: 'venta_confirmada_o_probable',
      total: outcomes.length,
      porcentaje: pctOutcomes,
      confianza: estadoFuente(pctOutcomes, outcomes.length),
      formula_version: 'recommendation-outcome-v1',
      detalle: `${outcomesConConfianza.length}/${outcomes.length || 0} resultados tienen confianza explicita.`,
    }),
    fuente('Fotos de recomendacion', {
      id: 'snapshots',
      tipo: 'historico_congelado',
      total: exposiciones.length,
      porcentaje: pctSnapshots,
      confianza: estadoFuente(pctSnapshots, exposiciones.length),
      formula_version: 'recommendation-attribution-v1',
      detalle: `${snapshotsCompletos.length}/${exposiciones.length || 0} recomendaciones conservan precio, coste y stock del momento.`,
    }),
    fuente('Simulador', {
      id: 'simulador',
      tipo: 'oportunidad_estimada',
      total: escenarios.length,
      porcentaje: escenarios.length ? Math.round((escenariosConImpacto.length / escenarios.length) * 100) : 0,
      confianza: escenarios.length ? 'media' : 'baja',
      formula_version: 'profit-simulator-v1',
      detalle: `${escenariosConImpacto.length}/${escenarios.length || 0} escenarios tienen impacto economico guardado.`,
    }),
    fuente('Radar diario', {
      id: 'radar',
      tipo: 'accion_operativa',
      total: radarActions.length,
      porcentaje: radarActions.length ? 100 : 0,
      confianza: radarActions.length ? 'media' : 'baja',
      formula_version: 'radar-diario-fase7',
      detalle: `${radarActions.length} acciones con datos de negocio en la cola diaria.`,
    }),
  ]

  const puntuacionRigor = clampPct(
    pctDatos * 0.25 +
    pctStock * 0.1 +
    pctSnapshots * 0.2 +
    pctOutcomes * 0.15 +
    pctTpv * 0.15 +
    pctFormula * 0.1 +
    (settingsPersistidos ? 5 : 0)
  )

  const resumen = {
    restaurante_id: restaurante.id || null,
    formula_version: ECONOMIC_TRACE_FORMULA_VERSION,
    ajustes_guardados: Boolean(settingsPersistidos),
    total_vinos_activos: totalActivos,
    datos_economicos_pct: pctDatos,
    stock_minimo_pct: pctStock,
    snapshots_completos_pct: pctSnapshots,
    outcomes_con_confianza_pct: pctOutcomes,
    fuentes_claras_pct: pctFuente,
    tpv_match_pct: pctTpv,
    formula_version_pct: pctFormula,
    puntuacion_rigor: puntuacionRigor,
    beneficio_real_tpv: beneficio.resumen.real_tpv,
    beneficio_confirmado_sala: beneficio.resumen.confirmado_sala,
    beneficio_inferido: beneficio.resumen.inferido,
    oportunidad_estimada: oportunidadEstimada,
    advertencias: advertencias.length,
    reportes_guardados: reports.length,
  }
  const defensaCifras = crearDefensaCifras({
    resumen,
    fuentes,
    settingsPersistidos,
    totalActivos,
    conCosteYPvp,
    advertencias,
  })

  return {
    settings: ajustes,
    resumen,
    fuentes,
    defensa_cifras: defensaCifras,
    advertencias,
    cambios_snapshot: cambiosSnapshot,
    beneficio_lineas: beneficio.lineas,
    formulas: [
      { nombre: 'Economia base', version: ECONOMIC_TRACE_FORMULA_VERSION, uso: 'Normaliza IVA, coste, margen y stock.' },
      { nombre: 'Atribucion', version: 'recommendation-attribution-v1', uso: 'Guarda la foto de recomendacion y su resultado.' },
      { nombre: 'Simulador', version: 'profit-simulator-v1', uso: 'Calcula oportunidad estimada antes de aplicar cambios.' },
      { nombre: 'Radar diario', version: 'radar-diario-fase7', uso: 'Convierte huecos de dato y venta en acciones operativas.' },
    ],
    reports: reports || [],
    comparacion_reportes: compararReportes(reports),
    metadata: {
      generated_at: new Date().toISOString(),
      migration_pending: migrationPending,
      settings_persistidos: Boolean(settingsPersistidos),
      defensa_presentables: defensaCifras.filter(item => item.estado === 'presentable').length,
      defensa_con_contexto: defensaCifras.filter(item => item.estado === 'presentar_con_contexto').length,
      defensa_no_presentar: defensaCifras.filter(item => item.estado === 'no_presentar').length,
      config,
      vino_keys: activos.map(vinoKey).slice(0, 5),
    },
  }
}
