import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import {
  ECONOMIC_TRACE_FORMULA_VERSION,
  generarTrazabilidadEconomica,
  normalizarAjustesEconomicos,
} from '../../lib/economicTraceability'

function texto(valor, limite = 240) {
  return String(valor || '').trim().slice(0, limite)
}

function esTablaNoExiste(error) {
  return error?.code === 'PGRST205' || /Could not find the table|relation .* does not exist/i.test(error?.message || '')
}

function esColumnaNoExiste(error) {
  return error?.code === 'PGRST204' || /Could not find.*column|column .* does not exist/i.test(error?.message || '')
}

async function optionalQuery(nombre, query, fallback = []) {
  const { data, error } = await query
  if (!error) return { data: data || fallback, pending: [] }
  if (esTablaNoExiste(error) || esColumnaNoExiste(error)) return { data: fallback, pending: [nombre] }
  throw error
}

async function cargarSettings(restauranteId) {
  const { data, error } = await supabaseAdmin
    .from('restaurant_economic_settings')
    .select('*')
    .eq('restaurante_id', restauranteId)
    .maybeSingle()

  if (!error) return { settings: data || null, persistidos: Boolean(data), pending: [] }
  if (esTablaNoExiste(error) || esColumnaNoExiste(error)) return { settings: null, persistidos: false, pending: ['restaurant_economic_settings'] }
  throw error
}

async function cargarBase(restauranteId) {
  const settingsRes = await cargarSettings(restauranteId)
  const [
    restauranteRes,
    vinosRes,
    exposicionesRes,
    outcomesRes,
    posLinesRes,
    escenariosRes,
    radarRes,
    reportsRes,
  ] = await Promise.all([
    optionalQuery(
      'restaurantes',
      supabaseAdmin.from('restaurantes').select('*').eq('id', restauranteId).single(),
      null
    ),
    optionalQuery(
      'vinos',
      supabaseAdmin
        .from('vinos')
        .select('id, nombre, bodega, precio_botella, precio_copa, coste_compra, stock, stock_minimo, activo')
        .eq('restaurante_id', restauranteId),
      []
    ),
    optionalQuery(
      'recommendation_exposures',
      supabaseAdmin
        .from('recommendation_exposures')
        .select('*')
        .eq('restaurante_id', restauranteId)
        .order('created_at', { ascending: false })
        .limit(600),
      []
    ),
    optionalQuery(
      'recommendation_outcomes',
      supabaseAdmin
        .from('recommendation_outcomes')
        .select('*')
        .eq('restaurante_id', restauranteId)
        .order('created_at', { ascending: false })
        .limit(600),
      []
    ),
    optionalQuery(
      'pos_sale_lines',
      supabaseAdmin
        .from('pos_sale_lines')
        .select('*')
        .eq('restaurante_id', restauranteId)
        .order('fecha', { ascending: false })
        .limit(600),
      []
    ),
    optionalQuery(
      'profit_scenarios',
      supabaseAdmin
        .from('profit_scenarios')
        .select('*, items:profit_scenario_items(*)')
        .eq('restaurante_id', restauranteId)
        .order('created_at', { ascending: false })
        .limit(40),
      []
    ),
    optionalQuery(
      'daily_radar_actions',
      supabaseAdmin
        .from('daily_radar_actions')
        .select('*')
        .eq('restaurante_id', restauranteId)
        .order('created_at', { ascending: false })
        .limit(120),
      []
    ),
    optionalQuery(
      'economic_trace_reports',
      supabaseAdmin
        .from('economic_trace_reports')
        .select('*')
        .eq('restaurante_id', restauranteId)
        .order('created_at', { ascending: false })
        .limit(12),
      []
    ),
  ])

  const pending = [
    ...settingsRes.pending,
    ...restauranteRes.pending,
    ...vinosRes.pending,
    ...exposicionesRes.pending,
    ...outcomesRes.pending,
    ...posLinesRes.pending,
    ...escenariosRes.pending,
    ...radarRes.pending,
    ...reportsRes.pending,
  ]

  const settings = normalizarAjustesEconomicos(settingsRes.settings || {})
  const trazabilidad = generarTrazabilidadEconomica({
    restaurante: restauranteRes.data || { id: restauranteId },
    settings,
    settingsPersistidos: settingsRes.persistidos,
    vinos: vinosRes.data || [],
    exposiciones: exposicionesRes.data || [],
    outcomes: outcomesRes.data || [],
    posLines: posLinesRes.data || [],
    escenarios: escenariosRes.data || [],
    radarActions: radarRes.data || [],
    reports: reportsRes.data || [],
    migrationPending: [...new Set(pending)],
  })

  return {
    restaurante: restauranteRes.data || null,
    settings,
    settingsPersistidos: settingsRes.persistidos,
    trazabilidad,
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const data = await cargarBase(restauranteId)
    return Response.json(data)
  } catch (error) {
    console.error('[economic-traceability] GET:', error)
    return Response.json({ error: 'No se pudo cargar la trazabilidad economica.' }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const settings = {
      restaurante_id: restauranteId,
      ...normalizarAjustesEconomicos(body.settings || body),
      formula_version: ECONOMIC_TRACE_FORMULA_VERSION,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabaseAdmin
      .from('restaurant_economic_settings')
      .upsert(settings, { onConflict: 'restaurante_id' })
      .select('*')
      .single()

    if (error) {
      if (esTablaNoExiste(error) || esColumnaNoExiste(error)) {
        return Response.json({ error: 'La base de datos aun no permite guardar la auditoria economica.' }, { status: 409 })
      }
      throw error
    }

    const base = await cargarBase(restauranteId)
    return Response.json({ settings: data, ...base })
  } catch (error) {
    console.error('[economic-traceability] PATCH:', error)
    return Response.json({ error: 'No se pudieron guardar los ajustes economicos.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const base = await cargarBase(restauranteId)
    const trace = base.trazabilidad
    const now = new Date().toISOString()
    const report = {
      restaurante_id: restauranteId,
      periodo_inicio: body.periodo_inicio || null,
      periodo_fin: body.periodo_fin || now,
      formula_version: ECONOMIC_TRACE_FORMULA_VERSION,
      generated_by: auth.user.id,
      generated_by_email: (auth.user.email || '').toLowerCase(),
      settings_snapshot: trace.settings,
      resumen: trace.resumen,
      fuentes: trace.fuentes,
      advertencias: trace.advertencias,
      cambios_snapshot: trace.cambios_snapshot,
      metadata: {
        ...trace.metadata,
        defensa_cifras: trace.defensa_cifras || [],
      },
    }

    const { data, error } = await supabaseAdmin
      .from('economic_trace_reports')
      .insert(report)
      .select('*')
      .single()

    if (error) {
      if (esTablaNoExiste(error) || esColumnaNoExiste(error)) {
        return Response.json({ error: 'La base de datos aun no permite guardar la auditoria economica.' }, { status: 409 })
      }
      throw error
    }

    const siguiente = await cargarBase(restauranteId)
    return Response.json({ report: data, ...siguiente })
  } catch (error) {
    console.error('[economic-traceability] POST:', error)
    return Response.json({ error: 'No se pudo guardar la foto de trazabilidad.' }, { status: 500 })
  }
}
