import Anthropic from '@anthropic-ai/sdk'
import { requireRestaurantAccess } from '../_lib/auth'
import { comprobarCuotaIaRestaurante, registrarConsumoAnthropic, responderCuotaIaAgotada } from '../../lib/anthropicUsage'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_BASE64_LENGTH = 4_500_000

export async function POST(req) {
  try {
    const { pdfBase64, fileBase64, mediaType, restaurante_id } = await req.json()
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ texto: '', error: auth.error }, { status: auth.status })
    const data = fileBase64 || pdfBase64
    const tipo = (mediaType || 'application/pdf').toLowerCase()

    if (!data) {
      return Response.json({ texto: '', error: 'Archivo no recibido' }, { status: 400 })
    }
    if (String(data).length > MAX_BASE64_LENGTH) {
      return Response.json({ texto: '', error: 'Archivo demasiado grande. Usa un PDF o imagen de hasta 3 MB.' }, { status: 413 })
    }

    const cuotaIa = await comprobarCuotaIaRestaurante({
      restauranteId: restaurante_id,
      endpoint: 'importar_platos',
    })
    if (!cuotaIa.ok) return responderCuotaIaAgotada(cuotaIa)

    const entrada = tipo.startsWith('image/')
      ? { type: 'image', source: { type: 'base64', media_type: tipo, data } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }

    const modelo = 'claude-haiku-4-5-20251001'
    const message = await anthropic.messages.create({
      model: modelo,
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
    await registrarConsumoAnthropic({
      restauranteId: restaurante_id,
      endpoint: 'importar_platos',
      modelo,
      usage: message.usage,
      metadata: { media_type: tipo },
    })

    return Response.json({ texto: message.content?.[0]?.text || '' })
  } catch (error) {
    console.error('Error importando platos:', error)
    return Response.json({ texto: '', error: 'No se pudo leer el archivo' }, { status: 500 })
  }
}
