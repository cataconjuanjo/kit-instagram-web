export const COEFICIENTES_CONSULTORIA_FASE1 = {
  dias_periodo: {
    valor: 30,
    descripcion: 'Ventana inicial de analisis. Usa los ultimos 30 dias de eventos para ventas, popularidad y alertas.',
    origen: 'Practica operativa: un mes da senal reciente sin depender de un solo servicio.',
  },
  margen_saludable_pct: {
    valor: 55,
    descripcion: 'Margen bruto minimo considerado sano para una referencia con coste y PVP informados.',
    origen: 'Umbral comercial interno de consultoria para detectar vinos con compra cara o PVP poco defendido.',
  },
  margen_objetivo_pct: {
    valor: 65,
    descripcion: 'Margen bruto objetivo para leer si la carta esta cerca de una rentabilidad atractiva.',
    origen: 'Criterio interno: permite margen suficiente sin forzar precios irreales en hosteleria.',
  },
  btg_minimo_pct: {
    valor: 12,
    descripcion: 'Porcentaje minimo de referencias por copa recomendado sobre la carta total.',
    origen: 'Regla operativa usada en el modo consultor actual para activar rotacion y ticket medio.',
  },
  stock_alto_min_unidades: {
    valor: 8,
    descripcion: 'Stock minimo para considerar que una referencia puede estar inmovilizando capital si no vende.',
    origen: 'Regla conservadora para no marcar como problema una caja pequena o stock normal de servicio.',
  },
  multiplicador_stock_minimo_alto: {
    valor: 3,
    descripcion: 'Si el stock actual supera tres veces el stock minimo y no vende, se considera exceso potencial.',
    origen: 'Criterio operativo ya usado en bodega/inventario para detectar stock alto sin salida.',
  },
  dependencia_proveedor_pct: {
    valor: 40,
    descripcion: 'Si un proveedor concentra mas del 40% del valor a coste, hay riesgo de dependencia.',
    origen: 'Criterio de gestion: por encima de ese nivel se pierde poder de negociacion y flexibilidad.',
  },
  popularidad_factor: {
    valor: 0.7,
    descripcion: 'Factor aplicado a la popularidad media esperada para no penalizar cartas largas.',
    origen: 'Logica existente en Menu Engineering: 100 / referencias con venta * 0,7.',
  },
}

export const CATEGORIAS_MENU_ENGINEERING = {
  estrella: {
    ingles: 'star',
    nombre: 'Estrella',
    descripcion: 'Alta popularidad y alto margen.',
    acciones: ['Mantener en carta', 'Proteger stock', 'Dar buena visibilidad'],
  },
  joya: {
    ingles: 'puzzle',
    nombre: 'Joya oculta',
    descripcion: 'Baja popularidad y alto margen.',
    acciones: ['Dar mas visibilidad', 'Formar a sala', 'Probar venta sugerida'],
  },
  caballo: {
    ingles: 'plowhorse',
    nombre: 'Caballo de batalla',
    descripcion: 'Alta popularidad y bajo margen.',
    acciones: ['Revisar PVP', 'Renegociar compra', 'Buscar alternativa mas rentable'],
  },
  revisar: {
    ingles: 'dog',
    nombre: 'Revisar',
    descripcion: 'Baja popularidad y bajo margen.',
    acciones: ['Analizar salida de carta', 'Reposicionar', 'Promocion temporal si interesa mantenerlo'],
  },
}

function numero(valor) {
  return Number(valor) || 0
}

function redondear(valor, decimales = 2) {
  const factor = 10 ** decimales
  return Math.round((Number(valor) || 0) * factor) / factor
}

function porcentaje(valor, total) {
  return total ? redondear((valor / total) * 100, 2) : 0
}

function parseDetalle(detalle) {
  try { return JSON.parse(detalle || '{}') } catch { return {} }
}

function fechaHaceDias(dias) {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - dias)
  return fecha.toISOString()
}

function margenPct(precio, coste) {
  const p = numero(precio)
  const c = numero(coste)
  if (!p || !c) return 0
  return redondear(((p - c) / p) * 100, 2)
}

function ventaEventos(estadisticas = []) {
  return estadisticas
    .filter(evento => evento.tipo === 'venta')
    .map(evento => ({ ...evento, parsed: parseDetalle(evento.detalle) }))
}

export function calcularConsultoriaFase1({
  restaurante,
  vinos = [],
  estadisticas = [],
  movimientos = [],
  periodoInicio = fechaHaceDias(COEFICIENTES_CONSULTORIA_FASE1.dias_periodo.valor),
  periodoFin = new Date().toISOString(),
}) {
  const activos = vinos.filter(vino => vino.activo !== false)
  const ventas = ventaEventos(estadisticas)
  const ventasVendidas = ventas.filter(evento => evento.parsed?.resultado === 'vendida')
  const ventasPorVino = ventasVendidas.reduce((acc, evento) => {
    const id = String(evento.parsed?.vino_id || '')
    if (!id) return acc
    acc[id] = (acc[id] || 0) + (numero(evento.parsed?.cantidad) || 1)
    return acc
  }, {})
  const totalVentasUnidades = Object.values(ventasPorVino).reduce((sum, valor) => sum + valor, 0)

  const conCostePrecio = activos.filter(vino => numero(vino.coste_compra) > 0 && numero(vino.precio_botella) > 0)
  const valorStockCoste = activos.reduce((sum, vino) => sum + numero(vino.stock) * numero(vino.coste_compra), 0)
  const valorStockVenta = activos.reduce((sum, vino) => sum + numero(vino.stock) * numero(vino.precio_botella), 0)
  const beneficioPotencial = Math.max(0, valorStockVenta - valorStockCoste)
  const margenMedioPct = conCostePrecio.length
    ? conCostePrecio.reduce((sum, vino) => sum + margenPct(vino.precio_botella, vino.coste_compra), 0) / conCostePrecio.length
    : 0
  const porCopa = activos.filter(vino => numero(vino.precio_copa) > 0)
  const bajoMinimo = activos.filter(vino => numero(vino.stock_minimo) > 0 && numero(vino.stock) <= numero(vino.stock_minimo))
  const sinCoste = activos.filter(vino => !numero(vino.coste_compra))
  const sinPrecio = activos.filter(vino => !numero(vino.precio_botella))
  const margenBajo = conCostePrecio.filter(vino => margenPct(vino.precio_botella, vino.coste_compra) < COEFICIENTES_CONSULTORIA_FASE1.margen_saludable_pct.valor)
  const ajustesNegativos = movimientos.filter(mov => ['merma', 'ajuste', 'cata', 'invitacion'].includes(mov.tipo) && numero(mov.cantidad) < 0)
  const mermaUnidades = Math.abs(ajustesNegativos.reduce((sum, mov) => sum + numero(mov.cantidad), 0))
  const entradasUnidades = movimientos.filter(mov => mov.tipo === 'entrada').reduce((sum, mov) => sum + Math.max(0, numero(mov.cantidad)), 0)
  const salidasUnidades = movimientos.filter(mov => ['venta', 'merma', 'ajuste', 'cata', 'invitacion'].includes(mov.tipo)).reduce((sum, mov) => sum + Math.abs(Math.min(0, numero(mov.cantidad))), 0)

  const winePerformance = activos.map(vino => {
    const ventasUnidades = ventasPorVino[String(vino.id)] || 0
    const precio = numero(vino.precio_botella)
    const coste = numero(vino.coste_compra)
    const stock = numero(vino.stock)
    const ingresos = ventasUnidades * precio
    const costeEstimado = ventasUnidades * coste
    const beneficio = Math.max(0, ingresos - costeEstimado)
    return {
      restaurante_id: restaurante.id,
      vino_id: vino.id,
      periodo_inicio: periodoInicio,
      periodo_fin: periodoFin,
      ventas_unidades: ventasUnidades,
      ingresos_estimados: redondear(ingresos, 2),
      coste_estimado: redondear(costeEstimado, 2),
      beneficio_bruto: redondear(beneficio, 2),
      margen_bruto_pct: margenPct(precio, coste),
      popularidad_pct: porcentaje(ventasUnidades, totalVentasUnidades),
      rotacion_estimada: stock > 0 ? redondear(ventasUnidades / stock, 2) : ventasUnidades > 0 ? ventasUnidades : 0,
      stock_actual: Math.round(stock),
      valor_stock_coste: redondear(stock * coste, 2),
      vino,
    }
  })

  const ventasConActividad = winePerformance.filter(item => item.ventas_unidades > 0).length
  const umbralPopularidad = ventasConActividad > 0
    ? redondear((100 / ventasConActividad) * COEFICIENTES_CONSULTORIA_FASE1.popularidad_factor.valor, 2)
    : 0
  const umbralMargen = conCostePrecio.length
    ? redondear(winePerformance.filter(item => item.margen_bruto_pct > 0).reduce((sum, item) => sum + item.margen_bruto_pct, 0) / Math.max(1, winePerformance.filter(item => item.margen_bruto_pct > 0).length), 2)
    : COEFICIENTES_CONSULTORIA_FASE1.margen_saludable_pct.valor

  const clasificaciones = winePerformance
    .filter(item => numero(item.vino.coste_compra) > 0 && numero(item.vino.precio_botella) > 0)
    .map(item => {
      const rentable = item.margen_bruto_pct >= umbralMargen
      const popular = item.popularidad_pct >= umbralPopularidad && totalVentasUnidades > 0
      const categoria = rentable && popular ? 'estrella'
        : rentable && !popular ? 'joya'
        : !rentable && popular ? 'caballo'
        : 'revisar'
      const meta = CATEGORIAS_MENU_ENGINEERING[categoria]
      return {
        restaurante_id: restaurante.id,
        vino_id: item.vino_id,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        categoria,
        categoria_ingles: meta.ingles,
        margen_bruto_pct: item.margen_bruto_pct,
        popularidad_pct: item.popularidad_pct,
        umbral_margen_pct: umbralMargen,
        umbral_popularidad_pct: umbralPopularidad,
        explicacion: `${meta.nombre}: ${meta.descripcion} Margen ${item.margen_bruto_pct}% vs umbral ${umbralMargen}%; popularidad ${item.popularidad_pct}% vs umbral ${umbralPopularidad}%.`,
        acciones: meta.acciones,
        vino: item.vino,
      }
    })

  const ingresosEstimados = winePerformance.reduce((sum, item) => sum + item.ingresos_estimados, 0)
  const costeVentasEstimado = winePerformance.reduce((sum, item) => sum + item.coste_estimado, 0)
  const beneficioBrutoReal = winePerformance.reduce((sum, item) => sum + item.beneficio_bruto, 0)
  const beverageCostPct = porcentaje(costeVentasEstimado, ingresosEstimados)
  const grossMarginRealPct = porcentaje(beneficioBrutoReal, ingresosEstimados)
  const stockMedioEstimado = valorStockCoste
  const inventoryTurnover = stockMedioEstimado > 0 ? redondear(costeVentasEstimado / stockMedioEstimado, 2) : 0
  const deadStock = activos.filter(vino => {
    const stock = numero(vino.stock)
    const minimo = numero(vino.stock_minimo)
    const ventasUnidades = ventasPorVino[String(vino.id)] || 0
    return stock >= Math.max(
      COEFICIENTES_CONSULTORIA_FASE1.stock_alto_min_unidades.valor,
      minimo * COEFICIENTES_CONSULTORIA_FASE1.multiplicador_stock_minimo_alto.valor
    ) && ventasUnidades === 0
  })
  const deadStockValor = deadStock.reduce((sum, vino) => sum + numero(vino.stock) * numero(vino.coste_compra), 0)
  const deadStockRatio = porcentaje(deadStockValor, valorStockCoste)
  const shrinkageRate = salidasUnidades > 0 ? porcentaje(mermaUnidades, salidasUnidades) : 0
  const btgCoverage = porcentaje(porCopa.length, activos.length)
  const referenciasConDatosPct = porcentaje(conCostePrecio.length, activos.length)

  const proveedores = activos.reduce((acc, vino) => {
    const proveedor = (vino.proveedor || 'Sin proveedor').trim() || 'Sin proveedor'
    acc[proveedor] = acc[proveedor] || { referencias: 0, valor: 0 }
    acc[proveedor].referencias += 1
    acc[proveedor].valor += numero(vino.stock) * numero(vino.coste_compra)
    return acc
  }, {})
  const proveedorPrincipal = Object.entries(proveedores).sort((a, b) => b[1].valor - a[1].valor)[0]
  const proveedorPrincipalPct = proveedorPrincipal ? porcentaje(proveedorPrincipal[1].valor, valorStockCoste) : 0

  const kpis = [
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'margen_bruto_medio_pct', 'Margen bruto medio', redondear(margenMedioPct, 2), '%', 'rentabilidad', 'Media simple del margen de las referencias con coste y PVP.', 'Indica si los precios de carta dejan margen suficiente antes de otros costes.'),
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'beverage_cost_pct', 'Coste bebida estimado', beverageCostPct, '%', 'rentabilidad', 'Coste estimado de vinos vendidos / ingresos estimados por vino vendido.', 'Cuanto mas bajo, mas rentable. Si sube, hay compra cara, PVP bajo o mix poco rentable.'),
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'beneficio_bruto_estimado', 'Beneficio bruto estimado', redondear(beneficioBrutoReal, 2), 'EUR', 'rentabilidad', 'Ingresos estimados menos coste estimado de los vinos vendidos.', 'Dinero bruto generado por las ventas registradas antes de otros costes.'),
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'margen_bruto_real_pct', 'Margen bruto real estimado', grossMarginRealPct, '%', 'rentabilidad', 'Beneficio bruto estimado / ingresos estimados.', 'Lectura de rentabilidad real del periodo con los eventos registrados.'),
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'valor_stock_coste', 'Valor de bodega a coste', redondear(valorStockCoste, 2), 'EUR', 'inventario', 'Suma de stock actual por coste de compra.', 'Capital inmovilizado en bodega.'),
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'rotacion_inventario_estimada', 'Rotacion inventario estimada', inventoryTurnover, 'x', 'inventario', 'Coste estimado de ventas / valor actual de stock a coste.', 'Cuantas veces se mueve el capital de bodega en el periodo.'),
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'dead_stock_ratio_pct', 'Stock inmovilizado', deadStockRatio, '%', 'inventario', 'Valor de referencias con stock alto y cero ventas / valor total a coste.', 'Capital atrapado en vinos que no han salido en el periodo.'),
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'shrinkage_rate_pct', 'Merma y ajustes negativos', shrinkageRate, '%', 'inventario', 'Unidades de merma/ajustes negativos / salidas registradas.', 'Controla perdidas, invitaciones o descuadres de inventario.'),
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'btg_coverage_pct', 'Cobertura por copa', btgCoverage, '%', 'carta', 'Referencias con precio de copa / referencias activas.', 'Mide si la carta tiene palanca suficiente para venta por copa.'),
    crearKpi(restaurante.id, periodoInicio, periodoFin, 'datos_rentabilidad_completos_pct', 'Datos de rentabilidad completos', referenciasConDatosPct, '%', 'calidad_dato', 'Referencias con coste y PVP / referencias activas.', 'Sin coste y PVP no se puede vender consultoria de margen con seguridad.'),
  ]

  const alertas = []
  const recomendaciones = []

  function alerta(severidad, clave, titulo, detalle, impacto, accion, entidad = {}) {
    alertas.push({
      restaurante_id: restaurante.id,
      entidad_tipo: entidad.tipo || 'restaurante',
      entidad_id: entidad.id || null,
      severidad,
      clave,
      titulo,
      detalle,
      impacto,
      accion_sugerida: accion,
      periodo_inicio: periodoInicio,
      periodo_fin: periodoFin,
    })
  }

  function recomendacion(tipo, titulo, detalle, accion, prioridad = 'media', esfuerzo = 'medio', entidad = {}, coeficientes = {}) {
    recomendaciones.push({
      restaurante_id: restaurante.id,
      entidad_tipo: entidad.tipo || 'restaurante',
      entidad_id: entidad.id || null,
      tipo,
      titulo,
      detalle,
      accion,
      prioridad,
      esfuerzo,
      coeficientes,
      periodo_inicio: periodoInicio,
      periodo_fin: periodoFin,
    })
  }

  if (referenciasConDatosPct < 80) {
    alerta('critica', 'datos_rentabilidad_incompletos', 'Rentabilidad incompleta', `${sinCoste.length} vinos sin coste y ${sinPrecio.length} sin PVP.`, 'No se puede defender margen real ante el cliente.', 'Completar coste y PVP antes de presentar diagnostico economico.')
    recomendacion('calidad_dato', 'Completar datos economicos', `Hay ${activos.length - conCostePrecio.length} referencias sin coste o PVP completo.`, 'Abrir bodega y completar coste/PVP de las referencias principales.', 'alta', 'medio', {}, { referenciasConDatosPct })
  }

  if (margenMedioPct > 0 && margenMedioPct < COEFICIENTES_CONSULTORIA_FASE1.margen_saludable_pct.valor) {
    alerta('critica', 'margen_medio_bajo', 'Margen medio bajo', `Margen medio ${redondear(margenMedioPct, 1)}%, por debajo del ${COEFICIENTES_CONSULTORIA_FASE1.margen_saludable_pct.valor}%.`, 'La carta puede estar dejando dinero en cada botella.', 'Revisar PVP o negociar compra en referencias de margen bajo.')
    recomendacion('pricing', 'Revisar referencias de margen bajo', `${margenBajo.length} vinos estan por debajo del margen saludable.`, 'Ordenar por margen y corregir primero los vinos con ventas o stock alto.', 'alta', 'medio', {}, { margen_saludable_pct: COEFICIENTES_CONSULTORIA_FASE1.margen_saludable_pct.valor })
  }

  if (bajoMinimo.length > 0) {
    alerta('aviso', 'stock_bajo_minimo', 'Reposicion pendiente', `${bajoMinimo.length} referencias estan bajo minimo.`, 'Riesgo de ruptura durante el servicio.', 'Preparar pedido sugerido por proveedor.')
    recomendacion('inventario', 'Preparar pedido de reposicion', `Hay ${bajoMinimo.length} vinos bajo minimo.`, 'Usar la vista Bodega para copiar el pedido sugerido.', 'media', 'bajo')
  }

  if (deadStock.length > 0) {
    alerta(deadStockRatio >= 15 ? 'critica' : 'aviso', 'stock_inmovilizado', 'Stock inmovilizado', `${deadStock.length} referencias con stock alto y sin ventas.`, `${redondear(deadStockValor, 0)} EUR aproximados parados a coste.`, 'Marcar candidatos a salir o activar venta sugerida.')
    recomendacion('inventario', 'Liberar capital de stock inmovilizado', `Stock inmovilizado estimado: ${redondear(deadStockValor, 0)} EUR.`, 'Revisar esas referencias: promocion, copa, maridaje o salida de carta.', deadStockRatio >= 15 ? 'alta' : 'media', 'medio', {}, { deadStockRatio })
  }

  if (btgCoverage < COEFICIENTES_CONSULTORIA_FASE1.btg_minimo_pct.valor && activos.length >= 10) {
    alerta('aviso', 'cobertura_copa_baja', 'Poca venta por copa', `Solo ${btgCoverage}% de la carta tiene precio por copa.`, 'Menos palancas para subir ticket y rotar referencias.', 'Definir 3-6 vinos por copa segun estilo y margen.')
    recomendacion('btg', 'Crear programa minimo por copa', `Cobertura actual por copa: ${btgCoverage}%.`, 'Seleccionar vinos con buen margen, stock suficiente y argumento facil para sala.', 'media', 'medio', {}, { btg_minimo_pct: COEFICIENTES_CONSULTORIA_FASE1.btg_minimo_pct.valor })
  }

  if (proveedorPrincipalPct > COEFICIENTES_CONSULTORIA_FASE1.dependencia_proveedor_pct.valor && proveedorPrincipal) {
    alerta('aviso', 'dependencia_proveedor', 'Dependencia de proveedor', `${proveedorPrincipal[0]} concentra ${proveedorPrincipalPct}% del valor a coste.`, 'Menor poder de negociacion y mas riesgo si falla suministro.', 'Diversificar compras o renegociar condiciones.')
    recomendacion('proveedores', 'Reducir dependencia de proveedor', `${proveedorPrincipal[0]} concentra demasiado valor de bodega.`, 'Buscar alternativas en gamas equivalentes o negociar condiciones por volumen.', 'media', 'medio', {}, { dependencia_proveedor_pct: COEFICIENTES_CONSULTORIA_FASE1.dependencia_proveedor_pct.valor })
  }

  clasificaciones
    .filter(item => ['caballo', 'joya', 'revisar'].includes(item.categoria))
    .slice(0, 12)
    .forEach(item => {
      const meta = CATEGORIAS_MENU_ENGINEERING[item.categoria]
      const prioridad = item.categoria === 'revisar' ? 'alta' : 'media'
      recomendacion(
        'menu_engineering',
        `${meta.nombre}: ${item.vino.nombre}`,
        item.explicacion,
        meta.acciones[0],
        prioridad,
        item.categoria === 'caballo' ? 'medio' : 'bajo',
        { tipo: 'vino', id: item.vino_id },
        {
          umbral_margen_pct: item.umbral_margen_pct,
          umbral_popularidad_pct: item.umbral_popularidad_pct,
        }
      )
    })

  return {
    periodoInicio,
    periodoFin,
    kpis,
    winePerformance,
    clasificaciones,
    alertas,
    recomendaciones,
    resumen: {
      vinos_activos: activos.length,
      ventas_unidades: totalVentasUnidades,
      margen_medio_pct: redondear(margenMedioPct, 2),
      valor_stock_coste: redondear(valorStockCoste, 2),
      alertas: alertas.length,
      recomendaciones: recomendaciones.length,
      clasificaciones: clasificaciones.length,
      proveedor_principal: proveedorPrincipal ? proveedorPrincipal[0] : '',
      proveedor_principal_pct: proveedorPrincipalPct,
      entradas_unidades: entradasUnidades,
      salidas_unidades: salidasUnidades,
    },
  }
}

function crearKpi(restauranteId, periodoInicio, periodoFin, clave, nombre, valor, unidad, categoria, formula, interpretacion) {
  return {
    restaurante_id: restauranteId,
    periodo_inicio: periodoInicio,
    periodo_fin: periodoFin,
    clave,
    nombre,
    valor: redondear(valor, 4),
    unidad,
    categoria,
    fuente: 'motor_consultoria_fase1',
    coeficientes: {
      formula,
      dias_periodo: COEFICIENTES_CONSULTORIA_FASE1.dias_periodo.valor,
    },
    interpretacion,
  }
}

export function limpiarPayloadPersistencia(resultado) {
  return {
    kpis: resultado.kpis,
    winePerformance: resultado.winePerformance.map(({ vino, ...item }) => item),
    clasificaciones: resultado.clasificaciones.map(({ vino, ...item }) => item),
    alertas: resultado.alertas,
    recomendaciones: resultado.recomendaciones,
  }
}
