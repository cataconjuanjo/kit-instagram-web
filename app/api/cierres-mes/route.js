import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { calcularMesBodega } from '../../lib/agregarPeriodoBodega'
import { historicoPayloadDesdeCierre } from '../../lib/sommCierre'
import { decidirHistoricoAuto } from '../../lib/historicoAutoDecision'
import { añadirVinosStockAlSnapshot, insertarStockMensualBodega } from '../../lib/insertarStockMensualBodega'

function texto(v, max = 200) { return String(v || '').trim().slice(0, max) }

function calcPrevMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

// Calcula stock_inicial_valor (del cierre anterior) y compras_total (lineas_compra del mes)
async function fetchCierreContext({ restaurante_id, mes }) {
  const [y, m] = mes.split('-')

  // stock_inicial_valor = stock_final del cierre del mes anterior
  const prevMesStr = calcPrevMes(mes)
  const { data: prevCierre } = await supabaseAdmin
    .from('cierres_mensuales_bodega')
    .select('snapshot')
    .eq('restaurante_id', restaurante_id)
    .eq('mes', prevMesStr)
    .maybeSingle()
  const stock_inicial_valor = Number(prevCierre?.snapshot?.stock_final) || 0

  // compras_total = sum(importe_neto) de lineas_compra cuya cabecera fecha cae en el mes
  const mesStart       = `${mes}-01`
  const mNum           = parseInt(m, 10)
  const yNum           = parseInt(y, 10)
  const nextMonthDate  = mNum === 12
    ? `${yNum + 1}-01-01`
    : `${y}-${String(mNum + 1).padStart(2, '0')}-01`

  const { data: cabeceras } = await supabaseAdmin
    .from('cabecera_compras')
    .select('id')
    .eq('restaurante_id', restaurante_id)
    .gte('fecha', mesStart)
    .lt('fecha', nextMonthDate)

  let compras_total = 0
  const cabIds = (cabeceras || []).map(c => c.id)
  if (cabIds.length > 0) {
    const { data: lineas } = await supabaseAdmin
      .from('lineas_compra')
      .select('importe_neto')
      .in('cabecera_id', cabIds)
    compras_total = (lineas || []).reduce((s, l) => s + (Number(l.importe_neto) || 0), 0)
  }

  return { stock_inicial_valor, compras_total }
}

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
      snapshotFinal = añadirVinosStockAlSnapshot(snapshot, vinos)
    }

    const { data: cierre, error } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .insert({ restaurante_id, mes, snapshot: snapshotFinal })
      .select()
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })

    if (rest?.plan === 'sumiller') {
      await insertarStockMensualBodega(supabaseAdmin, { restaurante_id, mes, vinos_stock: snapshotFinal.vinos_stock })
    }

    // Upsert historico_mensual con origen='auto' (no sobreescribe filas con origen='manual')
    if (rest?.plan === 'sumiller') {
      const [anioStr, mesStr] = mes.split('-')
      const { data: filaExistente } = await supabaseAdmin
        .from('historico_mensual')
        .select('ingresos, consumo_mp, gastos_fijos, valor_stock_bodega, origen')
        .eq('restaurante_id', restaurante_id)
        .eq('anio', parseInt(anioStr, 10))
        .eq('mes', parseInt(mesStr, 10))
        .maybeSingle()

      const { stock_inicial_valor, compras_total } = await fetchCierreContext({ restaurante_id, mes })
      const payload = historicoPayloadDesdeCierre({
        restaurante_id, mes, snapshot: snapshotFinal, stock_inicial_valor, compras_total,
      })

      const { upsert, conflicto } = decidirHistoricoAuto(payload, filaExistente)
      if (upsert) {
        await supabaseAdmin
          .from('historico_mensual')
          .upsert(payload, { onConflict: 'restaurante_id,anio,mes' })
      }
      if (conflicto) {
        return Response.json({ cierre, conflicto }, { status: 201 })
      }
      return Response.json({ cierre }, { status: 201 })
    }

    return Response.json({ cierre }, { status: 201 })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/cierres-mes  { restaurante_id, mes }
// Sobreescribe la fila manual de historico_mensual con los valores del cierre
export async function PATCH(req) {
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

    const { data: rest } = await supabaseAdmin
      .from('restaurantes')
      .select('plan')
      .eq('id', restaurante_id)
      .single()
    if (rest?.plan !== 'sumiller') {
      return Response.json({ error: 'Solo disponible para plan sumiller.' }, { status: 403 })
    }

    const { data: cierre } = await supabaseAdmin
      .from('cierres_mensuales_bodega')
      .select('snapshot')
      .eq('restaurante_id', restaurante_id)
      .eq('mes', mes)
      .maybeSingle()
    if (!cierre) {
      return Response.json({ error: 'No existe cierre para este mes.' }, { status: 404 })
    }

    const { stock_inicial_valor, compras_total } = await fetchCierreContext({ restaurante_id, mes })
    const payload = historicoPayloadDesdeCierre({
      restaurante_id, mes, snapshot: cierre.snapshot, stock_inicial_valor, compras_total,
    })

    await supabaseAdmin
      .from('historico_mensual')
      .upsert(payload, { onConflict: 'restaurante_id,anio,mes' })

    return Response.json({ ok: true })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
