import { supabaseAdmin } from './supabaseAdmin'

const PRECIOS_POR_MILLON = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

function preciosModelo(modelo = '') {
  return PRECIOS_POR_MILLON[modelo] || (modelo.includes('haiku')
    ? PRECIOS_POR_MILLON['claude-haiku-4-5']
    : PRECIOS_POR_MILLON['claude-sonnet-4-6'])
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
