import { createClient } from '@supabase/supabase-js'
import { requireRestaurantAccess } from '../../../_lib/auth'
import { calcularConsultoriaFase1, limpiarPayloadPersistencia } from '../../../../lib/consultoriaFase1Engine'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function adminClient() {
  if (!serviceRoleKey) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function haceDiasISO(dias) {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() - dias)
  return fecha.toISOString()
}

function soloCamposLatest(item) {
  return {
    id: item.id,
    created_at: item.created_at,
    periodo_inicio: item.periodo_inicio,
    periodo_fin: item.periodo_fin,
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = searchParams.get('restaurante_id')
    if (!restauranteId) return Response.json({ error: 'restaurante_id obligatorio.' }, { status: 400 })

    const supabase = adminClient()
    const auth = await requireRestaurantAccess(req, supabase, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const [
      { data: kpis, error: kpisError },
      { data: alertas, error: alertasError },
      { data: recomendaciones, error: recomendacionesError },
      { data: clasificaciones, error: clasificacionesError },
      { data: performance, error: performanceError },
    ] = await Promise.all([
      supabase.from('kpi_history').select('*').eq('restaurante_id', restauranteId).order('created_at', { ascending: false }).limit(40),
      supabase.from('alerts').select('*').eq('restaurante_id', restauranteId).in('estado', ['abierta', 'en_progreso']).order('created_at', { ascending: false }).limit(30),
      supabase.from('recommendations').select('*').eq('restaurante_id', restauranteId).in('estado', ['pendiente', 'en_progreso']).order('created_at', { ascending: false }).limit(30),
      supabase.from('wine_classifications').select('*, vinos(nombre, bodega, tipo, region, precio_botella, coste_compra)').eq('restaurante_id', restauranteId).order('created_at', { ascending: false }).limit(80),
      supabase.from('wine_performance').select('*, vinos(nombre, bodega, tipo, region, precio_botella, coste_compra)').eq('restaurante_id', restauranteId).order('created_at', { ascending: false }).limit(80),
    ])

    const error = kpisError || alertasError || recomendacionesError || clasificacionesError || performanceError
    if (error) throw error

    const ultima = kpis?.[0] ? soloCamposLatest(kpis[0]) : null
    const periodoFin = ultima?.periodo_fin || null
    const kpisUltimoPeriodo = periodoFin ? (kpis || []).filter(item => item.periodo_fin === periodoFin) : []
    const clasificacionesUltimoPeriodo = periodoFin ? (clasificaciones || []).filter(item => item.periodo_fin === periodoFin) : []
    const performanceUltimoPeriodo = periodoFin ? (performance || []).filter(item => item.periodo_fin === periodoFin) : []

    return Response.json({
      ultima,
      kpis: kpisUltimoPeriodo,
      alertas: alertas || [],
      recomendaciones: recomendaciones || [],
      clasificaciones: clasificacionesUltimoPeriodo,
      performance: performanceUltimoPeriodo,
    })
  } catch (error) {
    console.error('Error leyendo consultoria fase 1:', error)
    return Response.json({ error: 'No se pudo cargar la consultoria inteligente.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = body.restaurante_id
    if (!restauranteId) return Response.json({ error: 'restaurante_id obligatorio.' }, { status: 400 })

    const supabase = adminClient()
    const auth = await requireRestaurantAccess(req, supabase, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const periodoInicio = body.periodo_inicio || haceDiasISO(30)
    const periodoFin = new Date().toISOString()

    const [
      { data: restaurante, error: restError },
      { data: vinos, error: vinosError },
      { data: estadisticas, error: estadisticasError },
      { data: movimientos, error: movimientosError },
    ] = await Promise.all([
      supabase.from('restaurantes').select('*').eq('id', restauranteId).single(),
      supabase.from('vinos').select('*').eq('restaurante_id', restauranteId),
      supabase.from('estadisticas').select('*').eq('restaurante_id', restauranteId).gte('created_at', periodoInicio),
      supabase.from('movimientos_stock').select('*').eq('restaurante_id', restauranteId).gte('created_at', periodoInicio),
    ])

    const error = restError || vinosError || estadisticasError || movimientosError
    if (error) throw error

    const resultado = calcularConsultoriaFase1({
      restaurante,
      vinos: vinos || [],
      estadisticas: estadisticas || [],
      movimientos: movimientos || [],
      periodoInicio,
      periodoFin,
    })
    const payload = limpiarPayloadPersistencia(resultado)

    await Promise.all([
      supabase.from('alerts').update({ estado: 'descartada', updated_at: periodoFin }).eq('restaurante_id', restauranteId).eq('estado', 'abierta'),
      supabase.from('recommendations').update({ estado: 'descartada', updated_at: periodoFin }).eq('restaurante_id', restauranteId).eq('estado', 'pendiente').eq('origen', 'motor_consultoria_fase1'),
    ])

    const inserts = []
    if (payload.kpis.length) inserts.push(supabase.from('kpi_history').insert(payload.kpis))
    if (payload.winePerformance.length) inserts.push(supabase.from('wine_performance').insert(payload.winePerformance))
    if (payload.clasificaciones.length) inserts.push(supabase.from('wine_classifications').insert(payload.clasificaciones))
    if (payload.alertas.length) inserts.push(supabase.from('alerts').insert(payload.alertas))
    if (payload.recomendaciones.length) inserts.push(supabase.from('recommendations').insert(payload.recomendaciones))

    const insertResults = await Promise.all(inserts)
    const insertError = insertResults.find(res => res.error)?.error
    if (insertError) throw insertError

    return Response.json({
      ok: true,
      resumen: resultado.resumen,
      kpis: resultado.kpis,
      alertas: resultado.alertas,
      recomendaciones: resultado.recomendaciones,
      clasificaciones: resultado.clasificaciones.map(({ vino, ...item }) => item),
    })
  } catch (error) {
    console.error('Error recalculando consultoria fase 1:', error)
    return Response.json({ error: 'No se pudo recalcular la consultoria inteligente.' }, { status: 500 })
  }
}
