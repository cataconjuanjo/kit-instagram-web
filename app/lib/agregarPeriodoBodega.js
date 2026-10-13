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
    .select('fuente_ventas, copas_por_botella, ml_por_copa')
    .eq('restaurante_id', restaurante_id)
    .single()

  const fuente        = settings?.fuente_ventas ?? null
  const copasXBotella = Number(settings?.copas_por_botella) > 0
    ? Number(settings.copas_por_botella)
    : (settings?.ml_por_copa > 0 ? Math.round(750 / settings.ml_por_copa) : 5)

  const meta = { restaurante_id, desde, hasta, fuente_usada: 'parte', b8_pendiente: false }

  // B8 stub: fuente TPV no implementada todavía
  if (fuente === 'tpv') {
    return {
      meta: { ...meta, fuente_usada: 'tpv', b8_pendiente: true },
      ...emptyAgregacion(),
    }
  }

  // Partes del periodo
  const { data: partes } = await supabase
    .from('partes_servicio')
    .select('id, fecha, turno, estado')
    .eq('restaurante_id', restaurante_id)
    .gte('fecha', desde)
    .lte('fecha', hasta)

  const cerrados  = (partes || []).filter(p => p.estado === 'cerrado')
  const borradores = (partes || []).filter(p => p.estado === 'borrador').length

  if (cerrados.length === 0) {
    return {
      meta: { ...meta, partes_incluidos: 0, borradores_excluidos: borradores },
      ...emptyAgregacion(),
    }
  }

  const parteIds = cerrados.map(p => p.id)
  const parteMap = Object.fromEntries(cerrados.map(p => [p.id, p]))

  // Líneas con datos de vino
  const { data: lineas } = await supabase
    .from('partes_servicio_lineas')
    .select('*, vino:vinos(id, nombre, coste_medio_pmp, coste_compra)')
    .in('parte_id', parteIds)
    .order('created_at', { ascending: true })

  const lineasConParte = (lineas || []).map(l => ({ ...l, parte: parteMap[l.parte_id] }))

  return {
    meta: { ...meta, partes_incluidos: cerrados.length, borradores_excluidos: borradores },
    ..._agruparLineas(lineasConParte, { copas_por_botella: copasXBotella }),
  }
}

// ── Función pura exportada para tests ─────────────────────────────────────────
export function _agruparLineas(lineas, { copas_por_botella = 5 } = {}) {
  let ingresos_venta    = 0
  let botellas_vendidas = 0
  let copas_total       = 0
  let invitaciones_uds  = 0
  let consumos_uds      = 0
  let consumos_valor    = 0

  const canal = {
    botella:    { uds: 0, ingresos: 0 },
    copa:       { uds: 0, copas: 0, ingresos: 0 },
    invitacion: { uds: 0 },
    cocina:     { uds: 0, valor: 0 },
    evento:     { uds: 0, valor: 0 },
    maridaje:   { uds: 0, valor: 0 },
    rotura:     { uds: 0 },
    cata:       { uds: 0, valor: 0 },
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

    // — Canal —
    switch (l.tipo) {
      case 'venta_botella':
        ingresos_venta    += ingreso
        botellas_vendidas += cantidad
        canal.botella.uds      += cantidad
        canal.botella.ingresos += ingreso
        break
      case 'venta_copa':
        ingresos_venta    += ingreso
        copas_total       += copas
        canal.copa.copas    += copas
        canal.copa.ingresos += ingreso
        break
      case 'invitacion_botella':
        invitaciones_uds      += cantidad
        canal.invitacion.uds  += cantidad
        break
      case 'invitacion_copa':
        invitaciones_uds      += copas || cantidad
        canal.invitacion.uds  += copas || cantidad
        break
      case 'cocina':
        consumos_uds       += cantidad
        consumos_valor     += ingreso
        canal.cocina.uds   += cantidad
        canal.cocina.valor += ingreso
        break
      case 'grupo_evento':
        consumos_uds        += cantidad
        consumos_valor      += ingreso
        canal.evento.uds    += cantidad
        canal.evento.valor  += ingreso
        break
      case 'maridaje':
        consumos_uds          += cantidad
        consumos_valor        += ingreso
        canal.maridaje.uds    += cantidad
        canal.maridaje.valor  += ingreso
        break
      case 'rotura':
        consumos_uds       += cantidad
        canal.rotura.uds   += cantidad
        break
      case 'cata':
        consumos_uds      += cantidad
        consumos_valor    += ingreso
        canal.cata.uds    += cantidad
        canal.cata.valor  += ingreso
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
  const porVino = Object.values(vinoMap).map(v => {
    let margen_pct = null
    if (v.tiene_coste && v.ingresos > 0) {
      const coste_total = r2(v.coste_unitario * v.uds)
      margen_pct = coste_total > 0
        ? Math.round(((v.ingresos - coste_total) / v.ingresos) * 100)
        : null
    }
    return { ...v, margen_pct }
  }).sort((a, b) => b.ingresos - a.ingresos)

  const botellas_equivalentes = r2(copas_total / copas_por_botella)

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
    por_canal:    { botella: { uds: 0, ingresos: 0 }, copa: { uds: 0, copas: 0, ingresos: 0 },
                    invitacion: { uds: 0 }, cocina: { uds: 0, valor: 0 }, evento: { uds: 0, valor: 0 },
                    maridaje: { uds: 0, valor: 0 }, rotura: { uds: 0 }, cata: { uds: 0, valor: 0 } },
    por_vino:     [],
    por_dia_turno: [],
    top_ingresos:  [],
    top_uds:       [],
    por_mesa:      [],
  }
}

function r2(n) { return Math.round(Number(n) * 100) / 100 }
function r4(n) { return Math.round(Number(n) * 10000) / 10000 }

// ── B5: Cierre mensual P&L ────────────────────────────────────────────────────
export async function calcularMesBodega({ restaurante_id, mes, supabase }) {
  const [y, m] = mes.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const desde = `${mes}-01`
  const hasta = `${mes}-${String(lastDay).padStart(2, '0')}`
  // UTC bounds for Madrid timestamps (CET=+01:00 winter, CEST=+02:00 summer)
  const tzOff   = (m >= 4 && m <= 10) ? '+02:00' : '+01:00'
  const desde_ts = new Date(`${desde}T00:00:00${tzOff}`).toISOString()
  const hasta_ts  = new Date(`${hasta}T23:59:59${tzOff}`).toISOString()

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

  const ventas_bruto     = informe.resumen.ingresos_venta
  const ventas_neto      = r2(ventas_bruto / (1 + ivaPct / 100))
  const salidas_no_venta = informe.resumen.consumos_valor

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

  // Compras y devoluciones
  const { data: movsCD } = await supabase
    .from('movimientos_stock')
    .select('tipo, cantidad, vino:vinos(coste_medio_pmp, coste_compra)')
    .eq('restaurante_id', restaurante_id)
    .in('tipo', ['compra', 'devolucion'])
    .gte('created_at', desde_ts)
    .lte('created_at', hasta_ts)

  let compras_acc = 0, devol_acc = 0
  for (const mov of movsCD || []) {
    const c   = Number(mov.vino?.coste_medio_pmp) || Number(mov.vino?.coste_compra) || 0
    const val = r2(Math.max(0, Number(mov.cantidad) || 0) * c)
    if (mov.tipo === 'compra')     compras_acc += val
    if (mov.tipo === 'devolucion') devol_acc   += val
  }
  const compras_bruto = r2(compras_acc)
  const devoluciones  = r2(devol_acc)
  const compras_netas = r2(compras_bruto - devoluciones)

  // Conteos del mes para stock y diferencias de inventario
  const { data: conteosMes } = await supabase
    .from('conteos_inventario')
    .select('id, cerrado_en')
    .eq('restaurante_id', restaurante_id)
    .eq('estado', 'cerrado')
    .gte('cerrado_en', desde_ts)
    .lte('cerrado_en', hasta_ts)
    .order('cerrado_en')

  let stock_inicial        = null
  let stock_final          = null
  let diferencias_inventario = null
  let aviso_stock          = null

  if (conteosMes && conteosMes.length > 0) {
    const conteoFin = conteosMes[conteosMes.length - 1]
    const { data: lineasFin } = await supabase
      .from('conteos_inventario_lineas')
      .select('stock_teorico, stock_contado, coste_unitario_snapshot, contado, diferencia')
      .eq('conteo_id', conteoFin.id)

    stock_final = r2((lineasFin || []).reduce((s, l) => {
      const coste = Number(l.coste_unitario_snapshot) || 0
      const stock = (l.contado && l.stock_contado != null)
        ? Number(l.stock_contado)
        : Number(l.stock_teorico) || 0
      return s + stock * coste
    }, 0))

    diferencias_inventario = r2((lineasFin || []).reduce((s, l) => {
      if (!l.contado || l.diferencia == null) return s
      return s + Number(l.diferencia) * (Number(l.coste_unitario_snapshot) || 0)
    }, 0))

    if (conteosMes.length >= 2) {
      const conteoIni = conteosMes[0]
      const { data: lineasIni } = await supabase
        .from('conteos_inventario_lineas')
        .select('stock_teorico, coste_unitario_snapshot')
        .eq('conteo_id', conteoIni.id)
      stock_inicial = r2((lineasIni || []).reduce((s, l) =>
        s + (Number(l.stock_teorico) || 0) * (Number(l.coste_unitario_snapshot) || 0), 0))
    } else {
      aviso_stock = 'Solo un conteo en el mes — stock inicial no disponible'
    }
  } else {
    aviso_stock = 'Sin conteos en el mes — diferencias de inventario no disponibles'
  }

  // diferencias_inventario = físico − teórico (negativo = pérdida de stock)
  // Se SUMA con su signo: pérdida reduce el resultado, ganancia lo mejora
  const resultado = r2(
    ventas_neto
    - coste_ventas_teorico
    - salidas_no_venta
    + (diferencias_inventario ?? 0)
    - gastos_total
  )

  return {
    mes, desde, hasta,
    partes_incluidos:     informe.meta.partes_incluidos,
    borradores_excluidos: informe.meta.borradores_excluidos ?? 0,
    b8_pendiente:         informe.meta.b8_pendiente ?? false,
    ventas_bruto, ventas_neto, iva_pct: ivaPct,
    coste_ventas_teorico, margen_bruto, margen_pct,
    compras_bruto, devoluciones, compras_netas,
    salidas_no_venta,
    diferencias_inventario, stock_inicial, stock_final, aviso_stock,
    gastos: gastosDelMes, gastos_total,
    resultado,
    cobertura: { partes_incluidos: informe.meta.partes_incluidos, sin_coste },
    informe,
  }
}
