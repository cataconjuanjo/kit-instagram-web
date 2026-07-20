import { supabaseAdmin } from '../../../lib/supabaseAdmin'

const ALLOWED_EVENTS = new Set([
  'demo_page_view',
  'demo_start',
  'demo_role_open',
  'demo_contact_click',
  'demo_landing_click',
])

const ALLOWED_DEMOS = new Set(['taberna-del-puerto', 'sumiller'])
const ALLOWED_ROLES = new Set(['', 'cliente', 'camarero', 'gerente', 'contacto', 'landing'])

function text(value, max = 160) {
  return String(value || '').slice(0, max)
}

function deviceClass(userAgent = '') {
  const ua = String(userAgent).toLowerCase()
  if (/ipad|tablet/.test(ua)) return 'tablet'
  if (/mobile|iphone|android/.test(ua)) return 'mobile'
  if (ua) return 'desktop'
  return 'unknown'
}

function isMissingTable(error) {
  return error?.code === 'PGRST205'
    || error?.code === '42P01'
    || /demo_analytics_events/i.test(error?.message || '')
}

export async function POST(request) {
  try {
    const body = await request.json()
    if (body?.consent !== 'accepted') {
      return Response.json({ ok: true, ignored: true }, { status: 202 })
    }

    const event = text(body.event, 80)
    const demo = text(body.demo || 'taberna-del-puerto', 80)
    const role = text(body.role, 40)

    if (!ALLOWED_EVENTS.has(event) || !ALLOWED_DEMOS.has(demo) || !ALLOWED_ROLES.has(role)) {
      return Response.json({ ok: true, ignored: true }, { status: 202 })
    }

    const payload = {
      event,
      demo,
      role,
      target: text(body.target, 180),
      source: text(body.source, 80),
      path: text(body.path, 180),
      device_class: deviceClass(request.headers.get('user-agent')),
    }

    const { error } = await supabaseAdmin
      .from('demo_analytics_events')
      .insert(payload)
    if (error) {
      if (isMissingTable(error)) {
        console.info('[demo-analytics:migration-pending]', JSON.stringify(payload))
        return Response.json({ ok: true, stored: false, migration_pending: true }, { status: 202 })
      }
      console.error('[demo-analytics:storage-error]', error)
      return Response.json({ ok: true, stored: false }, { status: 202 })
    }

    return Response.json({ ok: true, stored: true }, { status: 202 })
  } catch (error) {
    console.error('[demo-analytics:error]', error)
    return Response.json({ ok: true, ignored: true }, { status: 202 })
  }
}
