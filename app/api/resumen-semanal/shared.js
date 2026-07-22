import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import {
  generarResumenSemanalEjecutivo,
  periodoSemanalEjecutivo,
} from '../../lib/weeklyExecutiveSummary'
import { normalizarPreferenciasResumen } from '../../lib/weeklySummaryDelivery'

export const SELECT_RESTAURANTE_RESUMEN = 'id, nombre, email, slug, actividad_real_desde, created_at'
const SELECT_WEEKLY_SUMMARY_PREFERENCES = [
  'id', 'restaurante_id', 'enabled', 'channel', 'recipient_email',
  'cc_email', 'send_day', 'send_hour', 'timezone', 'last_sent_at',
  'last_error', 'created_at', 'updated_at',
].join(', ')
const SELECT_WEEKLY_SUMMARY_SAVED = [
  'id', 'restaurante_id', 'periodo_key', 'periodo_inicio', 'periodo_fin',
  'formula_version', 'titular', 'confianza', 'resumen', 'kpis', 'ganado',
  'pendiente', 'decisiones', 'senales', 'copy_text', 'metadata',
  'generated_by_email', 'generated_at', 'sent_at', 'sent_channel',
  'created_at', 'updated_at',
].join(', ')
const SELECT_WEEKLY_SUMMARY_DELIVERY = [
  SELECT_WEEKLY_SUMMARY_SAVED,
  'delivery_status', 'delivery_channel', 'recipient_email', 'delivery_error',
  'last_send_attempt_at', 'provider_message_id',
].join(', ')
const SELECT_VINO_RESUMEN = 'id, nombre, activo, precio_botella, precio_copa, coste_compra, stock, stock_minimo'
const SELECT_DAILY_RADAR_RESUMEN = [
  'id', 'restaurante_id', 'fecha_operativa', 'clave', 'area', 'titulo',
  'detalle', 'accion', 'href', 'prioridad', 'estado', 'created_at',
  'updated_at',
].join(', ')
const SELECT_PROFIT_SCENARIO_RESUMEN = 'id, restaurante_id, nombre, impacto_margen, estado, created_at'
const SELECT_POS_LINE_RESUMEN = 'id, restaurante_id, vino_id, fecha, created_at'
const SELECT_POS_LINE_RESUMEN_DUPLICADA = 'id, restaurante_id, vino_id, fecha, duplicada, created_at'

export function esTablaNoExiste(error) {
  return error?.code === 'PGRST205' || /Could not find the table/i.test(error?.message || '')
}

export function esEsquemaNoExiste(error) {
  return esTablaNoExiste(error) ||
    error?.code === 'PGRST204' ||
    /Could not find .* column/i.test(error?.message || '') ||
    /schema cache/i.test(error?.message || '')
}

export async function leerOpcional(nombre, query) {
  const { data, error } = await query
  if (error) {
    if (esEsquemaNoExiste(error)) return { data: [], pending: nombre }
    throw error
  }
  return { data: data || [], pending: null }
}

export function periodoKey(periodoInicio, periodoFin) {
  return `${String(periodoInicio || '').slice(0, 10)}_${String(periodoFin || '').slice(0, 10)}`
}

function normalizarDias(searchParams) {
  return Math.min(31, Math.max(1, Number(searchParams.get('dias') || 7)))
}

export function resolverPeriodo(searchParams) {
  const dias = normalizarDias(searchParams)
  const periodoBase = periodoSemanalEjecutivo({ dias })
  const periodoInicio = searchParams.get('desde') || periodoBase.inicio
  const periodoFin = searchParams.get('hasta') || periodoBase.fin
  return {
    dias,
    periodoInicio,
    periodoFin,
    fechaInicio: periodoInicio.slice(0, 10),
    fechaFin: periodoFin.slice(0, 10),
    key: periodoKey(periodoInicio, periodoFin),
  }
}

export async function resolverRestaurante(req, restauranteId) {
  const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
  if (auth.error) return auth

  let query = supabaseAdmin.from('restaurantes').select(SELECT_RESTAURANTE_RESUMEN)
  if (restauranteId) query = query.eq('id', restauranteId)
  else query = query.eq('email', auth.user.email)

  const { data, error } = await query.single()
  if (error || !data) return { error: 'Restaurante no encontrado', status: 404 }
  return { restaurante: data, user: auth.user }
}

export async function leerPreferenciasResumen(restaurante) {
  const { data, error } = await supabaseAdmin
    .from('weekly_summary_preferences')
    .select(SELECT_WEEKLY_SUMMARY_PREFERENCES)
    .eq('restaurante_id', restaurante.id)
    .maybeSingle()

  if (error) {
    if (esEsquemaNoExiste(error)) {
      return {
        preferencias: normalizarPreferenciasResumen({}, restaurante),
        guardada: false,
        pending: 'weekly_summary_preferences',
      }
    }
    throw error
  }

  return {
    preferencias: normalizarPreferenciasResumen(data || {}, restaurante),
    guardada: Boolean(data),
    pending: null,
  }
}

export async function guardarPreferenciasResumen({ restaurante, preferencias }) {
  const normalizadas = normalizarPreferenciasResumen(preferencias || {}, restaurante)
  const now = new Date().toISOString()
  const payload = {
    restaurante_id: restaurante.id,
    enabled: normalizadas.enabled,
    channel: normalizadas.channel,
    recipient_email: normalizadas.recipient_email || null,
    cc_email: normalizadas.cc_email || null,
    send_day: normalizadas.send_day,
    send_hour: normalizadas.send_hour,
    timezone: normalizadas.timezone,
    updated_at: now,
  }

  const { data, error } = await supabaseAdmin
    .from('weekly_summary_preferences')
    .upsert(payload, { onConflict: 'restaurante_id' })
    .select(SELECT_WEEKLY_SUMMARY_PREFERENCES)
    .single()

  if (error) {
    if (esEsquemaNoExiste(error)) return { preferencias: normalizadas, data: null, pending: 'weekly_summary_preferences' }
    throw error
  }

  return {
    preferencias: normalizarPreferenciasResumen(data || normalizadas, restaurante),
    data,
    pending: null,
  }
}

function entregaDesdeFila(fila) {
  if (!fila) return null
  return {
    status: fila.delivery_status || (fila.sent_at ? 'sent' : 'draft'),
    channel: fila.delivery_channel || fila.sent_channel || null,
    recipient_email: fila.recipient_email || null,
    error: fila.delivery_error || null,
    last_attempt_at: fila.last_send_attempt_at || null,
    provider_message_id: fila.provider_message_id || null,
    sent_at: fila.sent_at || null,
    sent_channel: fila.sent_channel || null,
  }
}

export function filaAResumenGuardado(fila) {
  if (!fila) return null
  const resumen = fila.resumen && typeof fila.resumen === 'object' ? fila.resumen : {}
  const entrega = entregaDesdeFila(fila)
  return {
    ...resumen,
    persistencia: {
      guardado: true,
      id: fila.id,
      periodo_key: fila.periodo_key,
      generated_at: fila.generated_at,
      updated_at: fila.updated_at,
      sent_at: fila.sent_at || null,
      sent_channel: fila.sent_channel || null,
      delivery_status: entrega?.status || 'draft',
      delivery_channel: entrega?.channel || null,
    },
    delivery: {
      ...(resumen.delivery || {}),
      ...entrega,
    },
  }
}

function resumenHistorico(fila) {
  const resumen = filaAResumenGuardado(fila)
  if (!resumen) return null
  return {
    id: fila.id,
    periodo_key: fila.periodo_key,
    periodo_inicio: fila.periodo_inicio,
    periodo_fin: fila.periodo_fin,
    titular: fila.titular || resumen.titular,
    confianza: fila.confianza || resumen.confianza,
    beneficio_bruto: Number(fila.kpis?.beneficio_bruto || resumen.kpis?.beneficio_bruto || 0),
    recuperable_semana: Number(fila.kpis?.recuperable_semana || resumen.kpis?.recuperable_semana || 0),
    oportunidad_anual: Number(fila.kpis?.oportunidad_anual || resumen.kpis?.oportunidad_anual || 0),
    decisiones: Array.isArray(fila.decisiones) ? fila.decisiones.length : (resumen.decisiones?.length || 0),
    updated_at: fila.updated_at,
  }
}

function delta(actual, anterior, campo) {
  return Number(actual?.kpis?.[campo] || 0) - Number(anterior?.kpis?.[campo] || 0)
}

export function compararResumenes(actual, anterior) {
  if (!actual || !anterior) return null
  return {
    periodo_anterior: anterior.rango || null,
    beneficio_bruto_delta: Math.round(delta(actual, anterior, 'beneficio_bruto') * 100) / 100,
    recuperable_semana_delta: Math.round(delta(actual, anterior, 'recuperable_semana') * 100) / 100,
    oportunidad_anual_delta: Math.round(delta(actual, anterior, 'oportunidad_anual') * 100) / 100,
    ventas_kpi_delta: Math.round(delta(actual, anterior, 'ventas_kpi') * 100) / 100,
    conversion_recomendacion_delta: Math.round(delta(actual, anterior, 'conversion_recomendacion_pct') * 100) / 100,
  }
}

export async function leerHistorialSemanal(restauranteId, periodoActualKey) {
  const res = await leerOpcional(
    'weekly_executive_summaries',
    supabaseAdmin
      .from('weekly_executive_summaries')
      .select(SELECT_WEEKLY_SUMMARY_SAVED)
      .eq('restaurante_id', restauranteId)
      .order('periodo_inicio', { ascending: false })
      .limit(8)
  )
  if (res.pending) return { actualGuardado: null, anterior: null, historico: [], pending: res.pending }

  const filas = res.data || []
  const actualGuardado = filas.find(item => item.periodo_key === periodoActualKey) || null
  const anterior = filas.find(item => item.periodo_key !== periodoActualKey) || null
  return {
    actualGuardado: filaAResumenGuardado(actualGuardado),
    anterior: filaAResumenGuardado(anterior),
    historico: filas.map(resumenHistorico).filter(Boolean),
    pending: null,
  }
}

async function leerPosLinesResumen(restauranteId, periodo) {
  const query = (select) => supabaseAdmin
    .from('pos_sale_lines')
    .select(select)
    .eq('restaurante_id', restauranteId)
    .gte('fecha', periodo.fechaInicio)
    .lte('fecha', periodo.fechaFin)

  const conDuplicada = await leerOpcional(
    'pos_sale_lines',
    query(SELECT_POS_LINE_RESUMEN_DUPLICADA)
  )
  if (!conDuplicada.pending) return conDuplicada

  const base = await leerOpcional('pos_sale_lines', query(SELECT_POS_LINE_RESUMEN))
  return {
    ...base,
    data: (base.data || []).map(item => ({ ...item, duplicada: false })),
  }
}

export async function calcularResumenSemanal({ restaurante, periodo, user = null }) {
  const [
    vinosRes,
    statsRes,
    radarRes,
    escenariosRes,
    posLinesRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('vinos')
      .select(SELECT_VINO_RESUMEN)
      .eq('restaurante_id', restaurante.id),
    supabaseAdmin
      .from('estadisticas')
      .select('id, tipo, detalle, created_at')
      .eq('restaurante_id', restaurante.id)
      .gte('created_at', periodo.periodoInicio)
      .lte('created_at', periodo.periodoFin)
      .order('created_at', { ascending: false }),
    leerOpcional(
      'daily_radar_actions',
      supabaseAdmin
        .from('daily_radar_actions')
        .select(SELECT_DAILY_RADAR_RESUMEN)
        .eq('restaurante_id', restaurante.id)
        .gte('fecha_operativa', periodo.fechaInicio)
        .lte('fecha_operativa', periodo.fechaFin)
        .order('fecha_operativa', { ascending: false })
    ),
    leerOpcional(
      'profit_scenarios',
      supabaseAdmin
        .from('profit_scenarios')
        .select(SELECT_PROFIT_SCENARIO_RESUMEN)
        .eq('restaurante_id', restaurante.id)
        .neq('estado', 'descartado')
        .order('created_at', { ascending: false })
        .limit(20)
    ),
    leerPosLinesResumen(restaurante.id, periodo),
  ])

  if (vinosRes.error) throw vinosRes.error
  if (statsRes.error) throw statsRes.error

  const migrationPending = [
    radarRes.pending,
    escenariosRes.pending,
    posLinesRes.pending,
  ].filter(Boolean)

  const resumenBase = generarResumenSemanalEjecutivo({
    restaurante,
    periodoInicio: periodo.periodoInicio,
    periodoFin: periodo.periodoFin,
    vinos: vinosRes.data || [],
    stats: statsRes.data || [],
    radarActions: radarRes.data || [],
    escenarios: escenariosRes.data || [],
    posLines: posLinesRes.data || [],
  })

  const historial = await leerHistorialSemanal(restaurante.id, periodo.key)
  if (historial.pending) migrationPending.push(historial.pending)
  const preferenciasRes = await leerPreferenciasResumen(restaurante)
  if (preferenciasRes.pending) migrationPending.push(preferenciasRes.pending)

  const anterior = historial.anterior
  const comparacion = compararResumenes(resumenBase, anterior)
  const actualGuardado = historial.actualGuardado
  const entregaGuardada = actualGuardado?.delivery || {}

  return {
    resumen: {
      ...resumenBase,
      rango: {
        ...resumenBase.rango,
        label: `Ultimos ${periodo.dias} dias`,
      },
      comparacion,
      historico: historial.historico,
      persistencia: actualGuardado?.persistencia || {
        guardado: false,
        periodo_key: periodo.key,
      },
      delivery: {
        status: entregaGuardada.status || 'draft',
        channel: entregaGuardada.channel || preferenciasRes.preferencias.channel,
        recipient_email: entregaGuardada.recipient_email || preferenciasRes.preferencias.recipient_email || null,
        error: entregaGuardada.error || null,
        last_attempt_at: entregaGuardada.last_attempt_at || null,
        provider_message_id: entregaGuardada.provider_message_id || null,
        sent_at: entregaGuardada.sent_at || null,
        sent_channel: entregaGuardada.sent_channel || null,
        preferencias: preferenciasRes.preferencias,
      },
      metadata: {
        ...resumenBase.metadata,
        generated_by_email: user?.email || null,
        migration_pending: migrationPending,
      },
    },
    anterior,
    migrationPending,
  }
}

function payloadResumen(resumen, user = null) {
  const now = new Date().toISOString()
  return {
    restaurante_id: resumen.restaurante_id,
    periodo_key: periodoKey(resumen.rango?.inicio, resumen.rango?.fin),
    periodo_inicio: resumen.rango?.inicio,
    periodo_fin: resumen.rango?.fin,
    formula_version: resumen.formula_version,
    titular: resumen.titular || '',
    confianza: resumen.confianza || 'baja',
    resumen,
    kpis: resumen.kpis || {},
    ganado: resumen.ganado || [],
    pendiente: resumen.pendiente || [],
    decisiones: resumen.decisiones || [],
    senales: resumen.senales || {},
    copy_text: resumen.copy_text || '',
    metadata: resumen.metadata || {},
    generated_by: user?.id || null,
    generated_by_email: user?.email || null,
    generated_at: resumen.generated_at || now,
    updated_at: now,
  }
}

export async function guardarResumenSemanal({ resumen, user = null }) {
  const payload = payloadResumen(resumen, user)
  const { data, error } = await supabaseAdmin
    .from('weekly_executive_summaries')
    .upsert(payload, { onConflict: 'restaurante_id,periodo_key' })
    .select(SELECT_WEEKLY_SUMMARY_SAVED)
    .single()

  if (error) {
    if (esTablaNoExiste(error)) return { data: null, pending: 'weekly_executive_summaries' }
    throw error
  }
  return { data, pending: null }
}

export async function actualizarEntregaResumen({ resumenId, restauranteId, delivery, preferencias }) {
  const now = new Date().toISOString()
  const status = delivery?.delivery_status || delivery?.status || 'pending'
  const channel = delivery?.channel || preferencias?.channel || null
  const recipientEmail = delivery?.recipient_email || preferencias?.recipient_email || null
  const payload = {
    delivery_status: status,
    delivery_channel: channel,
    recipient_email: recipientEmail,
    delivery_error: delivery?.error || null,
    last_send_attempt_at: now,
    provider_message_id: delivery?.provider_message_id || null,
  }

  if (status === 'sent') {
    payload.sent_at = delivery?.sent_at || now
    payload.sent_channel = channel
  }

  const { data, error } = await supabaseAdmin
    .from('weekly_executive_summaries')
    .update(payload)
    .eq('id', resumenId)
    .select(SELECT_WEEKLY_SUMMARY_DELIVERY)
    .single()

  if (error) {
    if (esEsquemaNoExiste(error)) return { data: null, pending: 'weekly_summary_delivery' }
    throw error
  }

  if (restauranteId) {
    const prefPayload = {
      last_error: delivery?.error || null,
      updated_at: now,
    }
    if (status === 'sent') prefPayload.last_sent_at = payload.sent_at || now
    const { error: prefError } = await supabaseAdmin
      .from('weekly_summary_preferences')
      .update(prefPayload)
      .eq('restaurante_id', restauranteId)
    if (prefError && !esTablaNoExiste(prefError)) throw prefError
  }

  return { data, pending: null }
}

export async function calcularYGuardarResumenSemanal({ restaurante, periodo, user = null }) {
  const calculado = await calcularResumenSemanal({ restaurante, periodo, user })
  const guardado = await guardarResumenSemanal({ resumen: calculado.resumen, user })
  const pending = [...calculado.migrationPending]
  if (guardado.pending) pending.push(guardado.pending)

  return {
    resumen: guardado.data
      ? {
          ...filaAResumenGuardado(guardado.data),
          comparacion: calculado.resumen.comparacion,
          historico: calculado.resumen.historico,
          metadata: {
            ...(filaAResumenGuardado(guardado.data)?.metadata || {}),
            migration_pending: pending,
          },
        }
      : {
          ...calculado.resumen,
          metadata: { ...calculado.resumen.metadata, migration_pending: pending },
        },
    guardado: guardado.data,
    migrationPending: pending,
  }
}
