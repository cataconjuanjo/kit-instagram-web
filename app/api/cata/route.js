import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export async function POST(request) {
  try {
    const { nombre, bodega, tipo, region, uva, anada } = await request.json()

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'Eres un sommelier experto. Escribes notas de cata elegantes y concisas en español. Sin asteriscos, sin markdown, solo texto plano en 2-3 frases máximo.',
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

    return Response.json({ notas: message.content[0].text })

  } catch (error) {
    console.error('Error generando cata:', error)
    return Response.json({ notas: '' }, { status: 500 })
  }
}