import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  const { pdfBase64 } = await req.json()

  try {
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