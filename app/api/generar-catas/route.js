import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as supabase } from '../../lib/supabaseAdmin'
import { requireRestaurantAccess } from '../_lib/auth'
import { comprobarCuotaIaRestaurante, registrarConsumoAnthropic, responderCuotaIaAgotada } from '../../lib/anthropicUsage'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

async function generarNota(vino, restauranteId) {
  const modelo = 'claude-haiku-4-5'
  const message = await anthropic.messages.create({
    model: modelo,
    max_tokens: 300,
    system: 'Eres un especialista en vino. Escribes notas de cata elegantes y concisas en español. Sin asteriscos, sin markdown, solo texto plano en 2-3 frases máximo.',
    messages: [{
      role: 'user',
      content: `Escribe una nota de cata breve y elegante para este vino:
Nombre: ${vino.nombre}
Bodega: ${vino.bodega || 'desconocida'}
Tipo: ${vino.tipo}
Región: ${vino.region || 'desconocida'}
Uva: ${vino.uva || 'desconocida'}
Añada: ${vino.anada || 'sin especificar'}

Describe color, aromas y boca en 2-3 frases naturales como las de una guía de vinos. Sin listar, texto corrido.`
    }]
  })
  await registrarConsumoAnthropic({
    restauranteId,
    endpoint: 'generar_catas_batch',
    modelo,
    usage: message.usage,
    metadata: { vino_id: vino.id, vino: vino.nombre },
  })
  return message.content[0].text
}

export async function POST(request) {
  try {
    const { restaurante_id } = await request.json()
    const auth = await requireRestaurantAccess(request, supabase, restaurante_id)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const { data: vinos, error: vinosError } = await supabase
      .from('vinos')
      .select('id, nombre, bodega, tipo, region, uva, anada')
      .eq('restaurante_id', restaurante_id)
      .is('notas_cata', null)

    if (vinosError) return Response.json({ error: vinosError.message }, { status: 500 })
    if (!vinos?.length) return Response.json({ ok: true, actualizados: 0 })

    const cuotaIa = await comprobarCuotaIaRestaurante({
      restauranteId: restaurante_id,
      endpoint: 'generar_catas_batch',
      solicitudesEstimadas: vinos.length,
    })
    if (!cuotaIa.ok) return responderCuotaIaAgotada(cuotaIa)

    let actualizados = 0

    for (const vino of vinos) {
      try {
        const notas = await generarNota(vino, restaurante_id)
        await supabase.from('vinos').update({ notas_cata: notas }).eq('id', vino.id)
        actualizados++
        await new Promise(r => setTimeout(r, 500))
      } catch (e) {
        console.error('Error en vino:', vino.nombre, e)
      }
    }

    return Response.json({ ok: true, actualizados })

  } catch (error) {
    console.error('Error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
