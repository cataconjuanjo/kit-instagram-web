import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { calcularMesBodega } from '../../lib/agregarPeriodoBodega'
import { historicoPayloadDesdeCierre } from '../../lib/sommCierre'

function texto(v, max = 200) { return String(v || '').trim().slice(0, max) }

// GET /api/cierres-mes?restaurante_id=&mes=YYYY-MM
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restaurante_id = texto(searchParams.get('restaurante_id'), 80)
    const mes = texto(searchParams.get('mes'), 7)

    if (!restaurante_id || !mes) {
      return Response.json({ error: 'restaurante_id y mes son obligatorios' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return Response.json({ error: 'mes debe tener formato YYYY-MM' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: cierre } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .select('id, mes, snapshot, cerrado_en')
      .eq('restaurante_id', restaurante_id)
      .eq('mes', mes)
      .maybeSingle()

    if (cierre) {
      return Response.json({ cerrado: true, cierre })
    }

    const datos = await calcularMesBodega({ restaurante_id, mes, supabase: supabaseAdmin })
    return Response.json({ cerrado: false, datos })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/cierres-mes  { restaurante_id, mes }
export async function POST(req) {
  try {
    const body = await req.json()
    const restaurante_id = texto(body.restaurante_id, 80)
    const mes = texto(body.mes, 7)

    if (!restaurante_id || !mes) {
      return Response.json({ error: 'restaurante_id y mes son obligatorios' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return Response.json({ error: 'mes debe tener formato YYYY-MM' }, { status: 400 })
    }

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: existente } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .select('id')
      .eq('restaurante_id', restaurante_id)
      .eq('mes', mes)
      .maybeSingle()

    if (existente) {
      return Response.json(
        { error: 'El mes ya está cerrado. Usa /reabrir para eliminarlo primero.' },
        { status: 409 }
      )
    }

    const snapshot = await calcularMesBodega({ restaurante_id, mes, supabase: supabaseAdmin })

    // Si plan sumiller: adjuntar snapshot de stock por vino para backfill futuro
    const { data: rest } = await supabaseAdmin
      .from('restaurantes')
      .select('plan')
      .eq('id', restaurante_id)
      .single()

    let snapshotFinal = snapshot
    if (rest?.plan === 'sumiller') {
      const { data: vinos } = await supabaseAdmin
        .from('vinos')
        .select('id, stock, coste_medio_pmp, coste_compra')
        .eq('restaurante_id', restaurante_id)
        .gt('stock', 0)
      snapshotFinal = {
        ...snapshot,
        vinos_stock: (vinos || []).map(v => ({
          vino_id:    v.id,
          stock_uds:  Math.max(0, Math.floor(Number(v.stock) || 0)),
          coste_medio: Number(v.coste_medio_pmp) || Number(v.coste_compra) || 0,
        })),
      }
    }

    const { data: cierre, error } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .insert({ restaurante_id, mes, snapshot: snapshotFinal })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    // Insertar filas en stock_mensual_bodega (solo sumiller)
    if (rest?.plan === 'sumiller' && snapshotFinal.vinos_stock?.length > 0) {
      const filas = snapshotFinal.vinos_stock.map(v => ({
        restaurante_id,
        mes,
        vino_id:    v.vino_id,
        stock_uds:  v.stock_uds,
        coste_medio: v.coste_medio,
      }))
      await supabaseAdmin
        .from('stock_mensual_bodega')
        .upsert(filas, { onConflict: 'restaurante_id,mes,vino_id', ignoreDuplicates: true })
    }

    // Upsert historico_mensual con origen='auto' (no sobreescribe filas con origen='manual')
    if (rest?.plan === 'sumiller') {
      const [anioStr, mesStr] = mes.split('-')
      const { data: existente } = await supabaseAdmin
        .from('historico_mensual')
        .select('origen')
        .eq('restaurante_id', restaurante_id)
        .eq('anio', parseInt(anioStr, 10))
        .eq('mes', parseInt(mesStr, 10))
        .maybeSingle()

      if (!existente || existente.origen !== 'manual') {
        const payload = historicoPayloadDesdeCierre({ restaurante_id, mes, snapshot: snapshotFinal })
        await supabaseAdmin
          .from('historico_mensual')
          .upsert(payload, { onConflict: 'restaurante_id,anio,mes' })
      }
    }

    return Response.json({ cierre }, { status: 201 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
