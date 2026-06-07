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
  dias_cobertura_lento: {
    valor: 90,
    descripcion: 'Si el stock disponible cubre mas de 90 dias al ritmo de venta actual, la referencia se considera lenta.',
    origen: 'Criterio operativo: tres meses de cobertura indica que el vino puede estar ocupando capital demasiado tiempo.',
  },
  dias_cobertura_exceso: {
    valor: 120,
    descripcion: 'Si el stock disponible cubre mas de 120 dias al ritmo de venta actual, se considera exceso de inventario.',
    origen: 'Criterio de compra: por encima de cuatro meses conviene frenar compras o activar salida.',
  },
  pareto_concentrado_pct: {
    valor: 75,
    descripcion: 'Si el 20% de referencias concentra mas del 75% de ventas, la carta esta comercialmente concentrada.',
    origen: 'Lectura Pareto adaptada a carta: demasiada venta en pocas referencias puede indicar carta inflada.',
  },
  productividad_ventas_peso: {
    valor: 45,
    descripcion: 'Peso de la venta real dentro del score de productividad por referencia.',
    origen: 'La venta real es la senal mas fuerte de que una referencia aporta a la carta.',
  },
  productividad_margen_peso: {
    valor: 30,
    descripcion: 'Peso del margen bruto dentro del score de productividad.',
    origen: 'Una referencia debe vender, pero tambien dejar margen.',
  },
  productividad_rotacion_peso: {
    valor: 25,
    descripcion: 'Peso de la rotacion relativa dentro del score de productividad.',
    origen: 'Premia referencias que no solo venden, sino que mueven stock.',
  },
  penalizacion_stock_parado: {
    valor: 20,
    descripcion: 'Penalizacion maxima por tener mucho valor en stock con baja salida.',
    origen: 'Evita que un vino con margen teorico alto parezca bueno si tiene capital parado.',
  },
  copas_por_botella: {
    valor: 5,
    descripcion: 'Numero operativo de copas vendibles por botella.',
    origen: 'Servicio habitual en hosteleria con copa de 150 ml sobre botella de 75 cl.',
  },
  merma_copa_pct: {
    valor: 10,
    descripcion: 'Merma base estimada para venta por copa.',
    origen: 'Criterio prudente por oxidacion, prueba, derrame o ultima copa no vendida.',
  },
  margen_objetivo_copa_pct: {
    valor: 70,
    descripcion: 'Margen objetivo para calcular precio sugerido por copa.',
    origen: 'La copa debe compensar servicio, merma y riesgo de apertura.',
  },
  precio_minimo_copa: {
    valor: 4.5,
    descripcion: 'Precio minimo recomendado para que una copa sea operativamente rentable.',
    origen: 'Criterio comercial base para no vender copas con poco margen absoluto.',
  },
  factor_anualizacion: {
    valor: 12,
    descripcion: 'Multiplicador prudente para convertir oportunidad mensual en oportunidad anual.',
    origen: 'Se usa 12 meses como lectura simple y vendible del potencial anual.',
  },
  recuperacion_margen_objetivo_pct: {
    valor: 55,
    descripcion: 'Margen minimo objetivo para estimar dinero recuperable en referencias de margen bajo.',
    origen: 'Mismo umbral saludable usado en rentabilidad para no inflar el calculo.',
  },
  capital_liberable_stock_pct: {
    valor: 50,
    descripcion: 'Porcentaje prudente de stock inmovilizado que podria liberarse con acciones de carta/compra.',
    origen: 'No se asume liberar todo el stock parado; se estima solo la mitad como escenario realista.',
  },
  factor_oportunidad_copa_anual: {
    valor: 6,
    descripcion: 'Multiplicador prudente para oportunidad por copa detectada.',
    origen: 'No se asume vender todos los candidatos cada mes; se estima seis ciclos de activacion al ano.',
  },
  umbral_copa_premium: {
    valor: 35,
    descripcion: 'PVP botella desde el que una referencia puede considerarse candidata a copa premium.',
    origen: 'Rango donde vender por copa ayuda a que el cliente pruebe vinos de ticket superior.',
  },
  umbral_coravin: {
    valor: 55,
    descripcion: 'PVP botella desde el que una referencia puede considerarse candidata a Coravin.',
    origen: 'Rango donde abrir botella completa tiene mas riesgo y Coravin puede proteger margen.',
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

function limitar(valor, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(valor) || 0))
}

function ticketRestaurante(restaurante) {
  return numero(restaurante?.ticket_medio || restaurante?.ticket_medio_comida || restaurante?.ticket_comida)
}

function rangosPrecioCarta(restaurante) {
  const ticket = ticketRestaurante(restaurante)
  if (!ticket) {
    return [
      { id: 'baja', nombre: 'Gama baja', min: 0, max: 22 },
      { id: 'media', nombre: 'Gama media', min: 22, max: 35 },
      { id: 'alta', nombre: 'Gama alta', min: 35, max: 55 },
      { id: 'muy_alta', nombre: 'Muy alta', min: 55, max: 90 },
      { id: 'premium', nombre: 'Premium', min: 90, max: Infinity },
    ]
  }

  const baja = Math.max(22, ticket * 0.60)
  const media = Math.max(baja + 10, ticket * 1.05)
  const alta = Math.max(media + 14, ticket * 1.65)
  const muyAlta = Math.max(alta + 24, ticket * 2.50)
  return [
    { id: 'baja', nombre: 'Gama baja', min: 0, max: baja },
    { id: 'media', nombre: 'Gama media', min: baja, max: media },
    { id: 'alta', nombre: 'Gama alta', min: media, max: alta },
    { id: 'muy_alta', nombre: 'Muy alta', min: alta, max: muyAlta },
    { id: 'premium', nombre: 'Premium', min: muyAlta, max: Infinity },
  ]
}

function gamaParaPrecio(precio, rangos) {
  const rango = rangos.find(item => item.max === Infinity ? precio >= item.min : precio >= item.min && precio < item.max)
  return rango || rangos[rangos.length - 1]
}

function precioCopaSugerido(costeBotella, pvpBotella) {
  const coste = numero(costeBotella)
  if (!coste) return 0
  const copas = COEFICIENTES_CONSULTORIA_FASE1.copas_por_botella.valor
  const merma = COEFICIENTES_CONSULTORIA_FASE1.merma_copa_pct.valor / 100
  const margenObjetivo = COEFICIENTES_CONSULTORIA_FASE1.margen_objetivo_copa_pct.valor / 100
  const copasVendibles = Math.max(1, copas * (1 - merma))
  const precioPorMargen = (coste / copasVendibles) / (1 - margenObjetivo)
  const minimo = COEFICIENTES_CONSULTORIA_FASE1.precio_minimo_copa.valor
  const techoComercial = pvpBotella ? numero(pvpBotella) * 0.32 : 0
  const sugerido = Math.max(minimo, precioPorMargen, techoComercial)
  return redondear(Math.ceil(sugerido * 2) / 2, 2)
}

function areaProblema(clave = '') {
  if (/stock|inventario|merma|proveedor/.test(clave)) return 'Inventario y compras'
  if (/copa|coravin|btg/.test(clave)) return 'Venta por copa'
  if (/carta|precio|pareto|gama|hueco/.test(clave)) return 'Carta y arquitectura'
  if (/margen|rentabilidad|beverage/.test(clave)) return 'Rentabilidad'
  if (/datos|coste|pvp/.test(clave)) return 'Calidad de datos'
  return 'Gestion comercial'
}

function impactoDesdePrioridad(prioridad = 'media') {
  if (prioridad === 'alta') return 'alto'
  if (prioridad === 'baja') return 'bajo'
  return 'medio'
}

function faseDesdeRecomendacion(rec = {}) {
  if (rec.esfuerzo === 'bajo') return 'accion_rapida'
  if (rec.prioridad === 'alta' && rec.esfuerzo !== 'alto') return 'accion_rapida'
  if (rec.esfuerzo === 'alto') return 'estrategico'
  if (['proveedores', 'carta', 'btg', 'venta_por_copa'].includes(rec.tipo)) return 'medio_plazo'
  return 'medio_plazo'
}

function crearModoConsultor({ restaurante, periodoInicio, periodoFin, alertas, recomendaciones, resumen }) {
  const criticas = alertas.filter(alerta => alerta.severidad === 'critica').length
  const avisos = alertas.filter(alerta => alerta.severidad === 'aviso').length
  const score = Math.min(100, criticas * 22 + avisos * 10 + recomendaciones.filter(rec => rec.prioridad === 'alta').length * 8)
  const prioridad = score >= 65 ? 'alta' : score >= 35 ? 'media' : 'baja'
  const principal = alertas[0]
  const problemas = alertas.slice(0, 10).map(alerta => ({
    area: areaProblema(alerta.clave),
    severidad: alerta.severidad,
    titulo: alerta.titulo,
    detalle: alerta.detalle,
    accion: alerta.accion_sugerida,
  }))

  const acciones = recomendaciones.slice(0, 18).map(rec => ({
    fase: faseDesdeRecomendacion(rec),
    titulo: rec.titulo,
    detalle: rec.detalle,
    accion: rec.accion,
    prioridad: rec.prioridad,
    impacto: impactoDesdePrioridad(rec.prioridad),
    esfuerzo: rec.esfuerzo,
  }))

  const quickWins = acciones.filter(item => item.fase === 'accion_rapida').slice(0, 6)
  const medioPlazo = acciones.filter(item => item.fase === 'medio_plazo').slice(0, 6)
  const estrategico = [
    ...acciones.filter(item => item.fase === 'estrategico'),
    ...(resumen.carta?.carta_inflada ? [{
      fase: 'estrategico',
      titulo: 'Rediseñar arquitectura de carta',
      detalle: 'La carta muestra señales de exceso o baja productividad.',
      accion: 'Reordenar carta por gamas, estilos y productividad antes de seguir ampliando referencias.',
      prioridad: 'alta',
      impacto: 'alto',
      esfuerzo: 'alto',
    }] : []),
    ...(resumen.copa?.candidatos > 0 ? [{
      fase: 'estrategico',
      titulo: 'Crear programa estable de venta por copa',
      detalle: `Hay ${resumen.copa.candidatos} candidatos detectados para copa, copa premium o Coravin.`,
      accion: 'Definir seleccion mensual por copa, precio, merma esperada y seguimiento de salida.',
      prioridad: 'media',
      impacto: 'alto',
      esfuerzo: 'alto',
    }] : []),
  ].slice(0, 6)

  const nombre = restaurante?.nombre || 'el restaurante'
  const resumenEjecutivo = principal
    ? `${nombre} presenta prioridad ${prioridad}. El principal foco de trabajo es: ${principal.titulo.toLowerCase()}. Se recomiendan ${quickWins.length} acciones rapidas, ${medioPlazo.length} acciones de medio plazo y ${estrategico.length} acciones estrategicas.`
    : `${nombre} no presenta alertas criticas en esta foto. Conviene mantener seguimiento mensual de margen, inventario, carta y venta por copa.`
  const estadoActual = `Foto actual: ${resumen.vinos_activos} vinos activos, margen medio ${resumen.margen_medio_pct}%, valor de bodega ${resumen.valor_stock_coste} EUR, ${resumen.ventas_unidades} ventas registradas en el periodo.`

  const diagnostic = {
    restaurante_id: restaurante.id,
    periodo_inicio: periodoInicio,
    periodo_fin: periodoFin,
    score,
    prioridad,
    resumen_ejecutivo: resumenEjecutivo,
    estado_actual: estadoActual,
    problema_principal: principal?.titulo || 'Sin problema critico dominante',
    quick_wins: quickWins,
    medio_plazo: medioPlazo,
    estrategico,
    problemas_detectados: problemas,
  }

  const items = [...quickWins, ...medioPlazo, ...estrategico].map(item => ({
    restaurante_id: restaurante.id,
    fase: item.fase,
    titulo: item.titulo,
    detalle: item.detalle,
    accion: item.accion,
    prioridad: item.prioridad,
    impacto: item.impacto,
    esfuerzo: item.esfuerzo,
  }))

  return { diagnostic, items }
}

function crearMotorOportunidad({ restaurante, periodoInicio, periodoFin, winePerformance, margenBajo, deadStockValor, btgSnapshot, wineListSnapshot, wineListItems }) {
  const oportunidades = []
  const factorAnual = COEFICIENTES_CONSULTORIA_FASE1.factor_anualizacion.valor
  const margenObjetivo = COEFICIENTES_CONSULTORIA_FASE1.recuperacion_margen_objetivo_pct.valor / 100

  const margenRecuperablePeriodo = winePerformance.reduce((sum, item) => {
    const precio = numero(item.vino.precio_botella)
    const coste = numero(item.vino.coste_compra)
    const ventas = numero(item.ventas_unidades)
    if (!precio || !coste || !ventas) return sum
    const beneficioActual = precio - coste
    const beneficioObjetivo = precio * margenObjetivo
    return sum + Math.max(0, beneficioObjetivo - beneficioActual) * ventas
  }, 0)
  const margenRecuperableAnual = redondear(margenRecuperablePeriodo * factorAnual, 2)
  if (margenRecuperableAnual > 0) {
    oportunidades.push({
      area: 'Rentabilidad',
      titulo: 'Recuperar margen en referencias de margen bajo',
      detalle: `${margenBajo.length} referencias estan por debajo del margen saludable.`,
      accion: 'Revisar PVP, coste de compra o sustitucion de las referencias con ventas y margen bajo.',
      impacto_estimado: margenRecuperableAnual,
      tipo_impacto: 'margen',
      horizonte: 'accion_rapida',
      dificultad: 'media',
      confianza_pct: 70,
      prioridad: 'alta',
      formula: 'Diferencia hasta margen saludable por unidad vendida x ventas del periodo x 12.',
    })
  }

  const capitalLiberable = redondear(deadStockValor * (COEFICIENTES_CONSULTORIA_FASE1.capital_liberable_stock_pct.valor / 100), 2)
  if (capitalLiberable > 0) {
    oportunidades.push({
      area: 'Inventario',
      titulo: 'Liberar capital de stock inmovilizado',
      detalle: `Stock inmovilizado detectado a coste: ${redondear(deadStockValor, 0)} EUR.`,
      accion: 'Frenar compras, activar venta sugerida y retirar referencias inmovilizadas.',
      impacto_estimado: capitalLiberable,
      tipo_impacto: 'capital',
      horizonte: 'accion_rapida',
      dificultad: 'baja',
      confianza_pct: 80,
      prioridad: 'alta',
      formula: 'Stock inmovilizado a coste x 50% liberable estimado.',
    })
  }

  const copaPotencial = redondear(numero(btgSnapshot?.beneficio_potencial_estimado) * COEFICIENTES_CONSULTORIA_FASE1.factor_oportunidad_copa_anual.valor, 2)
  if (copaPotencial > 0) {
    oportunidades.push({
      area: 'Venta por copa',
      titulo: 'Activar beneficio por venta por copa',
      detalle: `${btgSnapshot.candidatos_copa + btgSnapshot.candidatos_copa_premium + btgSnapshot.candidatos_coravin} candidatos detectados.`,
      accion: 'Probar seleccion por copa durante 30 dias y medir margen/rotacion.',
      impacto_estimado: copaPotencial,
      tipo_impacto: 'ventas',
      horizonte: 'medio_plazo',
      dificultad: 'media',
      confianza_pct: 60,
      prioridad: 'media',
      formula: 'Beneficio por vender una botella de cada candidato por copa x 6 ciclos anuales.',
    })
  }

  const bottomValor = wineListItems.filter(item => item.es_bottom10).reduce((sum, item) => sum + numero(item.valor_stock_coste), 0)
  const cartaPotencial = redondear(bottomValor * 0.25, 2)
  if (cartaPotencial > 0) {
    oportunidades.push({
      area: 'Carta',
      titulo: 'Reconvertir referencias de bajo rendimiento',
      detalle: `${wineListSnapshot.bottom10_refs} referencias estan en bajo rendimiento.`,
      accion: 'Retirar, reposicionar o sustituir referencias de baja productividad.',
      impacto_estimado: cartaPotencial,
      tipo_impacto: 'capital',
      horizonte: 'medio_plazo',
      dificultad: 'media',
      confianza_pct: 55,
      prioridad: 'media',
      formula: 'Valor a coste del bottom 10% x 25% recuperable estimado.',
    })
  }

  if (wineListSnapshot.huecos_precio?.length) {
    oportunidades.push({
      area: 'Carta',
      titulo: 'Cubrir huecos de precio',
      detalle: `${wineListSnapshot.huecos_precio.length} gamas sin referencias detectadas.`,
      accion: 'Introducir pocas referencias con margen sano en los huecos de precio.',
      impacto_estimado: 0,
      tipo_impacto: 'ventas',
      horizonte: 'estrategico',
      dificultad: 'media',
      confianza_pct: 45,
      prioridad: 'media',
      formula: 'Oportunidad cualitativa: requiere ventas reales posteriores para cuantificar.',
    })
  }

  const ordenadas = oportunidades.sort((a, b) => b.impacto_estimado - a.impacto_estimado)
  const total = redondear(ordenadas.filter(item => item.tipo_impacto !== 'capital').reduce((sum, item) => sum + item.impacto_estimado, 0), 2)
  const capital = redondear(ordenadas.filter(item => item.tipo_impacto === 'capital').reduce((sum, item) => sum + item.impacto_estimado, 0), 2)
  const quick = redondear(ordenadas.filter(item => item.horizonte === 'accion_rapida').reduce((sum, item) => sum + item.impacto_estimado, 0), 2)
  const medio = redondear(ordenadas.filter(item => item.horizonte === 'medio_plazo').reduce((sum, item) => sum + item.impacto_estimado, 0), 2)
  const estrategico = redondear(ordenadas.filter(item => item.horizonte === 'estrategico').reduce((sum, item) => sum + item.impacto_estimado, 0), 2)
  const confianza = ordenadas.length ? redondear(ordenadas.reduce((sum, item) => sum + item.confianza_pct, 0) / ordenadas.length, 2) : 0
  const resumen = ordenadas.length
    ? `Oportunidad estimada: ${total} EUR anuales de mejora y ${capital} EUR de capital liberable. Las primeras acciones recomendadas son ${ordenadas.slice(0, 2).map(item => item.titulo.toLowerCase()).join(' y ')}.`
    : 'No hay oportunidad economica cuantificable con los datos actuales; conviene mejorar datos y ventas registradas.'

  return {
    snapshot: {
      restaurante_id: restaurante.id,
      periodo_inicio: periodoInicio,
      periodo_fin: periodoFin,
      recuperacion_anual_estimada: total,
      impacto_acciones_rapidas: quick,
      impacto_medio_plazo: medio,
      impacto_estrategico: estrategico,
      capital_liberable_estimado: capital,
      confianza_media_pct: confianza,
      oportunidades_total: ordenadas.length,
      resumen,
    },
    items: ordenadas.map(item => ({
      restaurante_id: restaurante.id,
      ...item,
    })),
  }
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

  const inventarioItems = activos.map(vino => {
    const stock = Math.round(numero(vino.stock))
    const stockMinimo = Math.round(numero(vino.stock_minimo))
    const coste = numero(vino.coste_compra)
    const precio = numero(vino.precio_botella)
    const ventasUnidades = ventasPorVino[String(vino.id)] || 0
    const ventasDia = ventasUnidades / Math.max(1, COEFICIENTES_CONSULTORIA_FASE1.dias_periodo.valor)
    const diasCobertura = ventasDia > 0 ? Math.round(stock / ventasDia) : null
    const valor = redondear(stock * coste, 2)
    const limiteStockAlto = Math.max(
      COEFICIENTES_CONSULTORIA_FASE1.stock_alto_min_unidades.valor,
      stockMinimo * COEFICIENTES_CONSULTORIA_FASE1.multiplicador_stock_minimo_alto.valor
    )

    let estado = 'normal'
    let motivo = 'Inventario equilibrado para los datos disponibles.'
    if (!coste || !precio) {
      estado = 'sin_datos'
      motivo = 'Falta coste o PVP para interpretar bien la referencia.'
    } else if (stockMinimo > 0 && stock <= stockMinimo) {
      estado = 'bajo_minimo'
      motivo = 'Stock actual igual o inferior al minimo configurado.'
    } else if (stock >= limiteStockAlto && ventasUnidades === 0) {
      estado = 'inmovilizado'
      motivo = 'Stock alto y cero ventas registradas en el periodo.'
    } else if (diasCobertura !== null && diasCobertura >= COEFICIENTES_CONSULTORIA_FASE1.dias_cobertura_exceso.valor) {
      estado = 'exceso'
      motivo = `Cobertura estimada de ${diasCobertura} dias, por encima del umbral de exceso.`
    } else if (diasCobertura !== null && diasCobertura >= COEFICIENTES_CONSULTORIA_FASE1.dias_cobertura_lento.valor) {
      estado = 'lento'
      motivo = `Cobertura estimada de ${diasCobertura} dias, por encima del umbral lento.`
    }

    return {
      restaurante_id: restaurante.id,
      vino_id: vino.id,
      proveedor: vino.proveedor || '',
      stock_actual: stock,
      stock_minimo: stockMinimo,
      ventas_unidades: ventasUnidades,
      coste_compra: redondear(coste, 2),
      precio_botella: redondear(precio, 2),
      valor_stock_coste: valor,
      dias_cobertura: diasCobertura,
      estado_inventario: estado,
      motivo,
      vino,
    }
  })

  const inventarioResumen = {
    referencias_activas: activos.length,
    unidades_totales: activos.reduce((sum, vino) => sum + Math.round(numero(vino.stock)), 0),
    valor_coste_total: redondear(valorStockCoste, 2),
    valor_venta_total: redondear(valorStockVenta, 2),
    stock_inmovilizado_refs: inventarioItems.filter(item => item.estado_inventario === 'inmovilizado').length,
    stock_inmovilizado_valor: redondear(inventarioItems.filter(item => item.estado_inventario === 'inmovilizado').reduce((sum, item) => sum + item.valor_stock_coste, 0), 2),
    referencias_lentas: inventarioItems.filter(item => item.estado_inventario === 'lento').length,
    exceso_stock_refs: inventarioItems.filter(item => item.estado_inventario === 'exceso').length,
    proveedor_principal: proveedorPrincipal ? proveedorPrincipal[0] : '',
    proveedor_principal_pct: proveedorPrincipalPct,
    merma_unidades: mermaUnidades,
    tasa_merma_pct: shrinkageRate,
  }

  const rangosCarta = rangosPrecioCarta(restaurante)
  const maxVentas = Math.max(1, ...winePerformance.map(item => item.ventas_unidades))
  const maxRotacion = Math.max(1, ...winePerformance.map(item => item.rotacion_estimada))
  const maxValorStock = Math.max(1, ...winePerformance.map(item => item.valor_stock_coste))
  const top20Count = Math.max(1, Math.ceil(activos.length * 0.20))
  const bottom10Count = Math.max(1, Math.ceil(activos.length * 0.10))
  const top20Ids = new Set(
    [...winePerformance]
      .sort((a, b) => b.ventas_unidades - a.ventas_unidades || b.beneficio_bruto - a.beneficio_bruto)
      .slice(0, top20Count)
      .map(item => String(item.vino_id))
  )

  const wineListItemsBase = winePerformance.map(item => {
    const precio = numero(item.vino.precio_botella)
    const gama = gamaParaPrecio(precio, rangosCarta)
    const ventaScore = (item.ventas_unidades / maxVentas) * COEFICIENTES_CONSULTORIA_FASE1.productividad_ventas_peso.valor
    const margenScore = limitar(item.margen_bruto_pct, 0, 80) / 80 * COEFICIENTES_CONSULTORIA_FASE1.productividad_margen_peso.valor
    const rotacionScore = (item.rotacion_estimada / maxRotacion) * COEFICIENTES_CONSULTORIA_FASE1.productividad_rotacion_peso.valor
    const stockPenalty = item.ventas_unidades === 0
      ? (item.valor_stock_coste / maxValorStock) * COEFICIENTES_CONSULTORIA_FASE1.penalizacion_stock_parado.valor
      : 0
    const productividad = limitar(ventaScore + margenScore + rotacionScore - stockPenalty, 0, 100)
    return {
      restaurante_id: restaurante.id,
      vino_id: item.vino_id,
      nombre: item.vino.nombre || '',
      bodega: item.vino.bodega || '',
      tipo: item.vino.tipo || '',
      region: item.vino.region || '',
      gama: gama.nombre,
      precio_botella: redondear(precio, 2),
      ventas_unidades: item.ventas_unidades,
      margen_bruto_pct: item.margen_bruto_pct,
      popularidad_pct: item.popularidad_pct,
      productividad_score: redondear(productividad, 2),
      valor_stock_coste: item.valor_stock_coste,
      es_top20: top20Ids.has(String(item.vino_id)),
      es_bottom10: false,
      motivo: '',
      vino: item.vino,
    }
  })

  const bottomIds = new Set(
    [...wineListItemsBase]
      .filter(item => item.precio_botella > 0)
      .sort((a, b) => a.productividad_score - b.productividad_score || b.valor_stock_coste - a.valor_stock_coste)
      .slice(0, bottom10Count)
      .map(item => String(item.vino_id))
  )

  const wineListItems = wineListItemsBase.map(item => {
    const esBottom = bottomIds.has(String(item.vino_id))
    const motivos = []
    if (!item.ventas_unidades) motivos.push('sin ventas registradas')
    if (item.margen_bruto_pct && item.margen_bruto_pct < COEFICIENTES_CONSULTORIA_FASE1.margen_saludable_pct.valor) motivos.push('margen bajo')
    if (item.valor_stock_coste > 0 && !item.ventas_unidades) motivos.push('stock con capital parado')
    return {
      ...item,
      es_bottom10: esBottom,
      motivo: esBottom
        ? `Bajo rendimiento: ${motivos.length ? motivos.join(', ') : 'score de productividad bajo'}.`
        : 'Referencia fuera del grupo de bajo rendimiento.',
    }
  })

  const top20Ventas = wineListItems.filter(item => item.es_top20).reduce((sum, item) => sum + item.ventas_unidades, 0)
  const paretoTop20Pct = porcentaje(top20Ventas, totalVentasUnidades)
  const referenciasConVenta = wineListItems.filter(item => item.ventas_unidades > 0).length
  const productividadMedia = wineListItems.length
    ? redondear(wineListItems.reduce((sum, item) => sum + item.productividad_score, 0) / wineListItems.length, 2)
    : 0
  const resumenGamas = rangosCarta.map(rango => {
    const items = wineListItems.filter(item => item.gama === rango.nombre)
    const ventasGama = items.reduce((sum, item) => sum + item.ventas_unidades, 0)
    const margenMedioGama = items.length ? items.reduce((sum, item) => sum + item.margen_bruto_pct, 0) / items.length : 0
    return {
      id: rango.id,
      nombre: rango.nombre,
      rango: rango.max === Infinity ? `>${Math.round(rango.min)}` : `${Math.round(rango.min)}-${Math.round(rango.max)}`,
      referencias: items.length,
      ventas: ventasGama,
      ventas_pct: porcentaje(ventasGama, totalVentasUnidades),
      margen_medio_pct: redondear(margenMedioGama, 2),
      productividad_media: items.length ? redondear(items.reduce((sum, item) => sum + item.productividad_score, 0) / items.length, 2) : 0,
    }
  })
  const huecosPrecio = resumenGamas
    .filter(gama => gama.referencias === 0)
    .map(gama => ({
      gama: gama.nombre,
      rango: gama.rango,
      motivo: 'No hay referencias en esta gama de precio.',
    }))
  const concentracionTipos = activos.reduce((acc, vino) => {
    const clave = vino.tipo || 'sin_tipo'
    acc[clave] = (acc[clave] || 0) + 1
    return acc
  }, {})
  const concentracionRegiones = activos.reduce((acc, vino) => {
    const clave = vino.region || 'sin_region'
    acc[clave] = (acc[clave] || 0) + 1
    return acc
  }, {})
  const cartaInflada = activos.length >= 30 && referenciasConVenta > 0 && referenciasConVenta < activos.length * 0.45
  const wineListSnapshot = {
    restaurante_id: restaurante.id,
    periodo_inicio: periodoInicio,
    periodo_fin: periodoFin,
    referencias_total: activos.length,
    referencias_con_venta: referenciasConVenta,
    ventas_totales: totalVentasUnidades,
    pareto_top20_refs: top20Count,
    pareto_top20_ventas_pct: paretoTop20Pct,
    bottom10_refs: bottomIds.size,
    productividad_media: productividadMedia,
    huecos_precio: huecosPrecio,
    resumen_gamas: resumenGamas,
    concentracion_tipos: concentracionTipos,
    concentracion_regiones: concentracionRegiones,
    carta_inflada: cartaInflada,
    motivo_principal: cartaInflada
      ? 'Muchas referencias no registran venta frente al tamano total de carta.'
      : paretoTop20Pct >= COEFICIENTES_CONSULTORIA_FASE1.pareto_concentrado_pct.valor
        ? 'Las ventas estan concentradas en pocas referencias.'
        : huecosPrecio.length
          ? 'Hay huecos de precio en la arquitectura de carta.'
          : 'Carta sin desequilibrio critico detectado en esta foto.',
  }

  const btgCandidatesBase = winePerformance
    .filter(item => numero(item.vino.coste_compra) > 0 && numero(item.vino.precio_botella) > 0 && numero(item.vino.stock) > 0)
    .map(item => {
      const coste = numero(item.vino.coste_compra)
      const pvp = numero(item.vino.precio_botella)
      const precioActual = numero(item.vino.precio_copa)
      const precioSugerido = precioActual || precioCopaSugerido(coste, pvp)
      const copas = COEFICIENTES_CONSULTORIA_FASE1.copas_por_botella.valor
      const mermaPct = COEFICIENTES_CONSULTORIA_FASE1.merma_copa_pct.valor
      const copasVendibles = copas * (1 - mermaPct / 100)
      const ingresosCopa = redondear(precioSugerido * copasVendibles, 2)
      const beneficioCopa = redondear(Math.max(0, ingresosCopa - coste), 2)
      const margenCopa = porcentaje(beneficioCopa, ingresosCopa)
      const stock = numero(item.vino.stock)
      const margenScore = limitar(margenCopa, 0, 80) / 80 * 35
      const stockScore = limitar(stock, 0, 12) / 12 * 20
      const rotacionScore = item.ventas_unidades > 0 ? 20 : item.valor_stock_coste > 0 ? 8 : 0
      const oportunidadScore = precioActual ? 8 : 18
      const premiumScore = pvp >= COEFICIENTES_CONSULTORIA_FASE1.umbral_copa_premium.valor ? 12 : 4
      const score = limitar(margenScore + stockScore + rotacionScore + oportunidadScore + premiumScore, 0, 100)
      const categoria = pvp >= COEFICIENTES_CONSULTORIA_FASE1.umbral_coravin.valor && item.ventas_unidades <= 1
        ? 'coravin'
        : pvp >= COEFICIENTES_CONSULTORIA_FASE1.umbral_copa_premium.valor
          ? 'copa_premium'
          : 'copa'
      const riesgo = categoria === 'coravin'
        ? 'alto'
        : item.ventas_unidades > 0 || stock <= 4
          ? 'bajo'
          : 'medio'
      const motivo = categoria === 'coravin'
        ? 'Vino de precio alto con riesgo de no vender botella completa; Coravin permite vender copas premium protegiendo la botella.'
        : categoria === 'copa_premium'
          ? 'Vino de ticket superior que puede subir ticket medio si sala lo ofrece por copa.'
          : 'Referencia con margen y stock suficientes para activar venta por copa.'
      const accion = categoria === 'coravin'
        ? 'Probar como copa premium con Coravin y medir salida durante 30 dias.'
        : categoria === 'copa_premium'
          ? 'Ofrecer por copa premium con argumento de sala y precio visible.'
          : 'Incluir en seleccion por copa y formar a sala con una frase de venta.'
      return {
        restaurante_id: restaurante.id,
        vino_id: item.vino_id,
        nombre: item.vino.nombre || '',
        bodega: item.vino.bodega || '',
        tipo: item.vino.tipo || '',
        region: item.vino.region || '',
        categoria_copa: categoria,
        score_copa: redondear(score, 2),
        coste_botella: redondear(coste, 2),
        pvp_botella: redondear(pvp, 2),
        precio_copa_actual: redondear(precioActual, 2),
        precio_copa_sugerido: precioSugerido,
        copas_por_botella: copas,
        merma_pct: mermaPct,
        ingresos_por_botella_copa: ingresosCopa,
        beneficio_por_botella_copa: beneficioCopa,
        margen_copa_pct: margenCopa,
        riesgo_apertura: riesgo,
        motivo,
        accion,
        vino: item.vino,
      }
    })
    .filter(item => item.score_copa >= 45 && item.margen_copa_pct >= 55)
    .sort((a, b) => b.score_copa - a.score_copa)

  const btgCandidates = btgCandidatesBase.slice(0, 30)
  const btgSnapshot = {
    restaurante_id: restaurante.id,
    periodo_inicio: periodoInicio,
    periodo_fin: periodoFin,
    referencias_activas: activos.length,
    referencias_por_copa: porCopa.length,
    cobertura_copa_pct: btgCoverage,
    candidatos_copa: btgCandidates.filter(item => item.categoria_copa === 'copa').length,
    candidatos_copa_premium: btgCandidates.filter(item => item.categoria_copa === 'copa_premium').length,
    candidatos_coravin: btgCandidates.filter(item => item.categoria_copa === 'coravin').length,
    beneficio_potencial_estimado: redondear(btgCandidates.reduce((sum, item) => sum + item.beneficio_por_botella_copa, 0), 2),
    motivo_principal: btgCandidates.length
      ? 'Hay referencias con margen, stock y oportunidad para activar venta por copa.'
      : 'No se detectan candidatos claros con los datos actuales.',
  }

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

  if (inventarioResumen.referencias_lentas > 0) {
    alerta('aviso', 'referencias_lentas', 'Referencias lentas', `${inventarioResumen.referencias_lentas} vinos tienen cobertura superior a ${COEFICIENTES_CONSULTORIA_FASE1.dias_cobertura_lento.valor} dias.`, 'El dinero rota demasiado despacio y puede bloquear nuevas compras.', 'Revisar venta sugerida, ubicacion en carta o proxima reposicion.')
    recomendacion('inventario', 'Acelerar referencias lentas', `Hay ${inventarioResumen.referencias_lentas} vinos con demasiados dias de cobertura.`, 'Priorizar venta por copa, maridaje o reducir compra hasta que bajen unidades.', 'media', 'medio', {}, { dias_cobertura_lento: COEFICIENTES_CONSULTORIA_FASE1.dias_cobertura_lento.valor })
  }

  if (inventarioResumen.exceso_stock_refs > 0) {
    alerta('critica', 'exceso_inventario', 'Exceso de inventario', `${inventarioResumen.exceso_stock_refs} vinos superan ${COEFICIENTES_CONSULTORIA_FASE1.dias_cobertura_exceso.valor} dias de cobertura.`, 'Riesgo de capital atrapado y compras innecesarias.', 'Frenar reposicion y crear plan de salida.')
    recomendacion('inventario', 'Frenar compras de referencias con exceso', `Hay ${inventarioResumen.exceso_stock_refs} vinos con cobertura excesiva.`, 'No reponer esas referencias y activar acciones de salida antes de comprar mas.', 'alta', 'bajo', {}, { dias_cobertura_exceso: COEFICIENTES_CONSULTORIA_FASE1.dias_cobertura_exceso.valor })
  }

  if (shrinkageRate >= 5) {
    alerta('aviso', 'merma_elevada', 'Merma o ajustes elevados', `La tasa estimada de merma/ajustes negativos es ${shrinkageRate}%.`, 'Puede haber descuadres, invitaciones no controladas o errores de conteo.', 'Revisar movimientos negativos y cerrar motivo por referencia.')
    recomendacion('inventario', 'Auditar mermas y ajustes', `Merma/ajustes negativos: ${mermaUnidades} unidades.`, 'Separar venta, cata, invitacion y descuadre para saber donde se pierde stock.', 'media', 'medio', {}, { tasa_merma_pct: shrinkageRate })
  }

  if (paretoTop20Pct >= COEFICIENTES_CONSULTORIA_FASE1.pareto_concentrado_pct.valor && activos.length >= 15) {
    alerta('aviso', 'ventas_concentradas_pareto', 'Ventas muy concentradas', `El top 20% de referencias concentra ${paretoTop20Pct}% de las ventas.`, 'La carta puede estar sobredimensionada o tener demasiadas referencias sin traccion.', 'Revisar bajo rendimiento y reasignar espacio a vinos con mejor salida.')
    recomendacion('carta', 'Reducir concentracion de ventas', `Pocas referencias sostienen la mayor parte de la venta. Pareto actual: ${paretoTop20Pct}%.`, 'Revisar las referencias sin ventas y reforzar gamas con mejor productividad.', 'media', 'medio', {}, { pareto_concentrado_pct: COEFICIENTES_CONSULTORIA_FASE1.pareto_concentrado_pct.valor })
  }

  if (bottomIds.size > 0 && activos.length >= 10) {
    recomendacion('carta', 'Revisar referencias de bajo rendimiento', `${bottomIds.size} vinos entran en el grupo de bajo rendimiento.`, 'Valorar salida, cambio de precio, venta por copa o sustitucion por referencias mas productivas.', 'alta', 'medio', {}, {
      bottom10_refs: bottomIds.size,
      formula: 'venta + margen + rotacion - penalizacion por stock parado',
    })
  }

  if (huecosPrecio.length > 0) {
    alerta('info', 'huecos_precio', 'Huecos de precio en carta', `${huecosPrecio.length} gamas no tienen referencias.`, 'Puede faltar escalera comercial para llevar al cliente de precio bajo a premium.', 'Cubrir huecos con pocas referencias bien elegidas.')
    recomendacion('carta', 'Cubrir huecos de precio', `Gamas vacias: ${huecosPrecio.map(item => item.gama).join(', ')}.`, 'Buscar vinos con margen sano que cubran esos rangos sin inflar la carta.', 'media', 'medio')
  }

  if (cartaInflada) {
    alerta('aviso', 'carta_inflada', 'Carta posiblemente inflada', `${activos.length} referencias activas y solo ${referenciasConVenta} con venta registrada.`, 'Demasiadas referencias pueden complicar sala, compra e inventario.', 'Reducir o reordenar carta usando productividad por referencia.')
    recomendacion('carta', 'Simplificar carta por productividad', `La carta tiene ${activos.length} referencias, pero solo ${referenciasConVenta} venden en el periodo.`, 'Mantener lo que vende o aporta margen; revisar el grupo de bajo rendimiento.', 'alta', 'medio')
  }

  if (btgCandidates.length > 0) {
    recomendacion('venta_por_copa', 'Activar candidatos por copa', `Se detectan ${btgCandidates.length} candidatos para copa, copa premium o Coravin.`, 'Probar los mejores candidatos durante 30 dias y medir salida/margen.', 'alta', 'medio', {}, {
      copas_por_botella: COEFICIENTES_CONSULTORIA_FASE1.copas_por_botella.valor,
      merma_copa_pct: COEFICIENTES_CONSULTORIA_FASE1.merma_copa_pct.valor,
      margen_objetivo_copa_pct: COEFICIENTES_CONSULTORIA_FASE1.margen_objetivo_copa_pct.valor,
    })
  }

  if (btgSnapshot.candidatos_coravin > 0) {
    alerta('info', 'candidatos_coravin', 'Candidatos Coravin', `${btgSnapshot.candidatos_coravin} vinos premium pueden probarse con Coravin.`, 'Permite vender vinos de ticket alto sin depender de botella completa.', 'Crear seleccion premium por copa con control de apertura.')
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

  const resumenFinal = {
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
    inventario: inventarioResumen,
    carta: {
      pareto_top20_ventas_pct: paretoTop20Pct,
      referencias_con_venta: referenciasConVenta,
      productividad_media: productividadMedia,
      bottom10_refs: bottomIds.size,
      huecos_precio: huecosPrecio.length,
      carta_inflada: cartaInflada,
    },
    copa: {
      cobertura_copa_pct: btgCoverage,
      candidatos: btgCandidates.length,
      candidatos_coravin: btgSnapshot.candidatos_coravin,
      beneficio_potencial_estimado: btgSnapshot.beneficio_potencial_estimado,
    },
  }
  const modoConsultor = crearModoConsultor({
    restaurante,
    periodoInicio,
    periodoFin,
    alertas,
    recomendaciones,
    resumen: resumenFinal,
  })
  const oportunidad = crearMotorOportunidad({
    restaurante,
    periodoInicio,
    periodoFin,
    winePerformance,
    margenBajo,
    deadStockValor,
    btgSnapshot,
    wineListSnapshot,
    wineListItems,
  })

  return {
    periodoInicio,
    periodoFin,
    kpis,
    winePerformance,
    clasificaciones,
    alertas,
    recomendaciones,
    resumen: resumenFinal,
    inventario: {
      snapshot: {
        restaurante_id: restaurante.id,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        ...inventarioResumen,
      },
      items: inventarioItems,
    },
    carta: {
      snapshot: wineListSnapshot,
      items: wineListItems,
    },
    copa: {
      snapshot: btgSnapshot,
      candidates: btgCandidates,
    },
    consultor: modoConsultor,
    oportunidad,
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
    inventarioSnapshot: resultado.inventario.snapshot,
    inventarioItems: resultado.inventario.items.map(({ vino, ...item }) => item),
    cartaSnapshot: resultado.carta.snapshot,
    cartaItems: resultado.carta.items.map(({ vino, ...item }) => item),
    copaSnapshot: resultado.copa.snapshot,
    copaCandidates: resultado.copa.candidates.map(({ vino, ...item }) => item),
    consultorDiagnostic: resultado.consultor.diagnostic,
    consultorItems: resultado.consultor.items,
    oportunidadSnapshot: resultado.oportunidad.snapshot,
    oportunidadItems: resultado.oportunidad.items,
  }
}
