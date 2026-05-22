import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../../supabase'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

async function generarNota(vino) {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
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
  return message.content[0].text
}

export async function POST(request) {
  try {
    const { restaurante_id } = await request.json()

    const { data: vinos } = await supabase
      .from('vinos')
      .select('*')
      .eq('restaurante_id', restaurante_id)
      .is('notas_cata', null)

    let actualizados = 0

    for (const vino of vinos) {
      try {
        const notas = await generarNota(vino)
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
