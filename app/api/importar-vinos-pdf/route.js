import Anthropic from '@anthropic-ai/sdk'
import pdf from 'pdf-parse/lib/pdf-parse'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function extraerTextoPdf(base64) {
  const result = await pdf(Buffer.from(base64, 'base64'))
  return (result.text || '').trim()
}

function extraerJson(texto) {
  const limpio = (texto || '').trim()
  try {
    return JSON.parse(limpio)
  } catch {}

  const match = limpio.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    return JSON.parse(match[0])
  } catch {
    return []
  }
}

export async function POST(req) {
  try {
    const { pdfBase64, fileBase64, mediaType } = await req.json()
    const data = fileBase64 || pdfBase64
    const tipoArchivo = mediaType || 'application/pdf'

    if (!data) {
      return Response.json({ vinos: [], error: 'Archivo no recibido' }, { status: 400 })
    }

    const textoPdf = tipoArchivo === 'application/pdf' ? await extraerTextoPdf(data) : ''
    const entrada = textoPdf.length > 200
      ? {
          type: 'text',
          text: `Texto extraido del PDF:\n\n${textoPdf.slice(0, 60000)}`
        }
      : tipoArchivo === 'application/pdf'
        ? {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data
            }
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: tipoArchivo,
              data
            }
          }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 12000,
      system: 'Eres un extractor de cartas de vinos. Lees PDFs e imágenes de restaurantes y devuelves solo JSON válido. No inventes vinos. No incluyas platos ni bebidas que no sean vino, espumoso, generoso o dulce.',
      messages: [{
        role: 'user',
        content: [
          entrada,
          {
            type: 'text',
            text: `Extrae la carta de vinos de este archivo.

Devuelve exclusivamente un array JSON válido, sin markdown, sin explicaciones. Extrae como máximo 120 referencias.

Cada objeto debe tener esta forma:
{
  "nombre": "nombre del vino",
  "bodega": "bodega si aparece o vacío",
  "tipo": "tinto|blanco|rosado|espumoso|generoso|dulce|naranja",
  "region": "zona, DO o país si aparece o vacío",
  "uva": "uvas si aparecen o vacío",
  "anada": "añada si aparece o vacío",
  "precio_copa": número o 0,
  "precio_botella": número o 0,
  "notas_cata": "perfiles útiles si son evidentes; si no, vacío"
}

Reglas:
No incluyas cervezas, refrescos, cocteles, cafés ni platos.
Si no sabes un campo, déjalo vacío o 0.
Usa precios en euros como número.
Si aparecen precio de copa y botella, distingue ambos.
Si solo hay un precio, colócalo como precio_botella.
El texto extraido de PDF puede unir precios de copa y botella: por ejemplo "1455" suele significar copa 14 y botella 55; "8,038" suele significar copa 8,0 y botella 38; "25110" suele significar copa 25 y botella 110.
Usa los encabezados cercanos como Blancos, Tintos, Champagne, Generosos o Espumosos para inferir el tipo cuando no aparezca en la línea del vino.
No dupliques el mismo vino.`
          }
        ]
      }]
    })

    return Response.json({ vinos: extraerJson(message.content?.[0]?.text) })
  } catch (error) {
    console.error('Error importando vinos desde archivo:', error)
    return Response.json({ vinos: [], error: 'No se pudo leer el archivo' }, { status: 500 })
  }
}
