import Anthropic from '@anthropic-ai/sdk'
import pdf from 'pdf-parse/lib/pdf-parse'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function extraerTextoPdf(base64) {
  const result = await pdf(Buffer.from(base64, 'base64'))
  return (result.text || '').trim()
}

function bloqueArchivo(data, mediaType) {
  if (mediaType === 'application/pdf') {
    return {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data
      }
    }
  }

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data
    }
  }
}

export async function POST(req) {
  try {
    const { pdfBase64, fileBase64, mediaType } = await req.json()
    const data = fileBase64 || pdfBase64
    const tipoArchivo = mediaType || 'application/pdf'

    if (!data) {
      return Response.json({ texto: '', error: 'Archivo no recibido' }, { status: 400 })
    }

    const textoPdf = tipoArchivo === 'application/pdf' ? await extraerTextoPdf(data) : ''
    const entrada = textoPdf.length > 200
      ? {
          type: 'text',
          text: `Texto extraido del PDF:\n\n${textoPdf.slice(0, 60000)}`
        }
      : bloqueArchivo(data, tipoArchivo)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: 'Eres un extractor de cartas de restaurante. Tu trabajo es leer PDFs e imagenes de cartas de comida y devolver platos limpios para importar en una aplicacion. No inventes platos. No incluyas vinos, bebidas, menus legales, alergenos sueltos, horarios ni texto promocional. Responde solo en texto plano.',
      messages: [{
        role: 'user',
        content: [
          entrada,
          {
            type: 'text',
            text: `Extrae solo la carta de comidas de este archivo.

Devuelve un plato por linea con este formato:
Nombre del plato | precio | descripcion breve

Reglas:
Si no aparece precio, usa 0.
Usa precio en euros como numero, por ejemplo 12.50.
No incluyas numeracion.
No incluyas alergenos salvo que formen parte natural de la descripcion.
No incluyas vinos, cervezas, refrescos, cocteles, cafes ni bebidas.
No incluyas encabezados de secciones como Entrantes o Carnes, solo platos.
Manten los nombres reales de la carta.
Si hay variantes de un mismo plato que se venden como platos distintos, mantenlas en lineas separadas.`
          }
        ]
      }]
    })

    return Response.json({ texto: message.content?.[0]?.text || '' })
  } catch (error) {
    console.error('Error importando platos desde archivo:', error)
    return Response.json({ texto: '', error: 'No se pudo leer el archivo' }, { status: 500 })
  }
}
