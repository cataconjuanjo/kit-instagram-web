import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { registrarConsumoAnthropic } from '../../lib/anthropicUsage'
import { checkRateLimit, getClientIp } from '../../lib/security'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_BASE64_LENGTH = 4_500_000
const PER_IP_MAX   = 5
const PER_IP_WINDOW_MS = 60 * 60 * 1000         // 5 calls / IP / hour
const GLOBAL_DAILY_MAX = 500
const GLOBAL_DAILY_MS  = 24 * 60 * 60 * 1000    // hard ceiling: 500 calls / day total

export async function POST(req) {
  const { pdfBase64 } = await req.json()

  try {
    // Global daily cap — prevents distributed-IP abuse draining LLM budget
    const globalOk = await checkRateLimit('__global__', 'analisis-carta', {
      max: GLOBAL_DAILY_MAX,
      windowMs: GLOBAL_DAILY_MS,
    })
    if (!globalOk) {
      return Response.json({ analisis: null, error: 'Servicio temporalmente no disponible. Inténtalo mañana.' }, { status: 503 })
    }

    const allowed = await checkRateLimit(getClientIp(req), 'analisis-carta', {
      max: PER_IP_MAX,
      windowMs: PER_IP_WINDOW_MS,
    })
    if (!allowed) {
      return Response.json({ analisis: null, error: 'Demasiadas consultas. Prueba de nuevo en un rato.' }, { status: 429 })
    }

    if (!pdfBase64) {
      return Response.json({ analisis: null, error: 'Archivo no recibido' }, { status: 400 })
    }
    if (String(pdfBase64).length > MAX_BASE64_LENGTH) {
      return Response.json({ analisis: null, error: 'Archivo demasiado grande. Usa un PDF de hasta 3 MB.' }, { status: 413 })
    }

    const modelo = 'claude-sonnet-4-6'
    const message = await anthropic.messages.create({
      model: modelo,
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
    await registrarConsumoAnthropic({
      endpoint: 'analisis_carta_publico',
      modelo,
      usage: message.usage,
    })

    return Response.json({ analisis: message.content[0].text })
  } catch (e) {
    console.error(e)
    return Response.json({ analisis: null }, { status: 500 })
  }
}
