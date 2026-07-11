function leerDetalle(registro = {}) {
  const detalle = registro?.detalle ?? registro
  if (!detalle) return null
  if (typeof detalle === 'object') return detalle
  try {
    return JSON.parse(detalle)
  } catch {
    return null
  }
}

function numero(valor) {
  const n = Number(valor)
  return Number.isFinite(n) ? n : 0
}

function normalizarClave(valor) {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function fechaISO(valor) {
  if (!valor) return 'sin-fecha'
  const texto = String(valor)
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10)
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return 'sin-fecha'
  return fecha.toISOString().slice(0, 10)
}

export function esVentaTPV(detalle = {}) {
  const fuente = String(detalle?.fuente || '').toLowerCase()
  return fuente === 'tpv' || Boolean(detalle?.pos_sale_line_id || detalle?.pos_import_batch_id)
}

export function normalizarEventoVenta(registro = {}) {
  const detalle = leerDetalle(registro)
  if (!detalle || !detalle.resultado) return null

  const vinoId = detalle.vino_id ? String(detalle.vino_id) : ''
  const vino = String(detalle.vino || detalle.nombre_vino || '').trim()
  const fecha = fechaISO(
    detalle.servicio_fecha ||
    detalle.fecha_servicio ||
    detalle.fecha ||
    registro.created_at ||
    detalle.created_at
  )
  const clavesVino = [
    vinoId && `id:${vinoId}`,
    vino && `nombre:${normalizarClave(vino)}`,
  ].filter(Boolean)

  return {
    id: registro.id || detalle.id || '',
    detalle,
    resultado: detalle.resultado,
    vendida: detalle.resultado === 'vendida',
    fuente: esVentaTPV(detalle) ? 'tpv' : 'sala',
    vinoId,
    vino: vino || 'Vino sin nombre',
    cantidad: Math.max(1, numero(detalle.cantidad) || 1),
    fecha,
    clavesDiaVino: clavesVino.map(clave => `${clave}|${fecha}`),
  }
}

function detalleConLectura(evento) {
  return {
    ...evento.detalle,
    _fuente_venta: evento.fuente,
    _fecha_venta: evento.fecha,
    _venta_kpi: evento.incluirEnKpi,
    _omitida_por_tpv: evento.omitidaPorTpv,
  }
}

export function priorizarVentas(statsVenta = []) {
  const eventos = statsVenta.map(normalizarEventoVenta).filter(Boolean)
  const clavesTPV = new Set()

  eventos.forEach(evento => {
    if (!evento.vendida || evento.fuente !== 'tpv') return
    evento.clavesDiaVino.forEach(clave => clavesTPV.add(clave))
  })

  const eventosPriorizados = eventos.map(evento => {
    const omitidaPorTpv = evento.vendida &&
      evento.fuente !== 'tpv' &&
      evento.clavesDiaVino.some(clave => clavesTPV.has(clave))

    return {
      ...evento,
      incluirEnKpi: !omitidaPorTpv,
      omitidaPorTpv,
    }
  })

  const ventasKpi = eventosPriorizados.filter(evento => evento.vendida && evento.incluirEnKpi)
  const ventasTPV = eventosPriorizados.filter(evento => evento.vendida && evento.fuente === 'tpv')
  const ventasSalaKpi = ventasKpi.filter(evento => evento.fuente !== 'tpv')
  const ventasSalaOmitidas = eventosPriorizados.filter(evento => evento.omitidaPorTpv)
  const feedbackKpi = eventosPriorizados
    .filter(evento => evento.incluirEnKpi)
    .map(detalleConLectura)
  const detalleVentasKpi = ventasKpi.map(detalleConLectura)

  const ventasPorVinoId = {}
  const ventasPorVino = {}
  ventasKpi.forEach(evento => {
    if (evento.vinoId) ventasPorVinoId[evento.vinoId] = (ventasPorVinoId[evento.vinoId] || 0) + evento.cantidad
    ventasPorVino[evento.vino] = (ventasPorVino[evento.vino] || 0) + evento.cantidad
  })

  return {
    eventos: eventosPriorizados,
    feedbackKpi,
    detalleVentasKpi,
    ventasKpi,
    ventasTPV,
    ventasSalaKpi,
    ventasSalaOmitidas,
    ventasPorVinoId,
    ventasPorVino,
    totalFeedback: eventosPriorizados.length,
    ventasMarcadasEventos: eventosPriorizados.filter(evento => evento.vendida).length,
    ventasKpiEventos: ventasKpi.length,
    unidadesKpi: ventasKpi.reduce((sum, evento) => sum + evento.cantidad, 0),
    unidadesTPV: ventasTPV.reduce((sum, evento) => sum + evento.cantidad, 0),
    unidadesSalaKpi: ventasSalaKpi.reduce((sum, evento) => sum + evento.cantidad, 0),
    unidadesSalaOmitidas: ventasSalaOmitidas.reduce((sum, evento) => sum + evento.cantidad, 0),
    tieneTPV: ventasTPV.length > 0,
  }
}
