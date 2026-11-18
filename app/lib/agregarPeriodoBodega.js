import { fetchAllPages, chunkArray } from './fetchAllPages.js'

/**
 * agregarPeriodoBodega — Agregación de ventas de sala por periodo.
 *
 * Reutilizable: B7b (semanal), B5 (mensual), Explotación.
 *
 * Interfaz de fuente_ventas:
 *   null | 'parte' | 'ambas' → lee partes_servicio (fuente_usada='parte')
 *   'tpv'                    → stub B8 (b8_pendiente=true, datos vacíos)
 *
 * @param {{ restaurante_id: string, desde: string, hasta: string, supabase: object }} opts
 * @returns {Promise<InformePeriodo>}
 */
export async function agregarPeriodoBodega({ restaurante_id, desde, hasta, supabase }) {
  // Ajustes económicos del restaurante
  const { data: settings } = await supabase
    .from('restaurant_economic_settings')
    .select('fuente_ventas, copas_por_botella, ml_por_copa, merma_copa_pct')
    .eq('restaurante_id', restaurante_id)
    .single()

  const fuente        = settings?.fuente_ventas ?? null
  const copasXBotella = Number(settings?.copas_por_botella) > 0
    ? Number(settings.copas_por_botella)
    : (settings?.ml_por_copa > 0 ? Math.round(750 / settings.ml_por_copa) : 5)
  const merraPct = Number(settings?.merma_copa_pct) || 0

  const meta = { restaurante_id, desde, hasta, fuente_usada: 'parte', b8_pendiente: false }

  // B8 stub: fuente TPV no implementada todavía
  if (fuente === 'tpv') {
    return {
      meta: { ...meta, fuente_usada: 'tpv', b8_pendiente: true },
      ...emptyAgregacion(),
    }
  }

  // Partes del periodo — paginado (PostgREST corta a 1000; un restaurante con
  // 2+ turnos/día acumula ≈60 partes/mes, pero rangos amplios pueden pasarse).
  const partes = await fetchAllPages(() =>
    supabase.from('partes_servicio')
      .select('id, fecha, turno, estado')
      .eq('restaurante_id', restaurante_id)
      .gte('fecha', desde)
      .lte('fecha', hasta)
  )

  const cerrados  = partes.filter(p => p.estado === 'cerrado')
  const borradores = partes.filter(p => p.estado === 'borrador').length

  if (cerrados.length === 0) {
    return {
      meta: { ...meta, partes_incluidos: 0, borradores_excluidos: borradores },
      ...emptyAgregacion(),
    }
  }

  const parteIds = cerrados.map(p => p.id)
  const parteMap = Object.fromEntries(cerrados.map(p => [p.id, p]))

  // Líneas con datos de vino — paginado + chunking en .in() para no reventar
  // la URL (PostgREST ≈100 ids por .in()) ni cortar a 1000 filas.
  const lineas = []
  for (const chunk of chunkArray(parteIds, 100)) {
    const chunkRows = await fetchAllPages(() =>
      supabase.from('partes_servicio_lineas')
        .select('*, vino:vinos(id, nombre, coste_medio_pmp, coste_compra)')
        .in('parte_id', chunk)
    )
    lineas.push(...chunkRows)
  }

  const lineasConParte = lineas.map(l => ({ ...l, parte: parteMap[l.parte_id] }))

  return {
    meta: { ...meta, partes_incluidos: cerrados.length, borradores_excluidos: borradores },
    ..._agruparLineas(lineasConParte, { copas_por_botella: copasXBotella, merma_copa_pct: merraPct }),
  }
}

// ── Función pura exportada para tests ─────────────────────────────────────────
export function _agruparLineas(lineas, { copas_por_botella = 5, merma_copa_pct = 0 } = {}) {
  const copasVendibles = r4(copas_por_botella * (1 - merma_copa_pct / 100))
  let ingresos_venta    = 0
  let botellas_vendidas = 0
  let copas_total       = 0
  let invitaciones_uds  = 0
  let consumos_uds      = 0
  let consumos_valor    = 0

  // Campos .coste y los sub-campos botella_* / copa_* en canal.invitacion
  // son aditivos al vocabulario original (ver cierreDesglose + snapshot v1).
  // Se mantienen todos los campos preexistentes (uds, ingresos, valor) con
  // la misma semántica para no romper cierres antiguos.
  const canal = {
    botella:    { uds: 0, ingresos: 0, coste: 0 },
    copa:       { uds: 0, copas: 0, ingresos: 0, coste: 0 },
    invitacion: { uds: 0, botella_uds: 0, copa_uds: 0, botella_coste: 0, copa_coste: 0 },
    cocina:     { uds: 0, valor: 0, coste: 0 },
    evento:     { uds: 0, valor: 0, coste: 0 },
    maridaje:   { uds: 0, valor: 0, coste: 0 },
    rotura:     { uds: 0, coste: 0 },
    cata:       { uds: 0, valor: 0, coste: 0 },
  }

  const vinoMap    = {}
  const diaTurnoMap = {}
  const mesaMap    = {}

  for (const l of lineas) {
    const precio   = r2(Number(l.precio_unitario) || 0)
    const cantidad = Math.max(0, Number(l.cantidad) || 0)
    const copas    = Math.max(0, Number(l.copas_vendidas) || 0)
    // Ingreso real: copa usa copas_vendidas (precio por copa × copas), otros usan cantidad
    const esCopa   = l.tipo === 'venta_copa' || l.tipo === 'invitacion_copa'
    const esVenta  = l.tipo === 'venta_botella' || l.tipo === 'venta_copa'
    const ingreso  = esCopa ? r2(precio * copas) : r2(precio * cantidad)

    // Coste a inventario para el desglose v1:
    //   - botella entera:  cantidad × coste_medio_pmp (fallback coste_compra)
    //   - copa:           (copas / copasVendibles) × coste_medio_pmp
    // Nota: copasVendibles ya incorpora la merma copa (ver línea superior),
    // así que el coste de una copa es el precio de coste dividido por copas
    // netas que da una botella.
    const costeU   = r4(Number(l.vino?.coste_medio_pmp) || Number(l.vino?.coste_compra) || 0)
    const costeLinea = r2(
      esCopa
        ? (copasVendibles > 0 ? (copas / copasVendibles) * costeU : 0)
        : cantidad * costeU
    )

    // — Canal —
    switch (l.tipo) {
      case 'venta_botella':
        ingresos_venta    += ingreso
        botellas_vendidas += cantidad
        canal.botella.uds      += cantidad
        canal.botella.ingresos += ingreso
        canal.botella.coste    += costeLinea
        break
      case 'venta_copa':
        ingresos_venta    += ingreso
        copas_total       += copas
        canal.copa.copas    += copas
        canal.copa.ingresos += ingreso
        canal.copa.coste    += costeLinea
        break
      case 'invitacion_botella':
        invitaciones_uds              += cantidad
        canal.invitacion.uds          += cantidad
        canal.invitacion.botella_uds  += cantidad
        canal.invitacion.botella_coste += costeLinea
        break
      case 'invitacion_copa': {
        const udsInv = copas || cantidad
        invitaciones_uds              += udsInv
        canal.invitacion.uds          += udsInv
        canal.invitacion.copa_uds     += udsInv
        canal.invitacion.copa_coste   += costeLinea
        break
      }
      case 'cocina':
        consumos_uds       += cantidad
        consumos_valor     += ingreso
        canal.cocina.uds   += cantidad
        canal.cocina.valor += ingreso
        canal.cocina.coste += costeLinea
        break
      case 'grupo_evento':
        consumos_uds        += cantidad
        consumos_valor      += ingreso
        canal.evento.uds    += cantidad
        canal.evento.valor  += ingreso
        canal.evento.coste  += costeLinea
        break
      case 'maridaje':
        consumos_uds          += cantidad
        consumos_valor        += ingreso
        canal.maridaje.uds    += cantidad
        canal.maridaje.valor  += ingreso
        canal.maridaje.coste  += costeLinea
        break
      case 'rotura':
        consumos_uds       += cantidad
        canal.rotura.uds   += cantidad
        canal.rotura.coste += costeLinea
        break
      case 'cata':
        consumos_uds      += cantidad
        consumos_valor    += ingreso
        canal.cata.uds    += cantidad
        canal.cata.valor  += ingreso
        canal.cata.coste  += costeLinea
        break
    }

    // — Por vino —
    const vid = l.vino_id
    if (!vinoMap[vid]) {
      const v      = l.vino || {}
      const coste  = r4(Number(v.coste_medio_pmp) || Number(v.coste_compra) || 0)
      vinoMap[vid] = {
        vino_id: vid, nombre: v.nombre || vid,
        uds: 0, copas: 0, ingresos: 0,
        tiene_coste: coste > 0, coste_unitario: coste > 0 ? coste : null,
      }
    }
    if (esCopa) {
      vinoMap[vid].copas   += copas
    } else {
      vinoMap[vid].uds     += cantidad
    }
    // Solo ingresos de ventas (no invitaciones ni consumos)
    if (l.tipo === 'venta_botella' || l.tipo === 'venta_copa') {
      vinoMap[vid].ingresos += ingreso
    }

    // — Por día/turno —
    if (l.parte) {
      const key = `${l.parte.fecha}_${l.parte.turno}`
      if (!diaTurnoMap[key]) {
        diaTurnoMap[key] = { fecha: l.parte.fecha, turno: l.parte.turno, lineas: 0, ingresos: 0 }
      }
      diaTurnoMap[key].lineas   += 1
      if (esVenta) diaTurnoMap[key].ingresos += ingreso
    }

    // — Por mesa —
    if (l.mesa) {
      if (!mesaMap[l.mesa]) mesaMap[l.mesa] = { mesa: l.mesa, uds: 0, ingresos: 0 }
      mesaMap[l.mesa].uds      += esCopa ? copas : cantidad
      if (esVenta) mesaMap[l.mesa].ingresos += ingreso
    }
  }

  // Margen por vino (solo si tiene_coste y tiene ingresos)
  // Copa: coste = (copas / copas_por_botella) × coste_unitario
  const porVino = Object.values(vinoMap).map(v => {
    let margen_pct = null
    if (v.tiene_coste && v.ingresos > 0) {
      const coste_botellas = r2(v.coste_unitario * v.uds)
      const coste_copas    = v.copas > 0 && copasVendibles > 0
        ? r2((v.copas / copasVendibles) * v.coste_unitario)
        : 0
      const coste_total = r2(coste_botellas + coste_copas)
      margen_pct = coste_total > 0
        ? Math.round(((v.ingresos - coste_total) / v.ingresos) * 100)
        : null
    }
    return { ...v, margen_pct }
  }).sort((a, b) => b.ingresos - a.ingresos)

  const botellas_equivalentes = r2(copas_total / copasVendibles)

  return {
    resumen: {
      ingresos_venta:        r2(ingresos_venta),
      botellas_vendidas,
      copas_vendidas:        copas_total,
      botellas_equivalentes,
      invitaciones_uds,
      consumos_uds,
      consumos_valor:        r2(consumos_valor),
    },
    por_canal:    canal,
    por_vino:     porVino,
    por_dia_turno: Object.values(diaTurnoMap).sort((a, b) =>
      a.fecha.localeCompare(b.fecha) || a.turno.localeCompare(b.turno)
    ),
    top_ingresos:  [...porVino].sort((a, b) => b.ingresos - a.ingresos).slice(0, 5),
    top_uds:       [...porVino].sort((a, b) => b.uds - a.uds).slice(0, 5),
    por_mesa:      Object.values(mesaMap).sort((a, b) => b.ingresos - a.ingresos),
  }
}

function emptyAgregacion() {
  return {
    resumen: { ingresos_venta: 0, botellas_vendidas: 0, copas_vendidas: 0,
               botellas_equivalentes: 0, invitaciones_uds: 0, consumos_uds: 0, consumos_valor: 0 },
    por_canal:    {
      botella:    { uds: 0, ingresos: 0, coste: 0 },
      copa:       { uds: 0, copas: 0, ingresos: 0, coste: 0 },
      invitacion: { uds: 0, botella_uds: 0, copa_uds: 0, botella_coste: 0, copa_coste: 0 },
      cocina:     { uds: 0, valor: 0, coste: 0 },
      evento:     { uds: 0, valor: 0, coste: 0 },
      maridaje:   { uds: 0, valor: 0, coste: 0 },
      rotura:     { uds: 0, coste: 0 },
      cata:       { uds: 0, valor: 0, coste: 0 },
    },
    por_vino:     [],
    por_dia_turno: [],
    top_ingresos:  [],
    top_uds:       [],
    por_mesa:      [],
  }
}

function r2(n) { return Math.round(Number(n) * 100) / 100 }
function r4(n) { return Math.round(Number(n) * 10000) / 10000 }

// ── Desglose del cierre (v1) ───────────────────────────────────────────────
//
// Función pura exportada para poder testearla sin tocar la BD. La única
// semántica relevante vive aquí: el snapshot se calcula en calcularMesBodega
// y se pasa a este constructor.
//
// Fórmulas (todas a coste, en euros):
//   salidas_total       = Σ categorías de salida sin venta
//   ventas_total_coste  = ventas_botella.coste + ventas_copa.coste
//   stock_final_teorico = stock_inicial + compras_netas − ventas_total_coste − salidas_total
//   ajuste_inventario   = stock_final_real − stock_final_teorico  (con signo)
//   consumo             = stock_inicial + compras_netas − stock_final_real
//
// Reglas sobre nulos (todas estrictas para no mostrar "0" espurios):
//   - stock_inicial == null (0 ó 1 conteos del mes) ⇒
//       stock_final_teorico, consumo = null
//   - stock_inicial == null ó stock_final == null ⇒
//       stock_final_real.valor_eur = null  (y por tanto ajuste = null)
//
// uds (unidades físicas): rellenas cuando las fuentes lo permiten;
//   stock_inicial.uds = suma stock_teorico del primer conteo del mes
//   compras_bruto.uds = Σ (uds + uds_bonificadas) de lineas_compra
//                     + Σ cantidad de movimientos_stock['compra'] sin cabecera
//   devoluciones.uds  = Σ cantidad de movimientos_stock['devolucion'] sin cabecera
//   compras_netas.uds = compras_bruto.uds − devoluciones.uds
// Todas las demás uds (stock_final_real, stock_final_teorico, ajuste,
// consumo) se dejan null: no hay fuente barata y comparable con las
// anteriores para sumarlas.
export function _construirDesglose({
  stock_inicial = null,  stock_inicial_uds = null,
  stock_final   = null,
  compras_bruto = 0,     compras_bruto_uds = 0,
  devoluciones  = 0,     devoluciones_uds  = 0,
  compras_netas = 0,     compras_netas_uds = 0,
  por_canal     = {},
  // coste_ventas_teorico es la fuente canónica del cierre; se calcula
  // agregando por vino. canal.{botella,copa}.coste viene acumulado por
  // línea, lo que introduce un residual de 1–10 céntimos entre la suma
  // de canales + salidas y el total. Si se pasa el total aquí, el
  // residual se cuadra al céntimo repartiéndolo en el canal de venta
  // mayor; si no se pasa (compatibilidad con callers viejos), no se
  // ajusta nada.
  coste_ventas_teorico = null,
} = {}) {
  const c = por_canal
  const salidas = {
    invitacion_botella: {
      uds:       c.invitacion?.botella_uds   || 0,
      valor_eur: r2(c.invitacion?.botella_coste || 0),
    },
    invitacion_copa: {
      uds:       c.invitacion?.copa_uds      || 0,
      valor_eur: r2(c.invitacion?.copa_coste || 0),
    },
    cocina:       { uds: c.cocina?.uds   || 0, valor_eur: r2(c.cocina?.coste   || 0) },
    grupo_evento: { uds: c.evento?.uds   || 0, valor_eur: r2(c.evento?.coste   || 0) },
    maridaje:     { uds: c.maridaje?.uds || 0, valor_eur: r2(c.maridaje?.coste || 0) },
    rotura:       { uds: c.rotura?.uds   || 0, valor_eur: r2(c.rotura?.coste   || 0) },
    cata:         { uds: c.cata?.uds     || 0, valor_eur: r2(c.cata?.coste     || 0) },
  }
  const salidas_total_valor = r2(
    salidas.invitacion_botella.valor_eur +
    salidas.invitacion_copa.valor_eur +
    salidas.cocina.valor_eur +
    salidas.grupo_evento.valor_eur +
    salidas.maridaje.valor_eur +
    salidas.rotura.valor_eur +
    salidas.cata.valor_eur
  )
  const salidas_total_uds = (
    salidas.invitacion_botella.uds +
    salidas.invitacion_copa.uds +
    salidas.cocina.uds +
    salidas.grupo_evento.uds +
    salidas.maridaje.uds +
    salidas.rotura.uds +
    salidas.cata.uds
  )
  let ventas_botella_coste = r2(c.botella?.coste || 0)
  let ventas_copa_coste    = r2(c.copa?.coste    || 0)
  // Cuadre al céntimo: residual = coste_ventas_teorico − (ventas+salidas).
  // Se mete en el canal de venta mayor (botella/copa). Si ambos canales
  // son 0 (sólo salidas), no se reparte porque romperíamos el acumulado
  // de los 7 subcanales de salidas y la UI mostraría una cifra "fantasma".
  if (coste_ventas_teorico != null) {
    const sumaComponentes = r2(ventas_botella_coste + ventas_copa_coste + salidas_total_valor)
    const residual = r2(coste_ventas_teorico - sumaComponentes)
    if (Math.abs(residual) >= 0.01 && (ventas_botella_coste + ventas_copa_coste) > 0) {
      if (ventas_botella_coste >= ventas_copa_coste) {
        ventas_botella_coste = r2(ventas_botella_coste + residual)
      } else {
        ventas_copa_coste = r2(ventas_copa_coste + residual)
      }
    }
  }
  const ventas_total_coste   = r2(ventas_botella_coste + ventas_copa_coste)

  const haySaldoInicial = stock_inicial != null
  const haySaldoFinal   = haySaldoInicial && stock_final != null

  const stockFinalTeorico = haySaldoInicial
    ? r2(stock_inicial + compras_netas - ventas_total_coste - salidas_total_valor)
    : null
  // stock_final_real.valor_eur: null si no hay par inicial+final, para que
  // la trazabilidad teorico → ajuste → consumo sea coherente (si está uno
  // está también el otro).
  const stockFinalRealValor = haySaldoFinal ? stock_final : null
  const ajusteInventario    = (stockFinalTeorico != null && stockFinalRealValor != null)
    ? r2(stockFinalRealValor - stockFinalTeorico)
    : null
  const consumoValor        = haySaldoFinal
    ? r2(stock_inicial + compras_netas - stock_final)
    : null

  return {
    desglose_v: 1,
    stock_inicial:       { uds: haySaldoInicial ? (stock_inicial_uds ?? null) : null, valor_eur: stock_inicial },
    entradas: {
      compras_bruto: { uds: compras_bruto_uds ?? null, valor_eur: compras_bruto },
      devoluciones:  { uds: devoluciones_uds  ?? null, valor_eur: devoluciones  },
      compras_netas: { uds: compras_netas_uds ?? null, valor_eur: compras_netas },
    },
    ventas_botella:      { uds: c.botella?.uds || 0, valor_eur: ventas_botella_coste },
    ventas_copa:         { uds: c.copa?.copas  || 0, valor_eur: ventas_copa_coste },
    salidas_sin_venta: {
      ...salidas,
      total: { uds: salidas_total_uds, valor_eur: salidas_total_valor },
    },
    stock_final_teorico: { uds: null, valor_eur: stockFinalTeorico   },
    ajuste_inventario:   { uds: null, valor_eur: ajusteInventario    },
    stock_final_real:    { uds: null, valor_eur: stockFinalRealValor },
    consumo:             { uds: null, valor_eur: consumoValor        },
  }
}

// ── B5: Cierre mensual P&L ────────────────────────────────────────────────────
export async function calcularMesBodega({ restaurante_id, mes, supabase }) {
  const [y, m] = mes.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const desde = `${mes}-01`
  const hasta = `${mes}-${String(lastDay).padStart(2, '0')}`
  // UTC bounds for Madrid timestamps (CET=+01:00 winter, CEST=+02:00 summer).
  // Usamos [desde_ts, hasta_next_ts) semi-abierto: evita perder el último
  // segundo que .lte('…T23:59:59') descartaba (p.ej. 23:59:59.5), y maneja
  // bien el cambio DST cuando el día siguiente cae en otro offset.
  const tzOff      = (m >= 4 && m <= 10) ? '+02:00' : '+01:00'
  const desde_ts   = new Date(`${desde}T00:00:00${tzOff}`).toISOString()
  const nextY      = (m === 12) ? y + 1 : y
  const nextM      = (m === 12) ? 1     : m + 1
  const tzOffNext  = (nextM >= 4 && nextM <= 10) ? '+02:00' : '+01:00'
  const nextMesStr = `${nextY}-${String(nextM).padStart(2, '0')}-01`
  const hasta_next_ts = new Date(`${nextMesStr}T00:00:00${tzOffNext}`).toISOString()

  const { data: settings } = await supabase
    .from('restaurant_economic_settings')
    .select('iva_venta_pct, copas_por_botella, merma_copa_pct, gastos_mensuales')
    .eq('restaurante_id', restaurante_id)
    .single()

  const ivaPct       = Number(settings?.iva_venta_pct) > 0  ? Number(settings.iva_venta_pct)  : 10
  const copasXBot    = Number(settings?.copas_por_botella) > 0 ? Number(settings.copas_por_botella) : 5
  const merraPct     = Number(settings?.merma_copa_pct) || 0
  const gastosArr    = Array.isArray(settings?.gastos_mensuales) ? settings.gastos_mensuales : []
  const gastosDelMes = gastosArr.filter(g => g.mes === mes)
  const gastos_total = r2(gastosDelMes.reduce((s, g) => s + (Number(g.importe) || 0), 0))

  const informe = await agregarPeriodoBodega({ restaurante_id, desde, hasta, supabase })

  // Fase A — eventos de bodega: cabeceras de maridaje/grupo con
  // importe neto facturado. La tabla `public.eventos_bodega` es
  // opcional: si no existe (migración pendiente) la consulta falla
  // con 42P01 y el agregador degrada silenciosamente.
  //
  // DECISIÓN DOCUMENTADA (ver app/lib/eventosBodega.js):
  //   - NO se suman a `ventas_neto` para no romper la coherencia
  //     con cierres firmados ni con YoY de Explotación.
  //   - Se exponen en `informe.eventos` y como filas propias en la
  //     hoja "Canales venta" del Excel.
  //   - Los eventos con `incluido_en_tpv=true` se muestran en la
  //     pestaña Eventos pero NO suman al canal (evita doble conteo).
  let eventosAgregados = null
  try {
    const { data: eventos, error: errEv } = await supabase
      .from('eventos_bodega')
      .select('tipo, importe_neto, importe_bruto, num_comensales, incluido_en_tpv, fecha')
      .eq('restaurante_id', restaurante_id)
      .gte('fecha', desde)
      .lte('fecha', hasta)
    if (!errEv && Array.isArray(eventos)) {
      // Import lazy para evitar ciclos en builds server.
      const { sumarEventosPorTipo } = await import('./eventosBodega.js')
      eventosAgregados = sumarEventosPorTipo(eventos)
    } else if (errEv) {
      // Si no es "relación inexistente", logueamos para diagnóstico.
      // Degradación: eventosAgregados queda null y el agregador no
      // adjunta `informe.eventos`; comportamiento igual a main.
      const { esRelacionInexistente } = await import('./eventosBodega.js')
      if (!esRelacionInexistente(errEv)) {
        console.warn('[agregarPeriodoBodega:eventos_bodega]', {
          code:    errEv.code,
          message: errEv.message,
          hint:    errEv.hint,
          details: errEv.details,
        })
      }
    }
  } catch (err) {
    // Excepción inesperada (tipo de datos, red). No rompemos el
    // agregador — degrada sin eventos.
    console.warn('[agregarPeriodoBodega:eventos_bodega] excepción', err?.message || err?.name)
  }

  const ventas_bruto     = informe.resumen.ingresos_venta
  const ventas_neto      = r2(ventas_bruto / (1 + ivaPct / 100))
  const salidas_no_venta = informe.resumen.consumos_valor
  // Ventas netas provenientes de cabeceras de eventos NO-TPV
  // (informativo; NO se suma a ventas_neto).
  const ventas_eventos_neto = eventosAgregados
    ? r2(eventosAgregados.ingresos_netos_para_canal) : 0

  // Coste de ventas teórico
  const copasVendibles = r4(copasXBot * (1 - merraPct / 100))
  let coste_acc = 0
  const sin_coste = []
  for (const v of informe.por_vino) {
    if (!v.tiene_coste) { sin_coste.push(v.nombre); continue }
    const c = Number(v.coste_unitario)
    if (v.uds > 0)                           coste_acc += r2(v.uds * c)
    if (v.copas > 0 && copasVendibles > 0)   coste_acc += r2((v.copas / copasVendibles) * c)
  }
  const coste_ventas_teorico = r2(coste_acc)
  const margen_bruto = r2(ventas_neto - coste_ventas_teorico)
  const margen_pct   = ventas_neto > 0 ? Math.round(margen_bruto / ventas_neto * 100) : null

  // Compras B2 (con cabecera) — fuente canónica: lineas_compra.importe_neto
  // por fecha de cabecera (DATE en Europe/Madrid, desde/hasta ya son YYYY-MM-DD Madrid)
  // Paginado: un mes con cientos de albaranes supera 1000.
  const cabecerasMes = await fetchAllPages(() =>
    supabase.from('cabecera_compras')
      .select('id')
      .eq('restaurante_id', restaurante_id)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .eq('estado', 'aplicada')
  )

  const cabeceraIds = cabecerasMes.map(c => c.id)
  let compras_b2 = 0, compras_b2_uds = 0
  if (cabeceraIds.length > 0) {
    // Chunk .in() a 100 ids y paginar cada chunk: lineas_compra puede acumular
    // >1000 filas por mes aunque las cabeceras sean pocas.
    let acc = 0, accUds = 0
    for (const chunk of chunkArray(cabeceraIds, 100)) {
      const rows = await fetchAllPages(() =>
        supabase.from('lineas_compra')
          .select('importe_neto, uds, uds_bonificadas')
          .in('cabecera_id', chunk)
      )
      for (const l of rows) {
        acc    += (Number(l.importe_neto) || 0)
        // uds_totales = uds + uds_bonificadas (convención en b2_compras_pmp.sql).
        accUds += (Number(l.uds) || 0) + (Number(l.uds_bonificadas) || 0)
      }
    }
    compras_b2     = r2(acc)
    compras_b2_uds = accUds
  }

  // Compras históricas (sin cabecera) + devoluciones — movimientos_stock
  // IS NULL cabecera_compra_id evita doble conteo con compras B2.
  // Paginado: histórico de movimientos puede superar 1000 por mes.
  // Rango semi-abierto [desde_ts, hasta_next_ts) para no perder segundos.
  const movsCD = await fetchAllPages(() =>
    supabase.from('movimientos_stock')
      .select('tipo, cantidad, vino:vinos(coste_medio_pmp, coste_compra)')
      .eq('restaurante_id', restaurante_id)
      .in('tipo', ['compra', 'devolucion'])
      .is('cabecera_compra_id', null)
      .gte('created_at', desde_ts)
      .lt('created_at', hasta_next_ts)
  )

  let compras_hist = 0, devol_acc = 0, compras_hist_uds = 0, devol_uds = 0
  for (const mov of movsCD) {
    const c   = Number(mov.vino?.coste_medio_pmp) || Number(mov.vino?.coste_compra) || 0
    const uds = Math.max(0, Number(mov.cantidad) || 0)
    const val = r2(uds * c)
    if (mov.tipo === 'compra')     { compras_hist += val; compras_hist_uds += uds }
    if (mov.tipo === 'devolucion') { devol_acc    += val; devol_uds        += uds }
  }
  const compras_bruto = r2(compras_b2 + compras_hist)
  const devoluciones  = r2(devol_acc)
  const compras_netas = r2(compras_bruto - devoluciones)

  // uds totales de entradas. Fuente: lineas_compra.(uds+uds_bonificadas) +
  // movimientos_stock.cantidad para los movimientos "compra"/"devolucion"
  // sin cabecera (misma regla que el valor). Si en el futuro se crean
  // devoluciones como líneas con importe negativo dentro de lineas_compra,
  // no se recogerían aquí — revisar entonces esta pareja.
  const compras_bruto_uds = compras_b2_uds + compras_hist_uds
  const devoluciones_uds  = devol_uds
  const compras_netas_uds = compras_bruto_uds - devoluciones_uds

  // Conteos del mes para stock y diferencias de inventario.
  // Paginado + semi-abierto por timestamptz. fetchAllPages ordena por
  // created_at,id, así que re-ordenamos por cerrado_en para preservar la
  // semántica de "primer / último conteo del mes".
  const conteosRaw = await fetchAllPages(() =>
    supabase.from('conteos_inventario')
      .select('id, cerrado_en')
      .eq('restaurante_id', restaurante_id)
      .eq('estado', 'cerrado')
      .gte('cerrado_en', desde_ts)
      .lt('cerrado_en', hasta_next_ts)
  )
  const conteosMes = conteosRaw.slice().sort((a, b) =>
    String(a.cerrado_en).localeCompare(String(b.cerrado_en))
  )

  let stock_inicial        = null
  let stock_inicial_uds    = null
  let stock_final          = null
  let diferencias_inventario = null
  let aviso_stock          = null

  if (conteosMes.length > 0) {
    const conteoFin = conteosMes[conteosMes.length - 1]
    const lineasFin = await fetchAllPages(() =>
      supabase.from('conteos_inventario_lineas')
        .select('stock_teorico, stock_contado, coste_unitario_snapshot, contado, diferencia')
        .eq('conteo_id', conteoFin.id)
    )

    stock_final = r2(lineasFin.reduce((s, l) => {
      const coste = Number(l.coste_unitario_snapshot) || 0
      const stock = (l.contado && l.stock_contado != null)
        ? Number(l.stock_contado)
        : Number(l.stock_teorico) || 0
      return s + stock * coste
    }, 0))

    diferencias_inventario = r2(lineasFin.reduce((s, l) => {
      if (!l.contado || l.diferencia == null) return s
      return s + Number(l.diferencia) * (Number(l.coste_unitario_snapshot) || 0)
    }, 0))

    if (conteosMes.length >= 2) {
      const conteoIni = conteosMes[0]
      const lineasIni = await fetchAllPages(() =>
        supabase.from('conteos_inventario_lineas')
          .select('stock_teorico, coste_unitario_snapshot')
          .eq('conteo_id', conteoIni.id)
      )
      stock_inicial = r2(lineasIni.reduce((s, l) =>
        s + (Number(l.stock_teorico) || 0) * (Number(l.coste_unitario_snapshot) || 0), 0))
      // uds del stock inicial: suma del stock_teorico del primer conteo.
      // No se puede calcular sin ese conteo, por eso queda null cuando sólo
      // hay 1 conteo del mes (abajo).
      stock_inicial_uds = lineasIni.reduce((s, l) => s + (Number(l.stock_teorico) || 0), 0)
    } else {
      aviso_stock = 'Solo un conteo en el mes — stock inicial no disponible'
    }
  } else {
    aviso_stock = 'Sin conteos en el mes — diferencias de inventario no disponibles'
  }

  // B4: Rendimiento por copa — botellas agotadas/cerradas en el período.
  // Fuente: botellas_abiertas cerradas (estado agotada o cerrada_manual).
  // HOTFIX: paginar. Un mes con rotación alta de copa supera 1000 botellas
  // cerradas y PostgREST truncaba, subestimando merma_copa_eur.
  // Rango semi-abierto en cerrada_at (timestamptz) para no perder segundos.
  const botellasRendimiento = await fetchAllPages(() =>
    supabase.from('botellas_abiertas')
      .select('vino_id, copas_servidas, copas_teoricas, coste_copa, vinos(nombre)')
      .eq('restaurante_id', restaurante_id)
      .in('estado', ['agotada', 'cerrada_manual'])
      .gte('cerrada_at', desde_ts)
      .lt('cerrada_at', hasta_next_ts)
  )

  const rendimiento_copa = Object.values(
    botellasRendimiento.reduce((acc, b) => {
      const vid = b.vino_id
      if (!acc[vid]) {
        acc[vid] = {
          vino_id:        vid,
          nombre:         b.vinos?.nombre || vid,
          botellas:       0,
          copas_reales:   0,
          copas_teoricas: 0,
          merma_eur:      0,
        }
      }
      acc[vid].botellas       += 1
      acc[vid].copas_reales   += Number(b.copas_servidas)  || 0
      acc[vid].copas_teoricas += Number(b.copas_teoricas)  || 0
      const perdida = Math.max(0, (Number(b.copas_teoricas) || 0) - (Number(b.copas_servidas) || 0))
      acc[vid].merma_eur      += r2(perdida * (Number(b.coste_copa) || 0))
      return acc
    }, {})
  ).filter(r => r.botellas > 0)
    .map(r => ({
      ...r,
      copas_reales:   r4(r.copas_reales),
      copas_teoricas: r4(r.copas_teoricas),
      merma_eur:      r2(r.merma_eur),
      rendimiento_pct: r.copas_teoricas > 0
        ? Math.round((r.copas_reales / r.copas_teoricas) * 100)
        : null,
    }))
    .sort((a, b) => b.merma_eur - a.merma_eur)

  // Merma copa: coste de copas descartadas en botellas cerradas del período.
  // Fuente: rendimiento_copa.merma_eur (suma de (copas_teoricas − copas_servidas) × coste_copa).
  // Identidad: coste_servidas + merma_eur = coste_botella → sin doble conteo con coste_ventas_teorico.
  const merma_copa_eur = r2(rendimiento_copa.reduce((s, r) => s + r.merma_eur, 0))

  // diferencias_inventario = físico − teórico (negativo = pérdida de stock)
  // Se SUMA con su signo: pérdida reduce el resultado, ganancia lo mejora
  const resultado = r2(
    ventas_neto
    - coste_ventas_teorico
    - salidas_no_venta
    - merma_copa_eur
    + (diferencias_inventario ?? 0)
    - gastos_total
  )

  // Desglose: construcción delegada a función pura exportada (testeable).
  // Se pasa coste_ventas_teorico para que el reparto de redondeo entre
  // canales + salidas cuadre al céntimo con el total del cierre.
  const desglose = _construirDesglose({
    stock_inicial, stock_inicial_uds,
    stock_final,
    compras_bruto, compras_bruto_uds,
    devoluciones,  devoluciones_uds,
    compras_netas, compras_netas_uds,
    por_canal: informe.por_canal,
    coste_ventas_teorico,
  })

  // Fase A — enriquecemos `informe.eventos` con los agregados por
  // tipo para que el Excel lo consuma al pintar la hoja "Canales
  // venta". Si no hay tabla / mes vacío, queda null y la hoja no
  // añade filas de maridaje/evento.
  const informeConEventos = eventosAgregados
    ? { ...informe, eventos: eventosAgregados }
    : informe

  return {
    mes, desde, hasta,
    partes_incluidos:     informe.meta.partes_incluidos,
    borradores_excluidos: informe.meta.borradores_excluidos ?? 0,
    b8_pendiente:         informe.meta.b8_pendiente ?? false,
    ventas_bruto, ventas_neto, iva_pct: ivaPct,
    ventas_eventos_neto,            // informativo; NO suma a ventas_neto
    coste_ventas_teorico, margen_bruto, margen_pct,
    compras_bruto, devoluciones, compras_netas,
    salidas_no_venta,
    merma_copa_eur,
    diferencias_inventario, stock_inicial, stock_final, aviso_stock,
    gastos: gastosDelMes, gastos_total,
    resultado,
    cobertura: { partes_incluidos: informe.meta.partes_incluidos, sin_coste },
    rendimiento_copa,
    informe: informeConEventos,
    desglose,
  }
}
