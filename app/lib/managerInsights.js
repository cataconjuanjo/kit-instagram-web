function numero(valor) {
  return Number(valor) || 0
}

function texto(valor, fallback = '') {
  return String(valor || fallback || '').trim()
}

function normalizarPrioridad(valor) {
  const prioridad = texto(valor, 'media').toLowerCase()
  if (prioridad === 'alta' || prioridad === 'critica') return 'alta'
  if (prioridad === 'baja') return 'baja'
  return 'media'
}

function desdeDecisionSemanal(decision, index) {
  if (!decision?.titulo) return null
  return {
    id: `semanal-${index}`,
    area: texto(decision.area, 'Gerencia'),
    prioridad: normalizarPrioridad(decision.prioridad),
    titulo: decision.titulo,
    lectura: texto(decision.detalle, decision.accion),
    impacto: decision.impacto_eur
      ? `${Math.round(numero(decision.impacto_eur))} EUR de impacto estimado`
      : 'Decision ya detectada en el resumen semanal',
    accion: texto(decision.accion, 'Abrir detalle y decidir'),
    href: decision.href || '/dashboard/estadisticas',
  }
}

function desdeRadar(accion, index) {
  if (!accion?.titulo) return null
  return {
    id: `radar-${index}`,
    area: texto(accion.area, 'Radar'),
    prioridad: normalizarPrioridad(accion.prioridad),
    titulo: accion.titulo,
    lectura: texto(accion.detalle, accion.accion),
    impacto: 'Senal operativa de hoy',
    accion: texto(accion.accion, 'Abrir accion diaria'),
    href: accion.href || '/dashboard',
  }
}

function crearInsight(data) {
  if (!data?.titulo) return null
  return {
    id: data.id,
    area: texto(data.area, 'Gerencia'),
    prioridad: normalizarPrioridad(data.prioridad),
    titulo: data.titulo,
    lectura: texto(data.lectura),
    impacto: texto(data.impacto, 'Impacto pendiente de medir'),
    accion: texto(data.accion, 'Abrir y decidir'),
    href: data.href || '/dashboard',
  }
}

function pesoPrioridad(prioridad) {
  if (prioridad === 'alta') return 3
  if (prioridad === 'media') return 2
  return 1
}

function ordenarInsights(a, b) {
  return pesoPrioridad(b.prioridad) - pesoPrioridad(a.prioridad)
}

export function construirInsightsGerencia({
  perfilBodega = false,
  calidadGlobal = 0,
  stats = {},
  alertasSala = 0,
  turnoCerrado = false,
  etiquetaServicio = 'hoy',
  cartaPublicable = true,
  experienciaElegida = true,
  previewLista = true,
  cartaPublicada = true,
  qrPreparado = true,
  contenidoPublicacion = {},
  estadoLanzamiento = {},
  counts = {},
  kpisSemanales = {},
  decisionesSemanales = [],
  accionesRadar = [],
} = {}) {
  const insights = []
  const ids = new Set()
  const add = (insight) => {
    const limpio = crearInsight(insight)
    if (!limpio || ids.has(limpio.id)) return
    ids.add(limpio.id)
    insights.push(limpio)
  }

  decisionesSemanales.slice(0, 2).map(desdeDecisionSemanal).forEach(add)
  accionesRadar.slice(0, 2).map(desdeRadar).forEach(add)

  if (perfilBodega) {
    if (numero(counts.bajoMinimo) > 0) {
      add({
        id: 'stock-bajo',
        area: 'Compra',
        prioridad: 'alta',
        titulo: 'Evitar rotura de stock',
        lectura: `${counts.bajoMinimo} referencias estan en minimo o por debajo.`,
        impacto: `${numero(counts.referenciasCriticas) || counts.bajoMinimo} referencias criticas`,
        accion: 'Preparar pedido o sustituto antes del siguiente servicio fuerte.',
        href: '/dashboard/bodega#pedido',
      })
    }

    if (numero(counts.sinCosteCompra) > 0 || numero(kpisSemanales.ventas_sin_coste) > 0) {
      add({
        id: 'coste-incompleto',
        area: 'Margen',
        prioridad: numero(kpisSemanales.ventas_sin_coste) > 0 ? 'alta' : 'media',
        titulo: 'Margen sin defender',
        lectura: `${counts.sinCosteCompra || 0} referencias sin coste y ${kpisSemanales.ventas_sin_coste || 0} ventas sin coste.`,
        impacto: 'Bloquea beneficio bruto y decisiones de precio',
        accion: 'Completar coste empezando por vendidos, recomendados y premium.',
        href: '/dashboard/bodega#referencias-sin-coste',
      })
    }

    if (numero(counts.sinProveedor) > 0) {
      add({
        id: 'proveedor-pendiente',
        area: 'Proveedor',
        prioridad: 'media',
        titulo: 'Compras sin proveedor claro',
        lectura: `${counts.sinProveedor} referencias no tienen proveedor asignado.`,
        impacto: 'Ralentiza reposicion y comparativa de tarifas',
        accion: 'Asignar proveedor para preparar pedidos y alternativas.',
        href: '/dashboard/bodega#referencias-sin-proveedor',
      })
    }

    if (numero(counts.propuestasActivas) > 0) {
      add({
        id: 'propuestas-abiertas',
        area: 'Catalogo',
        prioridad: 'media',
        titulo: 'Propuestas esperando criterio',
        lectura: `${counts.propuestasActivas} candidatas siguen pendientes de incorporar o descartar.`,
        impacto: 'Puede convertir catalogo en altas reales',
        accion: 'Decidir altas, sustitutos o descartes antes de comprar.',
        href: '/dashboard/bodega#propuestas',
      })
    }
  } else {
    if (numero(alertasSala) > 0) {
      add({
        id: 'senales-sala',
        area: 'Sala',
        prioridad: 'alta',
        titulo: 'Senales de sala sin resolver',
        lectura: `${alertasSala} incidencias o dudas aparecen en el servicio.`,
        impacto: 'Puede afectar confianza, venta y disponibilidad',
        accion: 'Cerrar cada senal y convertirla en ajuste para manana.',
        href: '/dashboard/cierre',
      })
    }

    if (numero(stats.ventasHoy) > 0 && !turnoCerrado) {
      add({
        id: 'cerrar-turno',
        area: 'Gerencia',
        prioridad: 'alta',
        titulo: 'Cerrar el servicio',
        lectura: `${stats.ventasHoy} ventas marcadas ${etiquetaServicio} aun no tienen cierre operativo.`,
        impacto: 'Evita perder aprendizaje de venta, rechazo y stock',
        accion: 'Validar resultados del turno antes de que se enfrien los datos.',
        href: '/dashboard/cierre',
      })
    }

    if (!cartaPublicable) {
      add({
        id: 'carta-no-publicable',
        area: 'Publicacion',
        prioridad: 'alta',
        titulo: 'Carta incompleta para publicar',
        lectura: `${contenidoPublicacion.vinosSinPrecio || counts.vinosSinPrecio || 0} vinos activos siguen sin precio.`,
        impacto: 'Riesgo directo de abandono o confusion en mesa',
        accion: 'Completar precios y contenido minimo antes del QR.',
        href: '/dashboard/vinos?filtro=pendientes',
      })
    }

    if (cartaPublicable && !experienciaElegida) {
      add({
        id: 'experiencia-sin-elegir',
        area: 'Lanzamiento',
        prioridad: 'media',
        titulo: 'Lanzamiento sin objetivo',
        lectura: 'La carta puede publicarse, pero no tiene plantilla de entrega activa.',
        impacto: 'Reduce claridad comercial y viralidad del QR',
        accion: 'Elegir una experiencia antes de preparar material.',
        href: '/dashboard/plantillas',
      })
    }

    if (cartaPublicable && experienciaElegida && !previewLista && !estadoLanzamiento.previewPendiente) {
      add({
        id: 'preview-pendiente',
        area: 'Revision',
        prioridad: 'media',
        titulo: 'Preview sin aprobar',
        lectura: estadoLanzamiento.previewObsoleta
          ? 'La carta cambio despues de la ultima aprobacion.'
          : 'Aun falta validar la experiencia privada antes de publicar.',
        impacto: 'Evita sacar a mesa una version incompleta',
        accion: 'Generar y aprobar la preview privada.',
        href: '/dashboard/qr#preview-privada',
      })
    }

    if (previewLista && !cartaPublicada) {
      add({
        id: 'publicacion-borrador',
        area: 'Publicacion',
        prioridad: 'media',
        titulo: 'Preview aprobada, QR cerrado',
        lectura: 'El contenido ya esta revisado, pero la carta publica sigue en borrador.',
        impacto: 'El trabajo no llega todavia a clientes',
        accion: 'Abrir destino publico desde QR cuando gerencia lo confirme.',
        href: '/dashboard/qr',
      })
    }

    if (cartaPublicada && !qrPreparado) {
      add({
        id: 'qr-sin-material',
        area: 'Mesa',
        prioridad: 'media',
        titulo: 'QR publicado sin material',
        lectura: 'No hay descarga, impresion, copia de enlace ni escaneo real detectado.',
        impacto: 'El lanzamiento puede quedarse invisible',
        accion: 'Descargar pack, imprimir o copiar el enlace final.',
        href: '/dashboard/qr#pack-entrega',
      })
    }

    if (numero(counts.platosSinDescripcion) > 0) {
      add({
        id: 'platos-sin-pistas',
        area: 'Maridaje',
        prioridad: 'media',
        titulo: 'Platos sin pistas para vender',
        lectura: `${counts.platosSinDescripcion} platos no explican tecnica, salsa o intensidad.`,
        impacto: 'La recomendacion pierde contexto emocional y gastronomico',
        accion: 'Completar los platos que mas se piden.',
        href: '/dashboard/platos?filtro=descripcion',
      })
    }
  }

  if (numero(kpisSemanales.ventas_tpv_no_atribuidas) > 0) {
    add({
      id: 'tpv-sin-atribucion',
      area: 'TPV',
      prioridad: 'media',
      titulo: 'Ventas reales sin atribucion',
      lectura: `${kpisSemanales.ventas_tpv_no_atribuidas} ventas TPV no explican si nacen de recomendacion.`,
      impacto: 'Oculta que parte de Carta Viva esta convirtiendo',
      accion: 'Revisar alias, exposiciones y uso de modo sala.',
      href: '/dashboard/tpv',
    })
  }

  if (numero(kpisSemanales.recuperable_semana) > 0) {
    add({
      id: 'recuperable-semana',
      area: 'Rentabilidad',
      prioridad: 'media',
      titulo: 'Dinero por capturar',
      lectura: `${kpisSemanales.recuperable_semana_texto || `${Math.round(kpisSemanales.recuperable_semana)} EUR`} detectados esta semana.`,
      impacto: 'Oportunidad visible en recomendaciones, stock o margen',
      accion: 'Abrir detalle y decidir que accion se aplica.',
      href: '/dashboard/estadisticas',
    })
  }

  if (numero(kpisSemanales.oportunidad_anual) > 0) {
    add({
      id: 'oportunidad-anual',
      area: 'Simulador',
      prioridad: 'baja',
      titulo: 'Escenarios con impacto anual',
      lectura: `${kpisSemanales.oportunidad_anual_texto || `${Math.round(kpisSemanales.oportunidad_anual)} EUR`} siguen en borrador.`,
      impacto: 'Valor de negocio pendiente de aprobacion',
      accion: 'Aplicar, ajustar o descartar escenarios.',
      href: '/dashboard/simulador',
    })
  }

  if (!insights.length) {
    add({
      id: 'sin-bloqueos',
      area: 'Control',
      prioridad: 'baja',
      titulo: perfilBodega ? 'Bodega estable' : 'Operacion sin bloqueos visibles',
      lectura: `${calidadGlobal}% de salud operativa y sin alertas principales ahora.`,
      impacto: 'Buen momento para optimizar margen o preparar campana',
      accion: perfilBodega ? 'Revisar mapa estrella y joyas.' : 'Revisar simulador o preparar proximo lanzamiento.',
      href: perfilBodega ? '/dashboard/menu-engineering' : '/dashboard/simulador',
    })
  }

  return insights.sort(ordenarInsights).slice(0, 3)
}
