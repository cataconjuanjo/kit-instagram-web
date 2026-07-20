import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const TEMPLATE_IDS = new Set(['lanzamiento', 'temporada', 'degustacion', 'premium', 'evento'])

function texto(valor, limite = 240) {
  return String(valor || '').trim().slice(0, limite)
}

function errorIncluye(error, textoBuscado) {
  return [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ').toLowerCase().includes(textoBuscado)
}

function experienciaPendiente(error) {
  return errorIncluye(error, 'experience_activation_plans') ||
    errorIncluye(error, 'schema cache') ||
    ['42P01', 'PGRST204', 'PGRST205'].includes(String(error?.code || ''))
}

function normalizarTemplateId(valor) {
  const id = texto(valor, 40)
  return TEMPLATE_IDS.has(id) ? id : ''
}

function normalizarCompletedSteps(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  return Object.fromEntries(
    Object.entries(valor)
      .map(([key, done]) => [texto(key, 160), Boolean(done)])
      .filter(([key]) => key),
  )
}

function normalizarFecha(valor) {
  const fecha = texto(valor, 20)
  if (!fecha) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null
}

function normalizarPlan(plan = {}) {
  return {
    id: plan.id,
    restaurante_id: plan.restaurante_id,
    template_id: plan.template_id,
    is_active: Boolean(plan.is_active),
    completed_steps: plan.completed_steps || {},
    objective_date: plan.objective_date || '',
    responsible: plan.responsible || '',
    notes: plan.notes || '',
    actor_email: plan.actor_email || '',
    created_at: plan.created_at,
    updated_at: plan.updated_at,
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data, error } = await supabaseAdmin
      .from('experience_activation_plans')
      .select('id, restaurante_id, template_id, is_active, completed_steps, objective_date, responsible, notes, actor_email, created_at, updated_at')
      .eq('restaurante_id', restauranteId)
      .order('updated_at', { ascending: false })

    if (experienciaPendiente(error)) {
      return Response.json({
        plans: [],
        active_plan: null,
        experience_pending: true,
        sql: 'supabase/add_experience_activation_plans.sql',
      })
    }
    if (error) throw error

    const plans = (data || []).map(normalizarPlan)
    return Response.json({
      plans,
      active_plan: plans.find(plan => plan.is_active) || null,
      experience_pending: false,
      sql: null,
    })
  } catch (error) {
    console.error('[experiencias:get]', error)
    return Response.json({ error: 'No se pudo cargar el plan de experiencia.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const templateId = normalizarTemplateId(body.template_id)
    if (!templateId) return Response.json({ error: 'Plantilla no valida.' }, { status: 400 })

    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    if (body.is_active !== false) {
      const { error: clearError } = await supabaseAdmin
        .from('experience_activation_plans')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('restaurante_id', restauranteId)
        .neq('template_id', templateId)

      if (experienciaPendiente(clearError)) {
        return Response.json({
          ok: true,
          plan: null,
          experience_pending: true,
          sql: 'supabase/add_experience_activation_plans.sql',
        })
      }
      if (clearError) throw clearError
    }

    const payload = {
      restaurante_id: restauranteId,
      template_id: templateId,
      is_active: body.is_active !== false,
      completed_steps: normalizarCompletedSteps(body.completed_steps),
      objective_date: normalizarFecha(body.objective_date),
      responsible: texto(body.responsible, 120) || null,
      notes: texto(body.notes, 1200) || null,
      actor_id: auth.user.id,
      actor_email: (auth.user.email || '').toLowerCase(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabaseAdmin
      .from('experience_activation_plans')
      .upsert(payload, { onConflict: 'restaurante_id,template_id' })
      .select('id, restaurante_id, template_id, is_active, completed_steps, objective_date, responsible, notes, actor_email, created_at, updated_at')
      .single()

    if (experienciaPendiente(error)) {
      return Response.json({
        ok: true,
        plan: null,
        experience_pending: true,
        sql: 'supabase/add_experience_activation_plans.sql',
      })
    }
    if (error) throw error

    return Response.json({
      ok: true,
      plan: normalizarPlan(data),
      experience_pending: false,
      sql: null,
    })
  } catch (error) {
    console.error('[experiencias:post]', error)
    return Response.json({ error: 'No se pudo guardar el plan de experiencia.' }, { status: 500 })
  }
}
