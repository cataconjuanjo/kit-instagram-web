import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import {
  indexarMovimientos,
  indexarCompras,
  indexarPartes,
  calcularFilaVino,
  totalizarFilas,
} from '../../lib/libroBodega'

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

async function fetchByIds(table, select, idCol, ids) {
  const rows = []
  for (let i = 0; i < ids.length; i += IN_MAX) {
    const chunk = ids.slice(i, i + IN_MAX)
    let from = 0
    while (true) {
      const { data, error } = await supabaseAdmin
        .from(table).select(select).in(idCol, chunk).range(from, from + PAGE - 1)
      if (error) { if (error.code === 'PGRST103') break; throw new Error(`${table}: ${error.message}`) }
      rows.push(...(data || []))
      if ((data || []).length < PAGE) break
      from += PAGE
    }
  }
  return rows
}

// GET /api/libro-bodega?restaurante_id=&anio=YYYY
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id   = searchParams.get('restaurante_id')
    const anio             = parseInt(searchParams.get('anio') || String(new Date().getFullYear()), 10)

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const now    = new Date()
    const curAnio = now.getFullYear()
    const curMes  = now.getMonth() + 1  // 1-12

    const desde      = `${anio}-01-01`
    const hasta      = `${anio}-12-31`
    const hastaExcl  = `${anio + 1}-01-01`  // Para timestamp fields: evita perder movs del 31-dic con hora >00:00

    // 1. Vinos (incluye stock para reconstrucción del mes abierto actual)
    const { data: vinos } = await supabaseAdmin
      .from('vinos').select('id,nombre,tipo,stock').eq('restaurante_id', restaurante_id)

    // 2. stock_mensual_bodega (año anterior dic + año completo para stock_ini del primer mes)
    const smbRaw = await fetchAll((f, t) =>
      supabaseAdmin.from('stock_mensual_bodega')
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

    // 3. Cierres → estado + iva_pct
    const { data: cierresRaw } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .select('mes,snapshot')
      .eq('restaurante_id', restaurante_id)
      .gte('mes', `${anio}-01`).lte('mes', `${anio}-12`)
    const cierresMap = Object.fromEntries(
      (cierresRaw || []).map(c => [c.mes, c.snapshot || {}])
    )

    // 4. Compras del año (importe_neto por vino/mes)
    const { data: cabeceras } = await supabaseAdmin
      .from('cabecera_compras').select('id,fecha')
      .eq('restaurante_id', restaurante_id)
      .gte('fecha', desde).lte('fecha', hasta)
    const cabIds       = (cabeceras || []).map(c => c.id)
    const cabFechaMap  = Object.fromEntries((cabeceras || []).map(c => [c.id, c.fecha]))
    const lineasCompra = cabIds.length > 0
      ? await fetchByIds('lineas_compra', 'cabecera_id,vino_id,importe_neto', 'cabecera_id', cabIds)
      : []

    // 5. Partes + lineas del año
    const partesRaw = await fetchAll((f, t) =>
      supabaseAdmin.from('partes_servicio')
        .select('id,fecha').eq('restaurante_id', restaurante_id)
        .eq('estado', 'cerrado').gte('fecha', desde).lte('fecha', hasta)
        .range(f, t)
    )
    const parteIds      = partesRaw.map(p => p.id)
    const parteFechaMap = Object.fromEntries(partesRaw.map(p => [p.id, p.fecha]))
    const lineasPartes  = parteIds.length > 0
      ? await fetchByIds(
          'partes_servicio_lineas',
          'parte_id,vino_id,tipo,cantidad,copas_vendidas,precio_unitario',
          'parte_id', parteIds
        )
      : []

    // 6. Movimientos del año
    // fecha_movimiento es timestamp with timezone; usar lt(hastaExcl) para no perder horas del 31-dic
    const movs = await fetchAll((f, t) =>
      supabaseAdmin.from('movimientos_stock')
        .select('tipo,cantidad,fecha_movimiento,vino_id')
        .eq('restaurante_id', restaurante_id)
        .gte('fecha_movimiento', desde).lt('fecha_movimiento', hastaExcl)
        .range(f, t)
    )

    // Indexar
    const movsIdx    = indexarMovimientos(movs)
    const comprasIdx = indexarCompras(lineasCompra, cabFechaMap)
    const partesIdx  = indexarPartes(lineasPartes, parteFechaMap)

    // Construir respuesta por mes
    const meses = []
    for (let m = 1; m <= 12; m++) {
      // No mostrar meses futuros del año en curso
      if (anio === curAnio && m > curMes) continue

      const mesK    = `${anio}-${String(m).padStart(2, '0')}`
      const prevMes = m === 1 ? `${anio - 1}-12` : `${anio}-${String(m - 1).padStart(2, '0')}`
      const cierre  = cierresMap[mesK]
      const estado  = cierre ? 'cerrado' : 'estimado'
      const ivaPct  = Number(cierre?.iva_pct) || 10

      // Para el mes abierto actual, usar vinos.stock como stock_fin y reconstruir hacia atrás
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
        })
      )

      // Omitir filas sin actividad ni stock
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

    return Response.json({ anio, meses })
  } catch (e) {
    console.error('libro-bodega GET:', e)
    return Response.json({ error: 'Error interno al cargar el libro de bodega' }, { status: 500 })
  }
}
