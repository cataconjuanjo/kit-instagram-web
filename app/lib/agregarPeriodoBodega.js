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
        canal.copa.uds      += cantidad
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
      diaTurnoMap[key].ingresos += ingreso
    }

    // — Por mesa —
    if (l.mesa) {
      if (!mesaMap[l.mesa]) mesaMap[l.mesa] = { mesa: l.mesa, uds: 0, ingresos: 0 }
      mesaMap[l.mesa].uds      += esCopa ? copas : cantidad
      mesaMap[l.mesa].ingresos += ingreso
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
