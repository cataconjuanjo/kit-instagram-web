import { supabaseAdmin } from '../../lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

async function comprobarBaseDatos() {
  const consulta = supabaseAdmin
    .from('restaurantes')
    .select('id', { count: 'exact', head: true })

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), 4500)
  })

  const { error, count } = await Promise.race([consulta, timeout])
  if (error) throw error
  return { status: 'ok', restaurantes: count || 0 }
}

export async function GET() {
  const startedAt = Date.now()
  const checks = {
    app: { status: 'ok' },
    database: { status: 'unknown' },
    ai: { status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing' },
    stripe: { status: process.env.STRIPE_SECRET_KEY ? 'configured' : 'missing' },
    email: { status: process.env.RESEND_API_KEY ? 'configured' : 'missing' },
  }

  try {
    checks.database = await comprobarBaseDatos()
  } catch (error) {
    checks.database = { status: 'error', reason: error?.message === 'timeout' ? 'timeout' : 'unavailable' }
  }

  const criticalOk = checks.database.status === 'ok'
  return Response.json({
    status: criticalOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    response_ms: Date.now() - startedAt,
    checks,
  }, {
    status: criticalOk ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
