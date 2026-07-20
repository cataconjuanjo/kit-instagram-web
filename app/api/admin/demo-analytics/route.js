import { getUserFromRequest } from '../../_lib/auth'
import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

function sinceIso(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function isMissingTable(error) {
  return error?.code === 'PGRST205'
    || error?.code === '42P01'
    || /demo_analytics_events/i.test(error?.message || '')
}

function dayKey(value) {
  return new Date(value || Date.now()).toISOString().slice(0, 10)
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'sin_dato'
    acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
}

function buildFunnel(events = []) {
  const counts = countBy(events, 'event')
  const roleEvents = events.filter(item => item.event === 'demo_role_open' || item.event === 'demo_start')
  const byRole = roleEvents.reduce((acc, item) => {
    const role = item.role || 'inicio'
    acc[role] = (acc[role] || 0) + 1
    return acc
  }, {})
  const daily = events.reduce((acc, item) => {
    const key = dayKey(item.created_at)
    if (!acc[key]) acc[key] = { date: key, total: 0, starts: 0, roles: 0, contact: 0 }
    acc[key].total += 1
    if (item.event === 'demo_start') acc[key].starts += 1
    if (item.event === 'demo_role_open') acc[key].roles += 1
    if (item.event === 'demo_contact_click') acc[key].contact += 1
    return acc
  }, {})

  return {
    total: events.length,
    page_views: counts.demo_page_view || 0,
    landing_clicks: counts.demo_landing_click || 0,
    starts: counts.demo_start || 0,
    role_opens: counts.demo_role_open || 0,
    contact_clicks: counts.demo_contact_click || 0,
    by_role: byRole,
    by_device: countBy(events, 'device_class'),
    by_source: countBy(events, 'source'),
    daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    recent: events.slice(0, 30),
  }
}

export async function GET(req) {
  try {
    const auth = await getUserFromRequest(req)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    if ((auth.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
      return Response.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const demo = searchParams.get('demo') || 'taberna-del-puerto'
    const days = Math.min(90, Math.max(1, Number(searchParams.get('days')) || 30))

    const { data, error } = await supabaseAdmin
      .from('demo_analytics_events')
      .select('id, event, demo, role, source, target, path, device_class, created_at')
      .eq('demo', demo)
      .gte('created_at', sinceIso(days))
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) {
      if (isMissingTable(error)) {
        return Response.json({
          migration_pending: true,
          sql: 'supabase/add_demo_analytics.sql',
          funnel: buildFunnel([]),
        })
      }
      throw error
    }

    return Response.json({
      migration_pending: false,
      demo,
      days,
      funnel: buildFunnel(data || []),
    })
  } catch (error) {
    console.error('Error cargando analitica de demo:', error)
    return Response.json({ error: 'No se pudo cargar la analitica de demo.' }, { status: 500 })
  }
}
