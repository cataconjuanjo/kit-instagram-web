import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const PROMPT_EXTRACCION = `Extrae la carta de vinos de este archivo.

Devuelve exclusivamente un array JSON válido, sin markdown, sin explicaciones. Extrae como máximo 120 referencias.

Cada objeto debe tener esta forma exacta:
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
No incluyas cervezas, refrescos, cócteles, cafés ni platos.
Si no sabes un campo, déjalo vacío o 0.
Usa precios en euros como número sin símbolo.
Si aparecen precio de copa y botella, distingue ambos.
Si solo hay un precio, colócalo como precio_botella.
Cuando el texto del PDF une precios (ej: "1455"), interpreta como copa 14 y botella 55; "8,038" como copa 8 y botella 38.
Usa encabezados como Blancos, Tintos, Champagne, Generosos, Espumosos para inferir el tipo cuando no aparezca en la línea del vino.
No dupliques el mismo vino.`

function extraerJson(texto) {
  const limpio = (texto || '').trim()
  try { return JSON.parse(limpio) } catch {}
  const match = limpio.match(/\[[\s\S]*\]/)
  if (!match) return []
  try { return JSON.parse(match[0]) } catch { return [] }
}

function excelATexto(base64) {
  const workbook = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_csv(sheet)
}

function csvATexto(base64) {
  return Buffer.from(base64, 'base64').toString('utf-8')
}

export async function POST(req) {
  try {
    const { fileBase64, pdfBase64, mediaType } = await req.json()
    const data = fileBase64 || pdfBase64
    const tipo = (mediaType || 'application/pdf').toLowerCase()

    if (!data) {
      return Response.json({ vinos: [], error: 'Archivo no recibido' }, { status: 400 })
    }

    let entrada

    if (tipo.startsWith('image/')) {
      entrada = {
        type: 'image',
        source: { type: 'base64', media_type: tipo, data },
      }
    } else if (tipo === 'application/pdf') {
      entrada = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data },
      }
    } else if (tipo.includes('spreadsheetml') || tipo.includes('ms-excel') || tipo.includes('excel')) {
      const texto = excelATexto(data)
      entrada = { type: 'text', text: `Carta de vinos (Excel):\n\n${texto.slice(0, 60000)}` }
    } else {
      // CSV y cualquier formato de texto
      const texto = csvATexto(data)
      entrada = { type: 'text', text: `Carta de vinos (CSV/texto):\n\n${texto.slice(0, 60000)}` }
    }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 12000,
      system: 'Eres un extractor de cartas de vinos. Lees cualquier formato de archivo y devuelves solo JSON válido. No inventes vinos. No incluyas platos ni bebidas que no sean vino, espumoso, generoso o dulce.',
      messages: [{ role: 'user', content: [entrada, { type: 'text', text: PROMPT_EXTRACCION }] }],
    })

    return Response.json({ vinos: extraerJson(message.content?.[0]?.text) })
  } catch (error) {
    console.error('Error importando carta:', error)
    return Response.json({ vinos: [], error: 'No se pudo leer el archivo' }, { status: 500 })
  }
}
