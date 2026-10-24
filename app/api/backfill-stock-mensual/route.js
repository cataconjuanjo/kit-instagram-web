import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

// GET /api/backfill-stock-mensual?restaurante_id=xxx
// Rellena stock_mensual_bodega a partir del campo vinos_stock en los snapshots
// de cierres_mensuales_bodega. Solo procesa cierres que incluyan ese campo
// (cierres creados a partir del bloque 4). Solo plan sumiller.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id = String(searchParams.get('restaurante_id') || '').trim()
    if (!restaurante_id) {
      return Response.json({ error: 'restaurante_id es obligatorio.' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: rest } = await supabaseAdmin
      .from('restaurantes')
      .select('plan')
      .eq('id', restaurante_id)
      .single()
    if (rest?.plan !== 'sumiller') {
      return Response.json({ error: 'Solo disponible para plan sumiller.' }, { status: 403 })
    }

    // Cierres que tienen vinos_stock en el snapshot
    const { data: cierres, error: cierresErr } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .select('id, mes, snapshot')
      .eq('restaurante_id', restaurante_id)
      .not('snapshot->vinos_stock', 'is', null)
      .order('mes', { ascending: true })
    if (cierresErr) throw cierresErr

    if (!cierres?.length) {
      return Response.json({ ok: true, meses_procesados: 0, filas_insertadas: 0 })
    }

    // Meses que ya tienen datos en stock_mensual_bodega
    const { data: yaExisten } = await supabaseAdmin
      .from('stock_mensual_bodega')
      .select('mes')
      .eq('restaurante_id', restaurante_id)
      .in('mes', cierres.map(c => c.mes))
    const mesesYaCubertos = new Set((yaExisten || []).map(r => r.mes))

    let mesesProcesados = 0
    let filasInsertadas = 0

    for (const cierre of cierres) {
      if (mesesYaCubertos.has(cierre.mes)) continue
      const vinosStock = cierre.snapshot?.vinos_stock
      if (!Array.isArray(vinosStock) || vinosStock.length === 0) continue

      const filas = vinosStock
        .filter(v => v.vino_id && v.stock_uds >= 0)
        .map(v => ({
          restaurante_id,
          mes:        cierre.mes,
          vino_id:    v.vino_id,
          stock_uds:  Math.max(0, Math.floor(Number(v.stock_uds) || 0)),
          coste_medio: Math.max(0, Number(v.coste_medio) || 0),
        }))

      if (filas.length === 0) continue

      const { error: insertErr } = await supabaseAdmin
        .from('stock_mensual_bodega')
        .upsert(filas, { onConflict: 'restaurante_id,mes,vino_id', ignoreDuplicates: true })
      if (insertErr) {
        console.error(`[backfill-stock-mensual] mes ${cierre.mes}:`, insertErr)
        continue
      }

      mesesProcesados++
      filasInsertadas += filas.length
    }

    return Response.json({ ok: true, meses_procesados: mesesProcesados, filas_insertadas: filasInsertadas })
  } catch (err) {
    console.error('[backfill-stock-mensual]', err)
    return Response.json({ error: 'Error en backfill.' }, { status: 500 })
  }
}
