import Anthropic from '@anthropic-ai/sdk'
import { requireRestaurantAccess } from '../_lib/auth'
import { registrarConsumoAnthropic } from '../../lib/anthropicUsage'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export async function POST(request) {
  try {
    const { nombre, bodega, tipo, region, uva, anada, restaurante_id } = await request.json()
    const auth = await requireRestaurantAccess(request, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })
    if (!String(nombre || '').trim() || !String(tipo || '').trim()) {
      return Response.json({ notas: '', error: 'Nombre y tipo son obligatorios.' }, { status: 400 })
    }

    const modelo = 'claude-haiku-4-5-20251001'
    const message = await anthropic.messages.create({
      model: modelo,
      max_tokens: 300,
      system: 'Eres un especialista en vino. Escribes notas de cata elegantes y concisas en español. Sin asteriscos, sin markdown, solo texto plano en 2-3 frases máximo.',
      messages: [{
        role: 'user',
        content: `Escribe una nota de cata breve y elegante para este vino:
Nombre: ${nombre}
Bodega: ${bodega || 'desconocida'}
Tipo: ${tipo}
Región: ${region || 'desconocida'}
Uva: ${uva || 'desconocida'}
Añada: ${anada || 'sin especificar'}

Describe color, aromas y boca en 2-3 frases naturales como las de una guía de vinos. Sin listar, texto corrido.`
      }]
    })
    await registrarConsumoAnthropic({
      restauranteId: restaurante_id,
      endpoint: 'nota_cata',
      modelo,
      usage: message.usage,
      metadata: { vino: nombre },
    })

    return Response.json({ notas: message.content[0].text })

  } catch (error) {
    console.error('Error generando cata:', error)
    return Response.json({ notas: '' }, { status: 500 })
  }
}
