import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
    const { pdfBase64 } = await req.json()
    if (!pdfBase64) {
      return Response.json({ vinos: [], error: 'PDF no recibido' }, { status: 400 })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 5000,
      system: 'Eres un extractor de cartas de vinos. Lees PDFs de restaurantes y devuelves solo JSON valido. No inventes vinos. No incluyas platos ni bebidas que no sean vino, espumoso, generoso o dulce.',
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
            text: `Extrae la carta de vinos de este PDF.

Devuelve exclusivamente un array JSON valido, sin markdown, sin explicaciones.

Cada objeto debe tener esta forma:
{
  "nombre": "nombre del vino",
  "bodega": "bodega si aparece o vacio",
  "tipo": "tinto|blanco|rosado|espumoso|generoso|dulce|naranja",
  "region": "zona, DO o pais si aparece o vacio",
  "uva": "uvas si aparecen o vacio",
  "anada": "añada si aparece o vacio",
  "precio_copa": numero o 0,
  "precio_botella": numero o 0,
  "notas_cata": "perfiles utiles separados por coma: perfil fresco, alta acidez, salino, mineral, floral, fruta madura, con cuerpo, tanino amable, madera, tostado, oxidativo, dulce"
}

Reglas:
No incluyas cervezas, refrescos, cocteles, cafés ni platos.
Si no sabes un campo, dejalo vacio o 0.
Usa precios en euros como numero.
Si aparecen precio de copa y botella, distingue ambos.
Si solo hay un precio, colocalo como precio_botella.
No dupliques el mismo vino.`
          }
        ]
      }]
    })

    return Response.json({ vinos: extraerJson(message.content?.[0]?.text) })
  } catch (error) {
    console.error('Error importando vinos desde PDF:', error)
    return Response.json({ vinos: [], error: 'No se pudo leer el PDF' }, { status: 500 })
  }
}
