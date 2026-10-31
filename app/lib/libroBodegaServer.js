/**
 * Helper server-side compartido entre /api/libro-bodega y /api/graficos-somm.
 *
 * Carga los datasets necesarios y los agrega por mes usando las funciones puras
 * de libroBodega.js. No duplica fórmulas.
 *
 * Devuelve: { anio, meses, copasVendibles, cierresMap, historicoMap, presupuestoMap }
 */

import {
  indexarMovimientos,
  indexarCompras,
  indexarPartes,
  calcularFilaVino,
  totalizarFilas,
  resolverCopasVendibles,
} from './libroBodega'

const PAGE   = 1000
const IN_MAX = 100

async function fetchAll(builder) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await builder(from, from + PAGE - 1)
    if (error) { if (error.code === 'PGRST103') break; throw new Error(error.message) }
    rows.push(...(data || []))
    if ((data || []).length < PAGE) break
    from += PAGE
  }
  return rows
}

async function fetchByIds(supabase, table, select, idCol, ids) {
  const rows = []
  for (let i = 0; i < ids.length; i += IN_MAX) {
    const chunk = ids.slice(i, i + IN_MAX)
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from(table).select(select).in(idCol, chunk).range(from, from + PAGE - 1)
      if (error) { if (error.code === 'PGRST103') break; throw new Error(`${table}: ${error.message}`) }
      rows.push(...(data || []))
      if ((data || []).length < PAGE) break
      from += PAGE
    }
  }
  return rows
}

/**
 * Carga + agrega. Opción includeExtras:
 *   - true: también incluye historico_mensual y presupuesto_mensual (para /api/graficos-somm)
 *   - false: solo libro-bodega base
 */
export async function cargarAgregadoLibro(supabase, { restaurante_id, anio, includeExtras = false }) {
  const now     = new Date()
  const curAnio = now.getFullYear()
  const curMes  = now.getMonth() + 1

  const desde     = `${anio}-01-01`
  const hasta     = `${anio}-12-31`
  const hastaExcl = `${anio + 1}-01-01`

  // Vinos (coste del cierre + stock para mes abierto)
  const { data: vinos } = await supabase
    .from('vinos').select('id,nombre,tipo,stock,coste_medio_pmp,coste_compra')
    .eq('restaurante_id', restaurante_id)

  // Settings → copasVendibles
  const { data: settings } = await supabase
    .from('restaurant_economic_settings')
    .select('copas_por_botella,ml_por_copa,merma_copa_pct')
    .eq('restaurante_id', restaurante_id).maybeSingle()
  const copasVendibles = resolverCopasVendibles(settings)

  // SMB (prev dic + año completo)
  const smbRaw = await fetchAll((f, t) =>
    supabase.from('stock_mensual_bodega')
      .select('mes,vino_id,stock_final_real,coste_medio')
      .eq('restaurante_id', restaurante_id)
      .gte('mes', `${anio - 1}-12`).lte('mes', `${anio}-12`)
      .range(f, t)
  )
  const smbMap = {}
  for (const r of smbRaw) {
    if (!smbMap[r.mes]) smbMap[r.mes] = {}
    smbMap[r.mes][r.vino_id] = r
  }

  // Cierres
  const { data: cierresRaw } = await supabase.from('cierres_mensuales_bodega')
    .select('mes,snapshot').eq('restaurante_id', restaurante_id)
    .gte('mes', `${anio}-01`).lte('mes', `${anio}-12`)
  const cierresMap = Object.fromEntries((cierresRaw || []).map(c => [c.mes, c.snapshot || {}]))

  // Compras
  const { data: cabeceras } = await supabase.from('cabecera_compras').select('id,fecha')
    .eq('restaurante_id', restaurante_id).gte('fecha', desde).lte('fecha', hasta)
  const cabIds      = (cabeceras || []).map(c => c.id)
  const cabFechaMap = Object.fromEntries((cabeceras || []).map(c => [c.id, c.fecha]))
  const lineasCompra = cabIds.length > 0
    ? await fetchByIds(supabase, 'lineas_compra', 'cabecera_id,vino_id,importe_neto', 'cabecera_id', cabIds)
    : []

  // Partes
  const partesRaw = await fetchAll((f, t) =>
    supabase.from('partes_servicio').select('id,fecha')
      .eq('restaurante_id', restaurante_id).eq('estado', 'cerrado')
      .gte('fecha', desde).lte('fecha', hasta).range(f, t)
  )
  const parteIds      = partesRaw.map(p => p.id)
  const parteFechaMap = Object.fromEntries(partesRaw.map(p => [p.id, p.fecha]))
  const lineasPartes  = parteIds.length > 0
    ? await fetchByIds(supabase, 'partes_servicio_lineas',
        'parte_id,vino_id,tipo,cantidad,copas_vendidas,precio_unitario', 'parte_id', parteIds)
    : []

  // Movimientos
  const movs = await fetchAll((f, t) =>
    supabase.from('movimientos_stock').select('tipo,cantidad,fecha_movimiento,vino_id')
      .eq('restaurante_id', restaurante_id)
      .gte('fecha_movimiento', desde).lt('fecha_movimiento', hastaExcl)
      .range(f, t)
  )

  const movsIdx    = indexarMovimientos(movs)
  const comprasIdx = indexarCompras(lineasCompra, cabFechaMap)
  const partesIdx  = indexarPartes(lineasPartes, parteFechaMap)

  // Extras: historico + presupuesto (para /api/graficos-somm)
  let historicoMap = {}, presupuestoMap = {}
  if (includeExtras) {
    const { data: hist } = await supabase.from('historico_mensual')
      .select('anio,mes,ingresos,consumo_mp,pct_mp')
      .eq('restaurante_id', restaurante_id).eq('anio', anio)
    for (const h of hist || []) {
      const k = `${h.anio}-${String(h.mes).padStart(2, '0')}`
      historicoMap[k] = h
    }
    const { data: pres } = await supabase.from('presupuesto_mensual')
      .select('anio,mes,objetivo_facturacion,objetivo_mp_pct,objetivo_margen_pct')
      .eq('restaurante_id', restaurante_id).eq('anio', anio)
    for (const p of pres || []) {
      const k = `${p.anio}-${String(p.mes).padStart(2, '0')}`
      presupuestoMap[k] = p
    }
  }

  // Construir meses
  const meses = []
  for (let m = 1; m <= 12; m++) {
    if (anio === curAnio && m > curMes) continue

    const mesK    = `${anio}-${String(m).padStart(2, '0')}`
    const prevMes = m === 1 ? `${anio - 1}-12` : `${anio}-${String(m - 1).padStart(2, '0')}`
    const cierre  = cierresMap[mesK]
    const estado  = cierre ? 'cerrado' : 'estimado'
    const ivaPct  = Number(cierre?.iva_pct) || 10
    const isOpenCurrentMonth = !cierre && anio === curAnio && m === curMes

    const filas = (vinos || []).map(vino =>
      calcularFilaVino({
        vino,
        smbPrev:         smbMap[prevMes]?.[vino.id]  ?? null,
        smbCurrent:      smbMap[mesK]?.[vino.id]     ?? null,
        movsEntry:       movsIdx[mesK]?.[vino.id]    ?? null,
        comprasEntry:    comprasIdx[mesK]?.[vino.id] ?? null,
        partesEntry:     partesIdx[mesK]?.[vino.id]  ?? null,
        ivaPct,
        vinoStockActual: isOpenCurrentMonth ? (Number(vino.stock) || 0) : null,
        copasVendibles,
      })
    )

    const filasActivas = filas.filter(f =>
      f.entradas_u        > 0 || f.ventas_bot_u    > 0 || f.ventas_copa_u > 0 ||
      f.copas_servidas_u  > 0 || f.otras_salidas_u > 0 || f.ajustes_u !== 0 ||
      (f.stock_ini ?? 0)  > 0 || (f.stock_fin ?? 0) > 0
    )

    meses.push({
      mes:     mesK,
      estado,
      vinos:   filasActivas,
      totales: totalizarFilas(filasActivas),
    })
  }

  return { anio, meses, copasVendibles, cierresMap, historicoMap, presupuestoMap }
}
