import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req) {
  try {
    const { pdfBase64, fileBase64, mediaType } = await req.json()
    const data = fileBase64 || pdfBase64
    const tipo = (mediaType || 'application/pdf').toLowerCase()

    if (!data) {
      return Response.json({ texto: '', error: 'Archivo no recibido' }, { status: 400 })
    }

    const entrada = tipo.startsWith('image/')
      ? { type: 'image', source: { type: 'base64', media_type: tipo, data } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: 'Eres un extractor de cartas de restaurante. Lees PDFs e imágenes de cartas de comida y devuelves platos limpios para importar. No inventes platos. No incluyas vinos, bebidas, menús legales, alérgenos sueltos, horarios ni texto promocional. Responde solo en texto plano.',
      messages: [{
        role: 'user',
        content: [
          entrada,
          {
            type: 'text',
            text: `Extrae solo la carta de comidas de este archivo.

Devuelve un plato por línea con este formato:
Nombre del plato | precio | descripción breve

Reglas:
Si no aparece precio, usa 0.
Usa precio en euros como número, por ejemplo 12.50.
No incluyas numeración.
No incluyas alérgenos salvo que formen parte natural de la descripción.
No incluyas vinos, cervezas, refrescos, cócteles, cafés ni bebidas.
No incluyas encabezados de secciones como Entrantes o Carnes, solo platos.
Mantén los nombres reales de la carta.
Si hay variantes de un mismo plato que se venden como platos distintos, mantenlas en líneas separadas.`,
          },
        ],
      }],
    })

    return Response.json({ texto: message.content?.[0]?.text || '' })
  } catch (error) {
    console.error('Error importando platos:', error)
    return Response.json({ texto: '', error: 'No se pudo leer el archivo' }, { status: 500 })
  }
}
