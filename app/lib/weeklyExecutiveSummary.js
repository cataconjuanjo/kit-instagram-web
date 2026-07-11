import { esVentaTPV, priorizarVentas } from './salesPriority'
import {
  beneficioBruto,
  costeNetoCompra,
  copasVendibles,
  margenBrutoPct,
  numero,
  precioNetoVenta,
  redondear,
} from './wineEconomics'

export const WEEKLY_EXECUTIVE_FORMULA_VERSION = 'weekly-executive-summary-v1'

const MS_DIA = 24 * 60 * 60 * 1000
const PESO_PRIORIDAD = { alta: 3, media: 2, baja: 1 }

export function periodoSemanalEjecutivo({ dias = 7, fin = new Date() } = {}) {
  const hasta = fin instanceof Date ? fin : new Date(fin)
  const fechaHasta = Number.isNaN(hasta.getTime()) ? new Date() : hasta
  const fechaDesde = new Date(fechaHasta.getTime() - Math.max(1, Number(dias) || 7) * MS_DIA)
  return {
    inicio: fechaDesde.toISOString(),
    fin: fechaHasta.toISOString(),
    dias: Math.max(1, Number(dias) || 7),
  }
}

function leerJson(valor) {
  if (!valor) return null
  if (typeof valor === 'object') return valor
  try {
    return JSON.parse(valor)
  } catch {
    return null
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

function eur(valor, decimales = 0) {
  return `${numero(valor).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })} EUR`
}

function pct(valor) {
  return `${Math.round(numero(valor))}%`
}

function formatoVenta(item = {}) {
  return item.formato_venta === 'copa' ? 'copa' : 'botella'
}

function crearMapaVinos(vinos = []) {
  const porId = new Map()
  const porNombre = new Map()
  ;(vinos || []).forEach(vino => {
    if (vino.id) porId.set(String(vino.id), vino)
    const nombre = normalizarTexto(vino.nombre)
    if (nombre && !porNombre.has(nombre)) porNombre.set(nombre, vino)
  })
  return { porId, porNombre }
}

function buscarVino(item = {}, recomendacion = null, mapas) {
  const id = item.vino_id || recomendacion?.vino_id
  const nombre = item.vino || item.nombre_vino || recomendacion?.vino || recomendacion?.nombre_vino
  if (id && mapas.porId.has(String(id))) return mapas.porId.get(String(id))
  return mapas.porNombre.get(normalizarTexto(nombre)) || null
}

function precioUnidadEvento(item = {}, vino = null) {
  const cantidad = Math.max(1, numero(item.cantidad) || 1)
  return numero(item.precio_unidad) ||
    numero(item.precio_recomendado) ||
    (numero(item.importe_vino_estimado) ? numero(item.importe_vino_estimado) / cantidad : 0) ||
    (formatoVenta(item) === 'copa' ? numero(vino?.precio_copa) : numero(vino?.precio_botella)) ||
    numero(item.precio) ||
    numero(vino?.precio_botella)
}

function beneficioUnidadEvento(item = {}, vino = null) {
  const precio = precioUnidadEvento(item, vino)
  const coste = numero(vino?.coste_compra)
  if (!precio || !coste) return 0
  if (formatoVenta(item) === 'copa') {
    const costeCopa = costeNetoCompra(coste) / copasVendibles()
    return redondear(precioNetoVenta(precio) - costeCopa, 2)
  }
  return beneficioBruto(precio, coste)
}

function margenUnidadEvento(item = {}, vino = null) {
  const precio = precioUnidadEvento(item, vino)
  const coste = numero(vino?.coste_compra)
  if (!precio || !coste) return 0
  if (formatoVenta(item) === 'copa') {
    const costeCopa = costeNetoCompra(coste) / copasVendibles()
    const precioNeto = precioNetoVenta(precio)
    return precioNeto ? redondear(((precioNeto - costeCopa) / precioNeto) * 100, 1) : 0
  }
  return margenBrutoPct(precio, coste)
}

function ventaEconomica(item = {}, recomendacion = null, mapas) {
  const vino = buscarVino(item, recomendacion, mapas)
  const cantidad = Math.max(1, numero(item.cantidad) || 1)
  const precioUnitario = precioUnidadEvento(item, vino)
  const ingreso = numero(item.importe_vino_estimado) || redondear(precioUnitario * cantidad, 2)
  const ingresoNeto = redondear(precioNetoVenta(precioUnitario) * cantidad, 2)
  const beneficioUnitario = beneficioUnidadEvento(item, vino)
  const beneficio = redondear(beneficioUnitario * cantidad, 2)
  const margenPct = margenUnidadEvento(item, vino)
  const tieneCoste = numero(vino?.coste_compra) > 0 && precioUnitario > 0

  return {
    item,
    vino,
    nombre: String(item.vino || recomendacion?.vino || vino?.nombre || 'Vino sin nombre'),
    cantidad,
    precioUnitario,
    ingreso,
    ingresoNeto,
    beneficio,
    margenPct,
    tieneCoste,
  }
}

function contarPor(lista, selector) {
  return (lista || []).reduce((acc, item) => {
    const clave = selector(item)
    if (!clave) return acc
    acc[clave] = acc[clave] || { clave, total: 0, importe: 0 }
    acc[clave].total += Math.max(1, numero(item.cantidad) || 1)
    acc[clave].importe += numero(item.importe_vino_estimado)
    return acc
  }, {})
}

function mejorEntrada(mapa) {
  return Object.values(mapa || {}).sort((a, b) => b.total - a.total || b.importe - a.importe)[0] || null
}

function accionResumen(data) {
  return {
    titulo: data.titulo,
    detalle: data.detalle,
    accion: data.accion,
    href: data.href || '/dashboard',
    area: data.area || 'gerencia',
    prioridad: data.prioridad || 'media',
    impacto_eur: redondear(data.impacto_eur || 0, 2),
    fuente: data.fuente || 'resumen_semanal',
  }
}

function ordenarAcciones(acciones = []) {
  const vistas = new Set()
  return acciones
    .filter(Boolean)
    .filter(item => {
      const clave = normalizarTexto(`${item.titulo}-${item.href}`)
      if (vistas.has(clave)) return false
      vistas.add(clave)
      return true
    })
    .sort((a, b) =>
      (PESO_PRIORIDAD[b.prioridad] || 0) - (PESO_PRIORIDAD[a.prioridad] || 0) ||
      numero(b.impacto_eur) - numero(a.impacto_eur)
    )
    .slice(0, 3)
}

function lineaValor(titulo, valor, detalle, href = '/dashboard') {
  return { titulo, valor: redondear(valor, 2), valor_texto: eur(valor), detalle, href }
}

function crearCopy(resumen) {
  const decisiones = resumen.decisiones.length
    ? resumen.decisiones.map((item, index) => `${index + 1}. ${item.titulo}: ${item.accion}`).join('\n')
    : '1. Sin decision urgente: mantener briefing y revisar una oportunidad rentable.'

  return [
    `Resumen semanal - ${resumen.restaurante_nombre}`,
    `${resumen.rango.label}`,
    '',
    resumen.titular,
    '',
    `Ganado defendible: ${resumen.kpis.beneficio_bruto_texto}`,
    `Atribuido a recomendacion: ${resumen.kpis.beneficio_recomendacion_texto}`,
    `Recuperable detectado: ${resumen.kpis.recuperable_semana_texto}`,
    `Oportunidad anual en escenarios: ${resumen.kpis.oportunidad_anual_texto}`,
    '',
    '3 decisiones:',
    decisiones,
  ].join('\n')
}

export function generarResumenSemanalEjecutivo({
  restaurante = {},
  periodoInicio,
  periodoFin,
  vinos = [],
  stats = [],
  radarActions = [],
  escenarios = [],
  posLines = [],
} = {}) {
  const mapas = crearMapaVinos(vinos)
  const activos = (vinos || []).filter(vino => vino.activo !== false)
  const statsVenta = (stats || []).filter(item => item.tipo === 'venta')
  const statsRecomendacion = (stats || []).filter(item => item.tipo === 'recomendacion')
  const recomendaciones = statsRecomendacion.map(item => leerJson(item.detalle)).filter(Boolean)
  const prioridadVentas = priorizarVentas(statsVenta)
  const ventas = prioridadVentas.detalleVentasKpi
  const feedback = prioridadVentas.feedbackKpi
  const feedbackPorRecomendacion = new Set(feedback.map(item => item.recommendation_id).filter(Boolean))
  const recomendacionesPorId = new Map(
    recomendaciones
      .filter(item => item.recommendation_id)
      .map(item => [item.recommendation_id, item])
  )

  const ventasEconomicas = ventas
    .map(item => ventaEconomica(item, item.recommendation_id ? recomendacionesPorId.get(item.recommendation_id) : null, mapas))
    .filter(item => item.precioUnitario > 0 || item.ingreso > 0)
  const ventasConCoste = ventasEconomicas.filter(item => item.tieneCoste)
  const ventasAtribuidas = ventasEconomicas.filter(item => item.item?.recommendation_id)
  const ventasAtribuidasConCoste = ventasAtribuidas.filter(item => item.tieneCoste)
  const ventasTpvAtribuidas = ventasAtribuidas.filter(item => esVentaTPV(item.item))
  const ventasTpvAtribuidasConCoste = ventasTpvAtribuidas.filter(item => item.tieneCoste)
  const tpvNoAtribuido = ventas.filter(item => esVentaTPV(item) && !item.recommendation_id)

  const beneficioBrutoSemana = redondear(ventasConCoste.reduce((sum, item) => sum + item.beneficio, 0), 2)
  const ingresoNetoSemana = redondear(ventasConCoste.reduce((sum, item) => sum + item.ingresoNeto, 0), 2)
  const margenMedioPct = ingresoNetoSemana ? Math.round((beneficioBrutoSemana / ingresoNetoSemana) * 100) : 0
  const beneficioRecomendacion = redondear(ventasAtribuidasConCoste.reduce((sum, item) => sum + item.beneficio, 0), 2)
  const beneficioTpvAtribuido = redondear(ventasTpvAtribuidasConCoste.reduce((sum, item) => sum + item.beneficio, 0), 2)
  const beneficioTpvNoAtribuido = redondear(
    tpvNoAtribuido
      .map(item => ventaEconomica(item, null, mapas))
      .filter(item => item.tieneCoste)
      .reduce((sum, item) => sum + Math.max(0, item.beneficio), 0),
    2
  )

  const noConvertidasEconomicas = feedback
    .filter(item => item.resultado && item.resultado !== 'vendida')
    .map(item => ventaEconomica(item, item.recommendation_id ? recomendacionesPorId.get(item.recommendation_id) : null, mapas))
    .filter(item => item.precioUnitario > 0)
  const beneficioNoConvertido = redondear(
    noConvertidasEconomicas
      .filter(item => item.tieneCoste)
      .reduce((sum, item) => sum + Math.max(0, item.beneficio), 0),
    2
  )
  const beneficioPerdidoStock = redondear(
    noConvertidasEconomicas
      .filter(item => ['no_stock', 'agotado'].includes(item.item.resultado) && item.tieneCoste)
      .reduce((sum, item) => sum + Math.max(0, item.beneficio), 0),
    2
  )
  const recomendacionesSinResultadoEconomico = recomendaciones
    .filter(item => item.recommendation_id && !feedbackPorRecomendacion.has(item.recommendation_id))
    .map(item => ventaEconomica(item, item, mapas))
    .filter(item => item.precioUnitario > 0)
  const beneficioPendienteRecomendacion = redondear(
    recomendacionesSinResultadoEconomico
      .filter(item => item.tieneCoste)
      .reduce((sum, item) => sum + Math.max(0, item.beneficio), 0),
    2
  )
  const ventasBajoMargen = ventasConCoste.filter(item => item.margenPct > 0 && item.margenPct < 50)
  const mejoraPotencialMargenBajo = redondear(ventasBajoMargen.reduce((sum, item) => {
    const objetivo = item.ingresoNeto * 0.55
    return sum + Math.max(0, objetivo - item.beneficio)
  }, 0), 2)
  const recuperableSemana = redondear(
    beneficioNoConvertido + beneficioPerdidoStock + beneficioPendienteRecomendacion + mejoraPotencialMargenBajo,
    2
  )

  const recomendacionesIds = new Set(recomendaciones.map(item => item.recommendation_id).filter(Boolean))
  const ventasAtribuidasIds = new Set(feedback
    .filter(item => item.resultado === 'vendida' && item.recommendation_id)
    .map(item => item.recommendation_id))
  const conversionPct = recomendacionesIds.size
    ? Math.round((ventasAtribuidasIds.size / recomendacionesIds.size) * 100)
    : 0
  const ventasTpvAtribuidasUnidades = ventasTpvAtribuidas.reduce((sum, item) => sum + item.cantidad, 0)
  const ventasTpvNoAtribuidasUnidades = tpvNoAtribuido.reduce((sum, item) => sum + Math.max(1, numero(item.cantidad) || 1), 0)
  const ventasSinCoste = ventasEconomicas.filter(item => !item.tieneCoste).length
  const conCosteYPvp = activos.filter(vino => numero(vino.coste_compra) > 0 && (numero(vino.precio_botella) > 0 || numero(vino.precio_copa) > 0))
  const coberturaEconomicaPct = activos.length ? Math.round((conCosteYPvp.length / activos.length) * 100) : 0
  const posMatch = (posLines || []).filter(item => item.vino_id && !item.duplicada)
  const tpvMatchPct = posLines.length ? Math.round((posMatch.length / posLines.length) * 100) : (prioridadVentas.unidadesTPV > 0 ? 100 : 0)
  const confianza = prioridadVentas.unidadesTPV > 0 && coberturaEconomicaPct >= 70
    ? 'alta'
    : coberturaEconomicaPct >= 45 || ventasConCoste.length > 0
      ? 'media'
      : 'baja'

  const bajoMinimo = activos.filter(vino => numero(vino.stock_minimo) > 0 && numero(vino.stock) <= numero(vino.stock_minimo))
  const sinCoste = activos.filter(vino => !numero(vino.coste_compra))
  const margenBajoActual = activos
    .filter(vino => numero(vino.precio_botella) > 0 && numero(vino.coste_compra) > 0)
    .map(vino => ({ ...vino, margenPct: margenBrutoPct(vino.precio_botella, vino.coste_compra) }))
    .filter(vino => vino.margenPct > 0 && vino.margenPct < 50)
  const escenariosActivos = (escenarios || []).filter(item => !['descartado'].includes(item.estado))
  const oportunidadAnual = redondear(escenariosActivos.reduce((sum, item) => sum + numero(item.impacto_margen), 0), 2)

  const pares = contarPor(
    ventas.filter(item => item.vino && (item.plato || item.consulta)),
    item => `${item.vino} con ${item.plato || item.consulta}`
  )
  const parejaGanadora = mejorEntrada(pares)
  const vinosVendidos = contarPor(ventas, item => item.vino || item.nombre_vino)
  const vinoGanador = mejorEntrada(vinosVendidos)

  const accionesRadar = (radarActions || [])
    .filter(item => !['hecha', 'descartada'].includes(item.estado))
    .map(item => accionResumen({
      titulo: item.titulo,
      detalle: item.detalle,
      accion: item.accion,
      href: item.href,
      area: item.area,
      prioridad: item.prioridad,
      fuente: 'radar_diario',
    }))

  const acciones = [
    ...accionesRadar,
    (beneficioPerdidoStock > 0 || bajoMinimo.length > 0) && accionResumen({
      titulo: 'Preparar pedido semanal',
      detalle: `${bajoMinimo.length} referencias en minimo y ${eur(beneficioPerdidoStock)} ligados a falta de stock.`,
      accion: 'Reponer o preparar sustitutos equivalentes antes del siguiente servicio fuerte.',
      href: '/dashboard/bodega#pedido',
      area: 'bodega',
      prioridad: 'alta',
      impacto_eur: beneficioPerdidoStock,
    }),
    ventasTpvNoAtribuidasUnidades > 0 && accionResumen({
      titulo: 'Conectar TPV con recomendaciones',
      detalle: `${ventasTpvNoAtribuidasUnidades} ventas reales no explican si nacen de la recomendacion.`,
      accion: 'Revisar alias, exposiciones y uso de modo sala para medir influencia comercial.',
      href: '/dashboard/tpv',
      area: 'tpv',
      prioridad: 'media',
      impacto_eur: beneficioTpvNoAtribuido,
    }),
    (ventasSinCoste > 0 || sinCoste.length > 0) && accionResumen({
      titulo: 'Completar costes que bloquean margen',
      detalle: `${ventasSinCoste} ventas y ${sinCoste.length} vinos activos no defienden beneficio completo.`,
      accion: 'Completar coste empezando por vendidos, recomendados y referencias de mayor rotacion.',
      href: '/dashboard/bodega#referencias',
      area: 'precio',
      prioridad: ventasSinCoste > 0 ? 'alta' : 'media',
    }),
    (ventasBajoMargen.length > 0 || margenBajoActual.length > 0) && accionResumen({
      titulo: 'Revisar PVP o coste',
      detalle: `${ventasBajoMargen.length || margenBajoActual.length} senales de margen bajo en venta o carta.`,
      accion: 'Ajustar PVP, renegociar compra o buscar sustituto gastronomico equivalente.',
      href: '/dashboard/precios',
      area: 'precio',
      prioridad: 'media',
      impacto_eur: mejoraPotencialMargenBajo,
    }),
    beneficioPendienteRecomendacion > 0 && accionResumen({
      titulo: 'Cerrar recomendaciones sin resultado',
      detalle: `${recomendacionesSinResultadoEconomico.length} recomendaciones aun pueden explicar venta o rechazo.`,
      accion: 'Validar en cierre si salieron, fallaron por stock o necesitan argumento de sala.',
      href: '/dashboard/cierre',
      area: 'sala',
      prioridad: 'media',
      impacto_eur: beneficioPendienteRecomendacion,
    }),
    oportunidadAnual > 0 && accionResumen({
      titulo: 'Decidir escenario rentable',
      detalle: `${eur(oportunidadAnual)} anuales siguen abiertos en simulador.`,
      accion: 'Aplicar o descartar las acciones para que gerencia no deje dinero en borrador.',
      href: '/dashboard/simulador',
      area: 'gerencia',
      prioridad: 'media',
      impacto_eur: oportunidadAnual,
    }),
    !accionesRadar.length && parejaGanadora && accionResumen({
      titulo: 'Repetir pareja que funciono',
      detalle: `${parejaGanadora.clave} vendio ${parejaGanadora.total} uds.`,
      accion: 'Convertirlo en argumento de sala cuando el plato y el perfil de mesa encajen.',
      href: '/dashboard/sala',
      area: 'sala',
      prioridad: 'baja',
    }),
  ]

  const decisiones = ordenarAcciones(acciones)
  const ganado = [
    lineaValor('Beneficio bruto defendible', beneficioBrutoSemana, `${ventasConCoste.length} ventas con precio y coste.`, '/dashboard/estadisticas'),
    lineaValor('Atribuido a recomendacion', beneficioRecomendacion, `${ventasAtribuidas.reduce((sum, item) => sum + item.cantidad, 0)} uds. conectadas a recomendacion.`, '/dashboard/estadisticas'),
    lineaValor('TPV atribuido', beneficioTpvAtribuido, `${ventasTpvAtribuidasUnidades} uds. reales conectadas a recomendacion.`, '/dashboard/tpv'),
  ].filter(item => item.valor > 0)
  if (parejaGanadora) {
    ganado.push({
      titulo: 'Pareja ganadora',
      valor: parejaGanadora.total,
      valor_texto: `${parejaGanadora.total} uds.`,
      detalle: parejaGanadora.clave,
      href: '/dashboard/sala',
    })
  } else if (vinoGanador) {
    ganado.push({
      titulo: 'Vino lider',
      valor: vinoGanador.total,
      valor_texto: `${vinoGanador.total} uds.`,
      detalle: vinoGanador.clave,
      href: '/dashboard/estadisticas',
    })
  }

  const pendiente = [
    lineaValor('No convertido', beneficioNoConvertido, 'Recomendaciones rechazadas o cambiadas con margen estimado.', '/dashboard/cierre'),
    lineaValor('Freno por stock', beneficioPerdidoStock, 'Venta probable perdida por falta de disponibilidad.', '/dashboard/bodega#pedido'),
    lineaValor('Recomendacion sin cerrar', beneficioPendienteRecomendacion, 'Exposiciones sin resultado validado.', '/dashboard/cierre'),
    lineaValor('TPV no atribuido', beneficioTpvNoAtribuido, 'Venta real que aun no se conecta a recomendacion.', '/dashboard/tpv'),
    lineaValor('Margen bajo vendido', mejoraPotencialMargenBajo, 'Diferencia hasta un 55% de margen bruto objetivo.', '/dashboard/precios'),
    lineaValor('Escenarios abiertos', oportunidadAnual, 'Impacto anual propuesto y pendiente de decision.', '/dashboard/simulador'),
  ].filter(item => item.valor > 0)

  const titular = beneficioBrutoSemana > 0
    ? `Semana con ${eur(beneficioBrutoSemana)} defendibles y ${eur(recuperableSemana)} por capturar`
    : recuperableSemana > 0
      ? `Semana con ${eur(recuperableSemana)} pendientes de capturar`
      : ventas.length || recomendaciones.length
        ? 'Semana con actividad, pero faltan coste o cierre para defender dinero'
        : 'Semana sin datos suficientes para defender rentabilidad'

  const resumen = {
    formula_version: WEEKLY_EXECUTIVE_FORMULA_VERSION,
    restaurante_id: restaurante.id || null,
    restaurante_nombre: restaurante.nombre || 'Restaurante',
    generated_at: new Date().toISOString(),
    rango: {
      inicio: periodoInicio,
      fin: periodoFin,
      label: `Ultimos 7 dias`,
    },
    titular,
    confianza,
    kpis: {
      beneficio_bruto: beneficioBrutoSemana,
      beneficio_bruto_texto: eur(beneficioBrutoSemana),
      beneficio_recomendacion: beneficioRecomendacion,
      beneficio_recomendacion_texto: eur(beneficioRecomendacion),
      recuperable_semana: recuperableSemana,
      recuperable_semana_texto: eur(recuperableSemana),
      oportunidad_anual: oportunidadAnual,
      oportunidad_anual_texto: eur(oportunidadAnual),
      margen_medio_pct: margenMedioPct,
      margen_medio_texto: pct(margenMedioPct),
      conversion_recomendacion_pct: conversionPct,
      conversion_recomendacion_texto: pct(conversionPct),
      ventas_kpi: prioridadVentas.unidadesKpi,
      ventas_tpv: prioridadVentas.unidadesTPV,
      ventas_sala: prioridadVentas.unidadesSalaKpi,
      ventas_tpv_atribuidas: ventasTpvAtribuidasUnidades,
      ventas_tpv_no_atribuidas: ventasTpvNoAtribuidasUnidades,
      recomendaciones: recomendaciones.length,
      ventas_sin_coste: ventasSinCoste,
      cobertura_economica_pct: coberturaEconomicaPct,
      tpv_match_pct: tpvMatchPct,
    },
    ganado,
    pendiente,
    decisiones,
    senales: {
      bajo_minimo: bajoMinimo.length,
      sin_coste: sinCoste.length,
      margen_bajo: margenBajoActual.length,
      ventas_bajo_margen: ventasBajoMargen.length,
      radar_abiertas: accionesRadar.length,
    },
    metadata: {
      ventas_con_coste: ventasConCoste.length,
      pos_lines: posLines.length,
      pos_match: posMatch.length,
      escenarios_activos: escenariosActivos.length,
    },
  }

  return {
    ...resumen,
    copy_text: crearCopy(resumen),
  }
}
