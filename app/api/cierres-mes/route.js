import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { calcularMesBodega } from '../../lib/agregarPeriodoBodega'

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

    const { data: cierre, error } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .insert({ restaurante_id, mes, snapshot })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ cierre }, { status: 201 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
