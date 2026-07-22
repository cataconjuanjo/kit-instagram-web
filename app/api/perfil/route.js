import Anthropic from '@anthropic-ai/sdk'
import { registrarConsumoAnthropic } from '../../lib/anthropicUsage'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { origenConsumoCarta } from '../../lib/cartaPruebaToken'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const RATE_LIMIT = 40
const RATE_WINDOW_MS = 60 * 60 * 1000

function getIP(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '0.0.0.0'
}

async function checkRateLimit(ip) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', 'perfil')
    .gte('created_at', since)

  if ((count || 0) >= RATE_LIMIT) return false
  await supabaseAdmin.from('rate_limits').insert({ ip, endpoint: 'perfil' })
  return true
}

export async function POST(req) {
  const { nombre, tipo, region, uva, anada, restaurante_id, prueba_token } = await req.json()

  try {
    if (!String(nombre || '').trim() || String(nombre).length > 160 || !String(tipo || '').trim()) {
      return Response.json({ error: 'Datos de vino no válidos.' }, { status: 400 })
    }
    if (!await checkRateLimit(getIP(req))) {
      return Response.json({ error: 'Demasiadas consultas. Inténtalo de nuevo más tarde.' }, { status: 429 })
    }

    const modelo = 'claude-sonnet-4-6'
    const message = await anthropic.messages.create({
      model: modelo,
      max_tokens: 256,
      system: 'Eres un experto en vinos con conocimiento WSET Level 3. Respondes ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin explicaciones.',
      messages: [{
        role: 'user',
        content: `Eres un experto en vinos con certificación WSET Level 3. Analiza este vino y puntúa cada característica del 1 al 5 siendo MUY preciso y diferenciador. Usa el rango completo: 1=muy bajo, 2=bajo, 3=medio, 4=alto, 5=muy alto.

Vino: ${nombre}
Tipo: ${tipo}
Región: ${region || 'desconocida'}
Uva: ${uva || 'desconocida'}
Añada: ${anada || 'desconocida'}

Instrucciones importantes:
- Un vino joven de Jumilla tendrá taninos diferentes a un Ribera del Duero reserva
- Un Albariño tendrá acidez muy alta (4-5) y taninos muy bajos (1)
- Un Champagne tendrá acidez muy alta (5) y taninos muy bajos (1)
- Un Priorat tendrá taninos muy altos (5) y cuerpo muy alto (5)
- Un vino dulce tendrá dulzor alto (4-5)
- Un Manzanilla tendrá acidez alta (4) y dulzor muy bajo (1)
- Sé muy diferenciador, no pongas todo en 3-4
- El dulzor de un vino seco siempre será 1 o 2 máximo

Devuelve SOLO este JSON con valores del 1 al 5:
{"taninos":X,"acidez":X,"alcohol":X,"dulzor":X,"cuerpo":X,"intensidad":X,"final":X}`
      }]
    })
    await registrarConsumoAnthropic({
      restauranteId: restaurante_id,
      endpoint: 'perfil_comparador',
      modelo,
      usage: message.usage,
      metadata: {
        vino: nombre,
        origen: origenConsumoCarta({ pruebaToken: prueba_token, restauranteId: restaurante_id }),
      },
    })

    const text = message.content[0].text.trim()
    const perfil = JSON.parse(text)
    return Response.json({ perfil })
  } catch (e) {
    return Response.json({ perfil: { taninos: 3, acidez: 3, alcohol: 3, dulzor: 2, cuerpo: 3, intensidad: 3, final: 3 } })
  }
}
