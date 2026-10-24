import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { clasificarCierresParaBackfill } from '../../lib/backfillCierresUtil'

// POST /api/backfill-stock-mensual
// Body: { restaurante_id, dry_run?: boolean }  (dry_run defaults to true)
// Rellena stock_mensual_bodega a partir de los snapshots de cierres_mensuales_bodega.
// Solo procesa cierres con snapshot.vinos_stock (creados a partir del bloque 4).
// Informa de los cierres no reconstruibles (snapshot sin vinos_stock).
// Solo plan sumiller.
export async function POST(req) {
  try {
    const body = await req.json()
    const restaurante_id = String(body.restaurante_id || '').trim()
    const dry_run = body.dry_run !== false  // default true

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

    // Todos los cierres del restaurante
    const { data: todosCierres, error: cierresErr } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .select('id, mes, snapshot')
      .eq('restaurante_id', restaurante_id)
      .order('mes', { ascending: true })
    if (cierresErr) throw cierresErr

    if (!todosCierres?.length) {
      return Response.json({ ok: true, dry_run, meses_procesados: 0, filas_insertadas: 0, meses_no_reconstruibles: [] })
    }

    const { reconstruibles, noReconstruibles } = clasificarCierresParaBackfill(todosCierres)

    if (!reconstruibles.length) {
      return Response.json({ ok: true, dry_run, meses_procesados: 0, filas_insertadas: 0, meses_no_reconstruibles: noReconstruibles })
    }

    // Meses que ya tienen datos en stock_mensual_bodega
    const { data: yaExisten } = await supabaseAdmin
      .from('stock_mensual_bodega')
      .select('mes')
      .eq('restaurante_id', restaurante_id)
      .in('mes', reconstruibles.map(c => c.mes))
    const mesesYaCubertos = new Set((yaExisten || []).map(r => r.mes))

    const mesesAProcesar = reconstruibles.filter(c => !mesesYaCubertos.has(c.mes))

    if (dry_run) {
      return Response.json({
        ok:                      true,
        dry_run:                 true,
        meses_a_procesar:        mesesAProcesar.map(c => c.mes),
        meses_ya_cubiertos:      [...mesesYaCubertos],
        meses_no_reconstruibles: noReconstruibles,
      })
    }

    let mesesProcesados = 0
    let filasInsertadas = 0

    for (const cierre of mesesAProcesar) {
      const vinosStock = cierre.snapshot.vinos_stock
      const filas = vinosStock
        .filter(v => v.vino_id && v.stock_uds >= 0)
        .map(v => ({
          restaurante_id,
          mes:              cierre.mes,
          vino_id:          v.vino_id,
          stock_final_real: Math.max(0, Math.floor(Number(v.stock_uds) || 0)),
          coste_medio:      Math.max(0, Number(v.coste_medio) || 0),
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

    return Response.json({
      ok:                      true,
      dry_run:                 false,
      meses_procesados:        mesesProcesados,
      filas_insertadas:        filasInsertadas,
      meses_no_reconstruibles: noReconstruibles,
    })
  } catch (err) {
    console.error('[backfill-stock-mensual]', err)
    return Response.json({ error: 'Error en backfill.' }, { status: 500 })
  }
}
