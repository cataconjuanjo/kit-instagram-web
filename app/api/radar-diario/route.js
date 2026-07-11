import { requireRestaurantAccess } from '../_lib/auth'
import { aplicarVentana, resolverVentanaDiaOperativo } from '../../lib/demoServiceDay'
import { finalizarAutomationRun, iniciarAutomationRun } from '../../lib/automationRunLog'
import { priorizarVentas, esVentaTPV } from '../../lib/salesPriority'
import { margenBrutoPct, numero, redondear } from '../../lib/wineEconomics'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const ESTADOS = new Set(['pendiente', 'en_progreso', 'hecha', 'descartada'])
const ORIGEN = 'radar_diario_fase7'

function esTablaNoExiste(error) {
  return error?.code === 'PGRST205' || /Could not find the table/i.test(error?.message || '')
}

function leerDetalle(detalle) {
  if (!detalle) return null
  if (typeof detalle === 'object') return detalle
  try {
    return JSON.parse(detalle)
  } catch {
    return null
  }
}

function claveTexto(valor = '') {
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function fechaOperativaDesdeVentana(ventana) {
  const fecha = new Date(ventana?.desde || Date.now())
  if (Number.isNaN(fecha.getTime())) return new Date().toISOString().slice(0, 10)
  return fecha.toISOString().slice(0, 10)
}

function accionBase(restauranteId, fechaOperativa, data) {
  return {
    restaurante_id: restauranteId,
    fecha_operativa: fechaOperativa,
    origen: ORIGEN,
    periodo_inicio: data.periodo_inicio || null,
    periodo_fin: data.periodo_fin || null,
    esfuerzo: data.esfuerzo || 'medio',
    impacto: data.impacto || 'operativo',
    estado: 'pendiente',
    metricas: data.metricas || {},
    ...data,
  }
}

function contarPor(lista, selector) {
  return lista.reduce((acc, item) => {
    const clave = selector(item)
    if (!clave) return acc
    acc[clave] = (acc[clave] || 0) + (Number(item.cantidad) || 1)
    return acc
  }, {})
}

function mejorEntrada(mapa) {
  return Object.entries(mapa).sort((a, b) => b[1] - a[1])[0] || null
}

function generarAcciones({ restaurante, vinos, platos, propuestas, stats, ventana, fechaOperativa }) {
  const restauranteId = restaurante.id
  const periodo = { periodo_inicio: ventana.desde, periodo_fin: ventana.hasta || new Date().toISOString() }
  const vinosActivos = (vinos || []).filter(vino => vino.activo !== false)
  const ventasStats = (stats || []).filter(item => item.tipo === 'venta')
  const recomendaciones = (stats || []).filter(item => item.tipo === 'recomendacion').map(item => leerDetalle(item.detalle)).filter(Boolean)
  const prioridadVentas = priorizarVentas(ventasStats)
  const feedback = prioridadVentas.feedbackKpi
  const ventas = prioridadVentas.detalleVentasKpi
  const incidenciasStock = feedback.filter(item => ['no_stock', 'agotado'].includes(item.resultado))
  const dudasSala = feedback.filter(item => ['no_convence', 'otra'].includes(item.resultado))
  const tpvNoAtribuido = ventas.filter(item => esVentaTPV(item) && !item.recommendation_id)
  const feedbackPorRecomendacion = new Set(feedback.map(item => item.recommendation_id).filter(Boolean))
  const recomendacionesPendientes = recomendaciones.filter(item => item.recommendation_id && !feedbackPorRecomendacion.has(item.recommendation_id))
  const bajoMinimo = vinosActivos.filter(vino => numero(vino.stock_minimo) > 0 && numero(vino.stock) <= numero(vino.stock_minimo))
  const sinCoste = vinosActivos.filter(vino => !numero(vino.coste_compra))
  const sinPvp = vinosActivos.filter(vino => !numero(vino.precio_botella) && !numero(vino.precio_copa))
  const sinStockMinimo = vinosActivos.filter(vino => !numero(vino.stock_minimo))
  const margenBajo = vinosActivos
    .filter(vino => numero(vino.precio_botella) > 0 && numero(vino.coste_compra) > 0)
    .map(vino => ({ ...vino, margenPct: margenBrutoPct(vino.precio_botella, vino.coste_compra) }))
    .filter(vino => vino.margenPct > 0 && vino.margenPct < 50)
  const propuestasAbiertas = (propuestas || []).filter(item => !['descartada', 'incorporada'].includes(item.estado))
  const platosIncompletos = (platos || []).filter(plato => !plato.descripcion || plato.descripcion.trim().length < 8)
  const ventasPorVino = contarPor(ventas, item => item.vino || item.nombre_vino)
  const vinoLider = mejorEntrada(ventasPorVino)
  const paresVendidos = contarPor(
    ventas.filter(item => item.vino && (item.plato || item.consulta)),
    item => `${item.vino}||${item.plato || item.consulta}`
  )
  const parejaGanadora = mejorEntrada(paresVendidos)
  const acciones = []

  if (incidenciasStock.length > 0) {
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: 'resolver_stock_servicio',
      area: 'bodega',
      titulo: 'Resolver stock antes del servicio',
      detalle: `${incidenciasStock.length} recomendaciones o ventas tuvieron falta de stock o agotado.`,
      accion: 'Reponer o preparar sustituto equivalente antes del proximo servicio.',
      href: '/dashboard/cierre#incidencias',
      prioridad: 'alta',
      impacto: 'stock',
      esfuerzo: 'bajo',
      metricas: { incidencias_stock: incidenciasStock.length },
    }))
  }

  if (bajoMinimo.length > 0) {
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: 'preparar_reposicion_minimos',
      area: 'bodega',
      titulo: 'Preparar reposicion',
      detalle: `${bajoMinimo.length} vinos estan en o por debajo del stock minimo.`,
      accion: 'Preparar pedido o sustitutos, priorizando vinos con ventas o recomendaciones recientes.',
      href: '/dashboard/bodega#pedido',
      prioridad: 'alta',
      impacto: 'stock',
      esfuerzo: 'medio',
      metricas: { vinos_bajo_minimo: bajoMinimo.length },
    }))
  }

  if (dudasSala.length > 0) {
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: 'briefing_dudas_sala',
      area: 'sala',
      titulo: 'Reducir dudas en mesa',
      detalle: `${dudasSala.length} cambios, rechazos o dudas quedaron registrados.`,
      accion: 'Revisar argumento de venta, precio de entrada o alternativa gastronomica para el briefing.',
      href: '/dashboard/cierre#dudas',
      prioridad: 'alta',
      impacto: 'venta',
      esfuerzo: 'bajo',
      metricas: { dudas_sala: dudasSala.length },
    }))
  }

  if (tpvNoAtribuido.length > 0) {
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: 'conectar_tpv_recomendacion',
      area: 'tpv',
      titulo: 'Conectar TPV con recomendacion',
      detalle: `${tpvNoAtribuido.length} ventas reales de TPV no quedan atribuidas a recomendacion.`,
      accion: 'Revisar alias, exposiciones y uso de modo sala para capturar influencia comercial.',
      href: '/dashboard/tpv',
      prioridad: 'media',
      impacto: 'dato',
      esfuerzo: 'medio',
      metricas: { tpv_no_atribuido: tpvNoAtribuido.length },
    }))
  }

  if (recomendacionesPendientes.length > 0) {
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: 'cerrar_recomendaciones_pendientes',
      area: 'sala',
      titulo: 'Cerrar recomendaciones pendientes',
      detalle: `${recomendacionesPendientes.length} recomendaciones siguen sin resultado.`,
      accion: 'Validar si se vendieron, se rechazaron, fallaron por stock o quedaron sin decision.',
      href: '/dashboard/cierre',
      prioridad: recomendacionesPendientes.length >= 5 ? 'alta' : 'media',
      impacto: 'atribucion',
      esfuerzo: 'bajo',
      metricas: { recomendaciones_pendientes: recomendacionesPendientes.length },
    }))
  }

  if (sinCoste.length > 0) {
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: 'completar_costes_compra',
      area: 'precio',
      titulo: 'Completar costes de compra',
      detalle: `${sinCoste.length} vinos no tienen coste informado.`,
      accion: 'Completar coste empezando por vendidos, recomendados y referencias de mayor rotacion.',
      href: '/dashboard/vinos',
      prioridad: sinCoste.length > vinosActivos.length * 0.35 ? 'alta' : 'media',
      impacto: 'margen',
      esfuerzo: 'medio',
      metricas: { vinos_sin_coste: sinCoste.length, vinos_activos: vinosActivos.length },
    }))
  }

  if (margenBajo.length > 0) {
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: 'revisar_margen_bajo',
      area: 'precio',
      titulo: 'Revisar margen bajo',
      detalle: `${margenBajo.length} vinos quedan por debajo del 50% de margen bruto estimado.`,
      accion: 'Revisar PVP, coste o sustituto equivalente sin romper el maridaje.',
      href: '/dashboard/precios',
      prioridad: 'media',
      impacto: 'margen',
      esfuerzo: 'medio',
      metricas: { vinos_margen_bajo: margenBajo.length },
    }))
  }

  if (parejaGanadora) {
    const [clavePareja, ventasPareja] = parejaGanadora
    const [vino, plato] = clavePareja.split('||')
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: `repetir_pareja_${claveTexto(vino)}_${claveTexto(plato)}`.slice(0, 160),
      area: 'maridaje',
      titulo: 'Repetir pareja plato-vino',
      detalle: `${vino} funciono con ${plato} (${ventasPareja} uds.).`,
      accion: 'Convertirlo en argumento de sala para mesas similares, solo cuando el encaje gastronomico aplique.',
      href: '/dashboard/sala',
      prioridad: ventasPareja >= 2 ? 'media' : 'baja',
      impacto: 'venta',
      esfuerzo: 'bajo',
      metricas: { ventas_pareja: ventasPareja, vino, plato },
    }))
  } else if (vinoLider) {
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: `vigilar_vino_lider_${claveTexto(vinoLider[0])}`.slice(0, 160),
      area: 'sala',
      titulo: 'Preparar vino lider del dia',
      detalle: `${vinoLider[0]} lidera ventas KPI con ${vinoLider[1]} uds.`,
      accion: 'Proteger stock y convertir el argumento en briefing si el margen y el maridaje lo justifican.',
      href: '/dashboard/sala',
      prioridad: 'baja',
      impacto: 'venta',
      esfuerzo: 'bajo',
      metricas: { vino: vinoLider[0], ventas: vinoLider[1] },
    }))
  }

  if (sinPvp.length > 0 || sinStockMinimo.length > 0 || platosIncompletos.length > 0 || propuestasAbiertas.length > 0) {
    acciones.push(accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: 'limpiar_datos_operativos',
      area: 'datos',
      titulo: 'Limpiar datos que bloquean decisiones',
      detalle: `${sinPvp.length} vinos sin PVP, ${sinStockMinimo.length} sin stock minimo, ${platosIncompletos.length} platos incompletos y ${propuestasAbiertas.length} propuestas abiertas.`,
      accion: 'Completar solo lo que desbloquea precio, bodega, maridaje o compras esta semana.',
      href: '/dashboard/estadisticas',
      prioridad: 'baja',
      impacto: 'dato',
      esfuerzo: 'medio',
      metricas: {
        vinos_sin_pvp: sinPvp.length,
        vinos_sin_stock_minimo: sinStockMinimo.length,
        platos_incompletos: platosIncompletos.length,
        propuestas_abiertas: propuestasAbiertas.length,
      },
    }))
  }

  const pesoPrioridad = { alta: 3, media: 2, baja: 1 }
  const ordenadas = acciones
    .sort((a, b) => (pesoPrioridad[b.prioridad] || 0) - (pesoPrioridad[a.prioridad] || 0))
    .slice(0, 8)

  if (!ordenadas.length) {
    return [accionBase(restauranteId, fechaOperativa, {
      ...periodo,
      clave: 'briefing_servicio_limpio',
      area: 'gerencia',
      titulo: 'Servicio sin urgencias visibles',
      detalle: 'No hay bloqueos criticos de stock, cierre, coste o TPV en el radar diario.',
      accion: 'Abrir briefing de sala y revisar una oportunidad de venta rentable antes del servicio.',
      href: '/dashboard/sala',
      prioridad: 'baja',
      impacto: 'operativo',
      esfuerzo: 'bajo',
      metricas: { ventas_kpi: prioridadVentas.unidadesKpi },
    })]
  }

  return ordenadas
}

async function cargarDatos(restaurante) {
  const ventana = await resolverVentanaDiaOperativo(supabaseAdmin, restaurante, { tipo: 'venta' })
  const [vinosRes, platosRes, propuestasRes, statsRes] = await Promise.all([
    supabaseAdmin.from('vinos').select('*').eq('restaurante_id', restaurante.id),
    supabaseAdmin.from('platos').select('*').eq('restaurante_id', restaurante.id).eq('activo', true),
    supabaseAdmin.from('consultor_propuestas').select('id, estado').eq('restaurante_id', restaurante.id),
    aplicarVentana(
      supabaseAdmin
        .from('estadisticas')
        .select('id, tipo, detalle, created_at')
        .eq('restaurante_id', restaurante.id),
      ventana
    ),
  ])

  if (vinosRes.error) throw vinosRes.error
  if (platosRes.error) throw platosRes.error
  if (statsRes.error) throw statsRes.error

  return {
    ventana,
    vinos: vinosRes.data || [],
    platos: platosRes.data || [],
    propuestas: propuestasRes.error ? [] : (propuestasRes.data || []),
    stats: statsRes.data || [],
  }
}

async function resolverRestaurante(req, restauranteId) {
  const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
  if (auth.error) return auth

  let query = supabaseAdmin.from('restaurantes').select('*')
  if (restauranteId) query = query.eq('id', restauranteId)
  else query = query.eq('email', auth.user.email)

  const { data, error } = await query.single()
  if (error || !data) return { error: 'Restaurante no encontrado', status: 404 }
  return { restaurante: data, user: auth.user }
}

async function asegurarAccionesPersistidas(acciones, fechaOperativa, restauranteId) {
  const { data: existentes, error: existentesError } = await supabaseAdmin
    .from('daily_radar_actions')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('fecha_operativa', fechaOperativa)

  if (existentesError) {
    if (esTablaNoExiste(existentesError)) {
      return { acciones: acciones.map((item, index) => ({ ...item, id: `temp-${index}`, persistida: false })), persistidas: false }
    }
    throw existentesError
  }

  const existentesPorClave = new Map((existentes || []).map(item => [item.clave, item]))
  const clavesGeneradas = new Set(acciones.map(item => item.clave))
  const inserts = []
  const updates = []
  const caducadas = (existentes || []).filter(item =>
    item.origen === ORIGEN &&
    item.estado === 'pendiente' &&
    !clavesGeneradas.has(item.clave)
  )

  for (const accion of acciones) {
    const existente = existentesPorClave.get(accion.clave)
    if (!existente) {
      inserts.push(accion)
    } else if (['pendiente', 'en_progreso'].includes(existente.estado)) {
      updates.push({
        ...accion,
        id: existente.id,
        estado: existente.estado,
        created_at: existente.created_at,
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (inserts.length) {
    const { error } = await supabaseAdmin.from('daily_radar_actions').insert(inserts)
    if (error) throw error
  }

  for (const update of updates) {
    const { id, ...payload } = update
    const { error } = await supabaseAdmin.from('daily_radar_actions').update(payload).eq('id', id)
    if (error) throw error
  }

  if (caducadas.length) {
    const now = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('daily_radar_actions')
      .update({ estado: 'descartada', updated_at: now, descartada_at: now })
      .in('id', caducadas.map(item => item.id))
    if (error) throw error
  }

  const { data: finales, error: finalesError } = await supabaseAdmin
    .from('daily_radar_actions')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .eq('fecha_operativa', fechaOperativa)
    .order('created_at', { ascending: true })

  if (finalesError) throw finalesError
  return { acciones: finales || [], persistidas: true }
}

export async function GET(req) {
  let runLog = null
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    const acceso = await resolverRestaurante(req, restauranteId)
    if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })

    const datos = await cargarDatos(acceso.restaurante)
    const fechaOperativa = searchParams.get('fecha') || fechaOperativaDesdeVentana(datos.ventana)
    runLog = await iniciarAutomationRun({
      supabase: supabaseAdmin,
      jobKey: 'radar_diario',
      jobType: 'api',
      triggerSource: 'api.radar-diario',
      restauranteId: acceso.restaurante.id,
      idempotencyKey: `${acceso.restaurante.id}|${fechaOperativa}`,
      metrics: {
        fecha_operativa: fechaOperativa,
        vinos: datos.vinos.length,
        platos: datos.platos.length,
        estadisticas: datos.stats.length,
      },
    })
    const accionesGeneradas = generarAcciones({
      restaurante: acceso.restaurante,
      fechaOperativa,
      ...datos,
    })
    const persistencia = await asegurarAccionesPersistidas(accionesGeneradas, fechaOperativa, acceso.restaurante.id)
    await finalizarAutomationRun(runLog, {
      supabase: supabaseAdmin,
      status: 'success',
      processedCount: accionesGeneradas.length,
      successCount: persistencia.acciones.length,
      metrics: {
        fecha_operativa: fechaOperativa,
        generadas: accionesGeneradas.length,
        persistidas: persistencia.persistidas,
        finales: persistencia.acciones.length,
      },
    })

    return Response.json({
      fecha_operativa: fechaOperativa,
      etiqueta: datos.ventana.etiqueta,
      persistidas: persistencia.persistidas,
      acciones: persistencia.acciones,
    })
  } catch (error) {
    console.error('[radar-diario] GET:', error)
    await finalizarAutomationRun(runLog, {
      supabase: supabaseAdmin,
      status: 'failed',
      errorCount: 1,
      errorMessage: error.message || 'No se pudo generar el radar diario.',
    })
    return Response.json({ error: 'No se pudo generar el radar diario.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json()
    const restauranteId = String(body.restaurante_id || '').trim()
    const estado = String(body.estado || '').trim()
    const id = String(body.id || '').trim()
    if (!id || !restauranteId || !ESTADOS.has(estado)) {
      return Response.json({ error: 'id, restaurante_id y estado valido son obligatorios.' }, { status: 400 })
    }

    const acceso = await resolverRestaurante(req, restauranteId)
    if (acceso.error) return Response.json({ error: acceso.error }, { status: acceso.status })

    const now = new Date().toISOString()
    const update = {
      estado,
      updated_at: now,
      hecha_at: estado === 'hecha' ? now : null,
      descartada_at: estado === 'descartada' ? now : null,
    }

    const { data, error } = await supabaseAdmin
      .from('daily_radar_actions')
      .update(update)
      .eq('id', id)
      .eq('restaurante_id', restauranteId)
      .select('*')
      .single()

    if (error) {
      if (esTablaNoExiste(error)) return Response.json({ error: 'Migracion de radar diario pendiente.' }, { status: 409 })
      throw error
    }

    return Response.json({ accion: data })
  } catch (error) {
    console.error('[radar-diario] PATCH:', error)
    return Response.json({ error: 'No se pudo actualizar la accion diaria.' }, { status: 500 })
  }
}
