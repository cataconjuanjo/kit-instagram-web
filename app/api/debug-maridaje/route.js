/**
 * Endpoint temporal de diagnóstico — BORRAR después de resolver el bug
 */
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { analizarMaridaje, resumenAnalisisParaPrompt } from '../../lib/maridajeEngine'

export async function GET(request) {
  const results = {}

  // 1. Anthropic API key
  try {
    results.anthropic_key = process.env.ANTHROPIC_API_KEY ? 'SET (' + process.env.ANTHROPIC_API_KEY.slice(0, 8) + '...)' : 'MISSING'
  } catch (e) { results.anthropic_key = 'ERROR: ' + e.message }

  // 2. Supabase URL
  try {
    results.supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING'
    results.supabase_service_key = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'
  } catch (e) { results.supabase = 'ERROR: ' + e.message }

  // 3. Supabase query
  try {
    const { data, error } = await supabaseAdmin.from('restaurantes').select('id, slug, plan, subscription_status').limit(3)
    results.supabase_query = error ? 'ERROR: ' + error.message : 'OK'
    results.restaurantes = data
  } catch (e) { results.supabase_query = 'THROW: ' + e.message }

  // 4. Anthropic SDK init
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    results.anthropic_init = 'OK'
  } catch (e) { results.anthropic_init = 'THROW: ' + e.message }

  // 5. Anthropic API call (minimal)
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Di solo: OK' }],
    })
    results.anthropic_call = 'OK: ' + msg.content?.[0]?.text
  } catch (e) { results.anthropic_call = 'THROW: ' + e.message }

  // 6. maridajeEngine import
  try {
    const r = analizarMaridaje('merluza a la plancha', [])
    results.maridaje_engine = 'OK'
  } catch (e) { results.maridaje_engine = 'THROW: ' + e.message }

  // 7. chartierGraph dynamic import
  try {
    const mod = await import('../../lib/chartierGraph')
    results.chartier_graph_import = 'OK'
    try {
      const r = await mod.analizarConGrafo('merluza', [])
      results.chartier_graph_call = r ? 'OK' : 'returned null'
    } catch (e2) { results.chartier_graph_call = 'THROW: ' + e2.message }
  } catch (e) { results.chartier_graph_import = 'THROW: ' + e.message }

  return Response.json(results)
}
