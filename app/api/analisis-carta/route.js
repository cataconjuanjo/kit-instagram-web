import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_BASE64_LENGTH = 4_500_000
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60 * 60 * 1000

function getIP(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
  )
}

async function checkRateLimit(ip) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', 'analisis-carta')
    .gte('created_at', since)

  if ((count || 0) >= RATE_LIMIT) return false

  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint: 'analisis-carta' })
  return true
}

export async function POST(req) {
  const { pdfBase64 } = await req.json()

  try {
    const allowed = await checkRateLimit(getIP(req))
    if (!allowed) {
      return Response.json({ analisis: null, error: 'Demasiadas consultas. Prueba de nuevo en un rato.' }, { status: 429 })
    }

    if (!pdfBase64) {
      return Response.json({ analisis: null, error: 'Archivo no recibido' }, { status: 400 })
    }
    if (String(pdfBase64).length > MAX_BASE64_LENGTH) {
      return Response.json({ analisis: null, error: 'Archivo demasiado grande. Usa un PDF de hasta 3 MB.' }, { status: 413 })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: 'Eres un experto en cartas de vinos con certificación WSET Level 3. Analizas cartas de restaurantes y das diagnósticos concretos y accionables. Respondes en texto plano corrido, sin asteriscos, sin markdown, sin listas con guiones. Usas párrafos cortos y directos.',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64
            }
          },
          {
            type: 'text',
            text: `Analiza esta carta de vinos de un restaurante español y da un diagnóstico profesional en 3 párrafos:

1. El punto fuerte de la carta — qué está bien estructurado, qué destaca positivamente.
2. El punto débil más importante — qué falta, qué está desequilibrado o qué podría mejorar.
3. Una recomendación concreta y accionable de mejora.

Sé directo, específico y usa los vinos reales de la carta en tu análisis. No uses listas, escribe en párrafos corridos.`
          }
        ]
      }]
    })

    return Response.json({ analisis: message.content[0].text })
  } catch (e) {
    console.error(e)
    return Response.json({ analisis: null }, { status: 500 })
  }
}
