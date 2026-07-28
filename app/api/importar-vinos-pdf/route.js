import Anthropic from '@anthropic-ai/sdk'
import * as XLSX from 'xlsx'
import { requireRestaurantAccess } from '../_lib/auth'
import { comprobarCuotaIaRestaurante, registrarConsumoAnthropic, responderCuotaIaAgotada } from '../../lib/anthropicUsage'
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_BASE64_LENGTH = 4_500_000

const PROMPT_EXTRACCION = `Extrae la carta de vinos de este archivo.

Devuelve exclusivamente un array JSON válido, sin markdown, sin explicaciones. Extrae como máximo 120 referencias.

Cada objeto debe tener esta forma exacta:
{
  "nombre": "nombre del vino",
  "bodega": "bodega si aparece o vacío",
  "tipo": "tinto|blanco|rosado|espumoso|generoso|dulce|naranja|sin_alcohol|sidra",
  "region": "zona o D.O. exactamente como aparece en el texto, o vacío",
  "uva": "uvas si aparecen o vacío",
  "anada": "añada si aparece o vacío",
  "precio_copa": número mayor que 0 si existe precio de copa, si no 0,
  "precio_botella": número mayor que 0 si existe precio de botella, si no 0,
  "foto_url": "URL publica de etiqueta/imagen si aparece en el archivo, o vacío",
  "notas_cata": "perfiles útiles si son evidentes; si no, vacío"
}

Reglas:
No incluyas cervezas, refrescos, cócteles, cafés ni platos. Solo incluye sidras si existe una sección explícita de Sidras/Sagardoak o equivalente.
Si no sabes un campo, déjalo vacío o 0.
Usa precios en euros como número sin símbolo.
REGIÓN: copia la D.O. o zona geográfica tal como aparece en el texto (ej: "D.O. Sierras de Málaga", "D.O.Ca. Rioja", "AOC Sancerre"). No la traduzcas ni la inventes.
PRECIOS: solo pon un precio si aparece explícitamente en el texto para ese formato. Si el vino solo se vende por botella, precio_copa = 0. Si solo se vende por copa, precio_botella = 0. No inventes precios.
Si aparecen precio de copa y botella, distingue ambos.
Si solo hay un precio y no indica copa, colócalo como precio_botella.
Cuando los precios aparecen separados por espacio en la misma línea (ej: "8,0 38" o "4,5 22"), el primero es copa y el segundo botella.
Cuando el texto une los precios sin separación (ej: "1455" o "8,038"), interpreta como copa 14 y botella 55, copa 8 y botella 38.
Usa encabezados como Blancos, Tintos, Champagne, Generosos, Espumosos o Sidras/Sagardoak para inferir el tipo cuando no aparezca en la línea del vino.
No dupliques el mismo vino.` + `

Regla final de precios: no uses 0 para indicar ausencia de precio. Si no hay precio de copa o botella, devuelve null en ese campo.`

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

function normalizarClave(valor = '') {
  return String(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function filasDesdeArchivoEstructurado(base64, tipo) {
  if (tipo.includes('spreadsheetml') || tipo.includes('ms-excel') || tipo.includes('excel')) {
    const workbook = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    return XLSX.utils.sheet_to_json(sheet, { defval: '' })
  }
  const texto = csvATexto(base64)
  const workbook = XLSX.read(texto, { type: 'string' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { defval: '' })
}

function valorCampo(rowNormalizada, aliases) {
  for (const alias of aliases) {
    const valor = rowNormalizada[normalizarClave(alias)]
    if (valor !== undefined && String(valor).trim() !== '') return String(valor).trim()
  }
  return ''
}

function numeroPrecio(valor) {
  const limpio = String(valor || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')
  const numero = Number(limpio)
  return Number.isFinite(numero) && numero > 0 ? numero : null
}

function urlImagen(valor) {
  const raw = String(valor || '').trim().slice(0, 2048)
  if (!raw) return ''
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const url = new URL(raw)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : ''
  } catch {
    return ''
  }
}

function tipoDesdeTexto(texto = '') {
  const normalizado = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (normalizado.includes('blanco') || normalizado.includes('white')) return 'blanco'
  if (normalizado.includes('rosado') || normalizado.includes('rose')) return 'rosado'
  if (normalizado.includes('espumoso') || normalizado.includes('sparkling') || normalizado.includes('cava') || normalizado.includes('champagne')) return 'espumoso'
  if (normalizado.includes('generoso') || normalizado.includes('jerez') || normalizado.includes('sherry')) return 'generoso'
  if (normalizado.includes('dulce') || normalizado.includes('sweet')) return 'dulce'
  if (normalizado.includes('naranja') || normalizado.includes('orange')) return 'naranja'
  if (normalizado.includes('sidra') || normalizado.includes('cider')) return 'sidra'
  if (normalizado.includes('tinto') || normalizado.includes('red')) return 'tinto'
  return 'tinto'
}

function extraerVinosEstructurados(base64, tipo) {
  if (tipo.startsWith('image/') || tipo === 'application/pdf') return []
  let filas = []
  try {
    filas = filasDesdeArchivoEstructurado(base64, tipo)
  } catch {
    return []
  }

  return filas.map(row => {
    const normalizada = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizarClave(key), value]))
    const nombre = valorCampo(normalizada, ['nombre', 'vino', 'producto', 'item', 'item_name', 'name'])
    if (!nombre) return null

    const categorias = valorCampo(normalizada, ['categorias', 'categoria', 'category', 'tipo'])
    const descripcion = valorCampo(normalizada, ['descripcion', 'description', 'notas_cata', 'notas'])
    return {
      nombre,
      bodega: valorCampo(normalizada, ['bodega', 'producer', 'productor', 'marca', 'brand']),
      tipo: tipoDesdeTexto(valorCampo(normalizada, ['tipo', 'type']) || categorias || descripcion || nombre),
      region: valorCampo(normalizada, ['region', 'zona', 'do', 'd_o', 'denominacion']),
      uva: valorCampo(normalizada, ['uva', 'variedad', 'grape', 'varietal']),
      anada: valorCampo(normalizada, ['anada', 'añada', 'vintage', 'year']),
      precio_copa: numeroPrecio(valorCampo(normalizada, ['precio_copa', 'copa', 'glass_price'])),
      precio_botella: numeroPrecio(valorCampo(normalizada, ['precio_botella', 'precio_pvp', 'precio', 'pvp', 'price', 'amount'])),
      foto_url: urlImagen(valorCampo(normalizada, ['foto_url', 'imagen_principal', 'imagen', 'image_url', 'image', 'foto', 'photo', 'url_imagen', 'main_image'])),
      notas_cata: descripcion,
    }
  }).filter(Boolean).slice(0, 120)
}

export async function POST(req) {
  try {
    const { fileBase64, pdfBase64, mediaType, restaurante_id } = await req.json()
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restaurante_id)
    if (auth.error) return Response.json({ vinos: [], error: auth.error }, { status: auth.status })
    const data = fileBase64 || pdfBase64
    const tipo = (mediaType || 'application/pdf').toLowerCase()

    if (!data) {
      return Response.json({ vinos: [], error: 'Archivo no recibido' }, { status: 400 })
    }
    if (String(data).length > MAX_BASE64_LENGTH) {
      return Response.json({ vinos: [], error: 'Archivo demasiado grande. Usa un PDF de hasta 3 MB.' }, { status: 413 })
    }

    const vinosEstructurados = extraerVinosEstructurados(data, tipo)
    if (vinosEstructurados.length > 0) {
      return Response.json({ vinos: vinosEstructurados, modo: 'estructurado' })
    }

    const cuotaIa = await comprobarCuotaIaRestaurante({
      restauranteId: restaurante_id,
      endpoint: 'importar_vinos',
    })
    if (!cuotaIa.ok) return responderCuotaIaAgotada(cuotaIa)

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

    const modelo = 'claude-sonnet-4-6'
    const message = await anthropic.messages.create({
      model: modelo,
      max_tokens: 12000,
      system: 'Eres un extractor de cartas de vinos. Lees cualquier formato de archivo y devuelves solo JSON válido. No inventes vinos. No incluyas platos ni bebidas que no sean vino, espumoso, generoso o dulce.',
      messages: [{ role: 'user', content: [entrada, { type: 'text', text: PROMPT_EXTRACCION }] }],
    })
    await registrarConsumoAnthropic({
      restauranteId: restaurante_id,
      endpoint: 'importar_vinos',
      modelo,
      usage: message.usage,
      metadata: { media_type: tipo },
    })

    return Response.json({ vinos: extraerJson(message.content?.[0]?.text) })
  } catch (error) {
    console.error('Error importando carta:', error)
    return Response.json({ vinos: [], error: 'No se pudo leer el archivo' }, { status: 500 })
  }
}
