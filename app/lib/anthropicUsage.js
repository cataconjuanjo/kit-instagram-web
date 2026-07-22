import { supabaseAdmin } from './supabaseAdmin'
import { planRestaurante } from './plans'

const PRECIOS_POR_MILLON = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

const MS_DIA = 24 * 60 * 60 * 1000
const ORIGENES_SIN_CUOTA = new Set(['restaurante_prueba', 'demo'])

export const CUOTAS_IA_POR_PLAN = {
  basic: { maxRequests: 60, maxCostUsd: 2 },
  pro: { maxRequests: 180, maxCostUsd: 8 },
  bodega: { maxRequests: 120, maxCostUsd: 6 },
  premium: { maxRequests: 600, maxCostUsd: 30 },
}

function preciosModelo(modelo = '') {
  return PRECIOS_POR_MILLON[modelo] || (modelo.includes('haiku')
    ? PRECIOS_POR_MILLON['claude-haiku-4-5']
    : PRECIOS_POR_MILLON['claude-sonnet-4-6'])
}

function cuotaPorPlan(restaurante) {
  return CUOTAS_IA_POR_PLAN[planRestaurante(restaurante)] || CUOTAS_IA_POR_PLAN.basic
}

function cuotaIaActiva() {
  return String(process.env.IA_QUOTA_ENABLED || 'true').toLowerCase() !== 'false'
}

function retryAfterDesdeConsumos(consumos = [], now = Date.now()) {
  const primero = consumos
    .map(item => new Date(item.created_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0]
  if (!primero) return 60 * 60
  return Math.max(15 * 60, Math.ceil((primero + MS_DIA - now) / 1000))
}

async function restauranteParaCuota(restauranteId, restaurante, supabase) {
  if (restaurante?.id || restaurante?.plan) return restaurante
  const { data, error } = await supabase
    .from('restaurantes')
    .select('id, plan, subscription_status')
    .eq('id', restauranteId)
    .single()
  if (error) {
    console.error('[consumos_ia:restaurante]', {
      restauranteId,
      code: error.code || '',
      message: error.message || '',
    })
  }
  return data || null
}

export function costeEstimadoAnthropic(modelo, usage = {}) {
  const precio = preciosModelo(modelo)
  const input = Number(usage.input_tokens) || 0
  const output = Number(usage.output_tokens) || 0
  const cacheCreation = Number(usage.cache_creation_input_tokens) || 0
  const cacheRead = Number(usage.cache_read_input_tokens) || 0

  return (
    input * precio.input +
    output * precio.output +
    cacheCreation * precio.input * 1.25 +
    cacheRead * precio.input * 0.1
  ) / 1_000_000
}

export async function comprobarCuotaIaRestaurante({
  restauranteId = null,
  restaurante = null,
  endpoint = '',
  origen = '',
  solicitudesEstimadas = 1,
  supabase = supabaseAdmin,
  now = new Date(),
} = {}) {
  if (!cuotaIaActiva() || !restauranteId || ORIGENES_SIN_CUOTA.has(origen)) {
    return { ok: true, skipped: true }
  }

  const restauranteCuota = await restauranteParaCuota(restauranteId, restaurante, supabase)
  const limite = cuotaPorPlan(restauranteCuota)
  const desde = new Date(now.getTime() - MS_DIA).toISOString()
  const solicitudes = Math.max(1, Math.ceil(Number(solicitudesEstimadas) || 1))

  const { data, count, error } = await supabase
    .from('consumos_ia')
    .select('coste_estimado_usd, created_at', { count: 'exact' })
    .eq('restaurante_id', restauranteId)
    .gte('created_at', desde)
    .order('created_at', { ascending: true })
    .limit(Math.max(limite.maxRequests, 1000))

  if (error) {
    console.error('[consumos_ia:cuota]', {
      restauranteId,
      endpoint,
      code: error.code || '',
      message: error.message || '',
    })
    return { ok: true, skipped: true, reason: 'quota_read_error' }
  }

  const consumos = data || []
  const requestsUsadas = count || consumos.length
  const costeUsadoUsd = consumos.reduce((total, item) => (
    total + (Number(item.coste_estimado_usd) || 0)
  ), 0)
  const excedeSolicitudes = requestsUsadas + solicitudes > limite.maxRequests
  const excedeCoste = costeUsadoUsd >= limite.maxCostUsd

  if (!excedeSolicitudes && !excedeCoste) {
    return {
      ok: true,
      plan: planRestaurante(restauranteCuota),
      limite,
      requestsUsadas,
      costeUsadoUsd,
    }
  }

  console.warn('[consumos_ia:cuota_agotada]', {
    restauranteId,
    endpoint,
    plan: planRestaurante(restauranteCuota),
    requestsUsadas,
    costeUsadoUsd,
    solicitudes,
  })

  return {
    ok: false,
    reason: excedeCoste ? 'cost_limit' : 'request_limit',
    plan: planRestaurante(restauranteCuota),
    limite,
    requestsUsadas,
    costeUsadoUsd,
    retryAfterSeconds: retryAfterDesdeConsumos(consumos, now.getTime()),
  }
}

export function responderCuotaIaAgotada(resultado = {}) {
  return Response.json(
    {
      error: 'Limite diario de IA alcanzado para este restaurante. Prueba de nuevo manana o contacta para ampliar el plan.',
      quota_exceeded: true,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(resultado.retryAfterSeconds || 60 * 60) },
    }
  )
}

export async function registrarConsumoAnthropic({
  restauranteId = null,
  endpoint,
  modelo,
  usage,
  metadata = {},
}) {
  if (!usage || !endpoint || !modelo) return

  const registro = {
    restaurante_id: restauranteId || null,
    endpoint,
    modelo,
    input_tokens: Number(usage.input_tokens) || 0,
    output_tokens: Number(usage.output_tokens) || 0,
    cache_creation_input_tokens: Number(usage.cache_creation_input_tokens) || 0,
    cache_read_input_tokens: Number(usage.cache_read_input_tokens) || 0,
    coste_estimado_usd: costeEstimadoAnthropic(modelo, usage),
    metadata,
  }

  const { error } = await supabaseAdmin.from('consumos_ia').insert(registro)
  if (error) console.error('[consumos_ia]', error.message)
}
