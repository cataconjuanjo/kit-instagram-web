import Anthropic from '@anthropic-ai/sdk'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MAX_BASE64_LENGTH = 7_500_000
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'cataconjuanjo@gmail.com'

const PROMPT_EXTRACCION = `Extrae un catalogo de vinos de distribuidor.

Devuelve exclusivamente un array JSON valido, sin markdown, sin explicaciones. Extrae como maximo 180 referencias.

Cada objeto debe tener esta forma exacta:
{
  "nombre": "nombre comercial del vino",
  "bodega": "bodega/productor si aparece o vacio",
  "tipo": "tinto|blanco|rosado|espumoso|generoso|dulce|naranja|sin_alcohol|",
  "region": "D.O., zona o pais si aparece o vacio",
  "uva": "uva o blend si aparece o vacio",
  "anada": "anada, saca o edicion si aparece o vacio",
  "referencia": "codigo interno del proveedor si aparece o vacio",
  "formato": "botella 75 cl, caja 6, magnum, etc. si aparece o vacio",
  "coste_estimado": numero en euros sin simbolo si aparece precio de compra/tarifa, si no 0,
  "pvp_recomendado": numero en euros sin simbolo si aparece PVP recomendado, si no 0,
  "disponibilidad": "disponible, limitado, consultar, agotado, cupo... si aparece o vacio",
  "notas": "observaciones utiles del catalogo si aparecen o vacio"
}

Reglas:
No incluyas cervezas, refrescos, destilados, aceites, conservas ni comida.
No inventes precios, anadas, regiones ni bodegas.
Si hay varios formatos del mismo vino, crea referencias separadas solo si cambia formato o precio.
Si una tabla tiene columnas de precio, interpreta el precio de tarifa/compra como coste_estimado.
Si aparece IVA incluido/excluido o descuento, dejalo indicado en notas.
Usa coma o punto decimal indistintamente, pero devuelve numeros JSON.
El objetivo es comparar distribuidores y preparar compras, no publicar una carta al cliente.`

async function validarAdmin(req) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return { error: 'Sesion no recibida', status: 401 }

  const supabaseAuth = createClient(supabaseUrl, anonKey)
  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error || !data?.user) return { error: 'Sesion no valida', status: 401 }
  if ((data.user.email || '').toLowerCase() !== adminEmail.toLowerCase()) {
    return { error: 'No autorizado', status: 403 }
  }

  return { user: data.user }
}

function extraerJson(texto) {
  const limpio = (texto || '').trim()
  try { return JSON.parse(limpio) } catch {}
  const match = limpio.match(/\[[\s\S]*\]/)
  if (!match) return []
  try { return JSON.parse(match[0]) } catch { return [] }
}

function leerWorkbook(base64, { csv = false } = {}) {
  const buffer = Buffer.from(base64, 'base64')
  if (csv) return XLSX.read(buffer.toString('utf8'), { type: 'string' })
  return XLSX.read(buffer, { type: 'buffer' })
}

function excelATexto(base64, opciones = {}) {
  const workbook = leerWorkbook(base64, opciones)
  return workbook.SheetNames.map(nombre => {
    const sheet = workbook.Sheets[nombre]
    return `Hoja: ${nombre}\n${XLSX.utils.sheet_to_csv(sheet)}`
  }).join('\n\n')
}

function filasTabla(base64, opciones = {}) {
  const workbook = leerWorkbook(base64, opciones)
  return workbook.SheetNames.flatMap(nombre => {
    const sheet = workbook.Sheets[nombre]
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
  })
}

function textoPlano(base64) {
  return Buffer.from(base64, 'base64').toString('utf-8')
}

async function pdfATexto(base64) {
  const resultado = await pdfParse(Buffer.from(base64, 'base64'))
  return resultado?.text || ''
}

function numeroPrecio(valor) {
  const limpio = String(valor || '')
    .replace(/\.(?=\d{3}\b)/g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
  const numero = Number(limpio)
  return Number.isFinite(numero) ? numero : 0
}

function esAnada(numero) {
  return Number.isInteger(numero) && numero >= 1900 && numero <= 2099
}

function extraerPreciosLinea(linea) {
  return [...linea.matchAll(/(?:€\s*)?\b\d{1,4}(?:[,.]\d{1,2})?\b\s*(?:€)?/g)]
    .map(match => {
      const texto = match[0]
      const index = match.index || 0
      const numero = numeroPrecio(texto)
      const contexto = linea.slice(Math.max(0, index - 8), Math.min(linea.length, index + texto.length + 8))
      const tieneDecimal = /[,.]\d{1,2}/.test(texto)
      const tieneEuro = /€/.test(texto)
      const pareceFormato = /\b(cl|ml|l|litro|vol|alc|caja|bot|botella|ud|uds|unid|%)\b/i.test(contexto)
      const alFinalDeLinea = index > linea.length * 0.45 || index + texto.length >= linea.length - 8

      return {
        texto,
        index,
        numero,
        valido: numero > 0 && numero < 1000 && !esAnada(numero) && !pareceFormato && (tieneDecimal || tieneEuro || alFinalDeLinea),
      }
    })
    .filter(item => item.valido)
}

function inferirTipo(linea) {
  if (/\b(cava|champagne|espumoso|pet nat|ancestral)\b/i.test(linea)) return 'espumoso'
  if (/\b(jerez|manzanilla|fino|amontillado|oloroso|palo cortado)\b/i.test(linea)) return 'generoso'
  if (/\b(rosado|rose)\b/i.test(linea)) return 'rosado'
  if (/\b(blanco|white)\b/i.test(linea)) return 'blanco'
  if (/\b(dulce|sweet|moscatel|px|pedro ximenez)\b/i.test(linea)) return 'dulce'
  if (/\b(naranja|orange)\b/i.test(linea)) return 'naranja'
  if (/\b(tinto|red|crianza|reserva|roble)\b/i.test(linea)) return 'tinto'
  return ''
}

function normalizarClave(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function buscarCampo(fila, candidatos) {
  const entradas = Object.entries(fila)
  const encontrado = entradas.find(([clave]) => {
    const normalizada = normalizarClave(clave)
    return candidatos.some(candidato => normalizada === candidato || normalizada.includes(candidato))
  })
  return encontrado ? String(encontrado[1] || '').trim() : ''
}

function extraerCatalogoTabular(base64, opciones = {}) {
  const filas = filasTabla(base64, opciones)
  const vinos = []
  const vistos = new Set()

  for (const fila of filas) {
    const nombre = buscarCampo(fila, [
      'nombre', 'vino', 'producto', 'articulo', 'descripcion', 'denominacion', 'referencia comercial',
    ])
    const bodega = buscarCampo(fila, ['bodega', 'productor', 'elaborador', 'marca', 'fabricante'])
    const region = buscarCampo(fila, ['region', 'zona', 'do', 'd o', 'denominacion origen', 'origen', 'pais'])
    const uva = buscarCampo(fila, ['uva', 'variedad', 'varietal', 'blend'])
    const anada = buscarCampo(fila, ['anada', 'ano', 'anyo', 'cosecha', 'vintage'])
    const referencia = buscarCampo(fila, ['referencia', 'ref', 'codigo', 'sku', 'cod'])
    const formato = buscarCampo(fila, ['formato', 'envase', 'capacidad', 'presentacion', 'botella', 'caja'])
    const tipoCampo = buscarCampo(fila, ['tipo', 'familia', 'categoria', 'subcategoria'])
    const disponibilidad = buscarCampo(fila, ['disponibilidad', 'stock', 'estado'])
    const notas = buscarCampo(fila, ['notas', 'observaciones', 'comentarios'])
    const coste = buscarCampo(fila, [
      'coste', 'costo', 'precio coste', 'precio compra', 'tarifa', 'precio tarifa', 'neto', 'precio neto', 'precio',
    ])
    const pvp = buscarCampo(fila, ['pvp recomendado', 'pvp', 'precio venta', 'venta publico'])
    const textoFila = Object.values(fila).join(' ')
    const nombreFinal = nombre || buscarCampo(fila, ['concepto'])

    if (!nombreFinal || nombreFinal.length < 2) continue

    const costeEstimado = numeroPrecio(coste)
    const pvpRecomendado = numeroPrecio(pvp)
    const key = `${nombreFinal}|${bodega}|${anada}|${formato}|${referencia}`.toLowerCase()
    if (vistos.has(key)) continue
    vistos.add(key)

    vinos.push({
      nombre: nombreFinal,
      bodega,
      tipo: tipoCampo || inferirTipo(textoFila),
      region,
      uva,
      anada,
      referencia,
      formato,
      coste_estimado: costeEstimado > 0 && costeEstimado < 10000 ? costeEstimado : 0,
      pvp_recomendado: pvpRecomendado > 0 && pvpRecomendado < 10000 ? pvpRecomendado : 0,
      disponibilidad,
      notas,
    })

    if (vinos.length >= 3000) break
  }

  return vinos
}

function extraerCatalogoHeuristico(texto) {
  const lineas = String(texto || '')
    .split(/\r?\n/)
    .flatMap(linea => linea.split(/\s{3,}(?=[A-ZÁÉÍÓÚÑ0-9])/))
    .map(linea => linea.replace(/\s+/g, ' ').trim())
    .filter(linea => linea.length >= 8)
  const excluir = /\b(total|subtotal|base imponible|iva|portes|condiciones|pedido|pagina|page|telefono|email|www|instagram|facebook|direccion)\b/i
  const vinos = []
  const vistos = new Set()

  for (const linea of lineas) {
    if (excluir.test(linea)) continue

    const precios = extraerPreciosLinea(linea)
    if (!precios.length) continue

    const precio = precios[0]
    const antesPrecio = linea.slice(0, precio.index).replace(/[|;]/g, ' ').trim()
    const despuesPrecio = linea.slice(precio.index + precio.texto.length).trim()
    const partes = antesPrecio
      .split(/\s{2,}| - | – | — |\t|\s\|\s|;/)
      .map(parte => parte.trim())
      .filter(Boolean)
    const nombreBase = (partes.length ? partes[partes.length - 1] : antesPrecio)
      .replace(/^[A-Z0-9\-_.\/]{2,}\s+/, '')
      .replace(/\b(19|20)\d{2}\b/g, '')
      .replace(/\b\d{1,4}(?:[,.]\d{1,2})?\b\s*(?:€)?/g, '')
      .replace(/\b(75\s*cl|50\s*cl|37[,.]5\s*cl|magnum|caja\s*\d+)\b/ig, '')
      .trim()

    if (nombreBase.length < 3 || nombreBase.split(' ').length > 14) continue

    const anada = (linea.match(/\b(19|20)\d{2}\b/) || [])[0] || ''
    const formato = (linea.match(/\b(caja\s*\d+|botella\s*\d+\s*cl|75\s*cl|magnum|50\s*cl|37[,.]5\s*cl)\b/i) || [])[0] || ''
    const referencia = (linea.match(/\b[A-Z]{1,4}[-/]?\d{3,8}\b/i) || [])[0] || ''
    const key = `${nombreBase}|${anada}|${formato}|${precio.numero}`.toLowerCase()
    if (vistos.has(key)) continue
    vistos.add(key)

    vinos.push({
      nombre: nombreBase,
      bodega: partes.length > 1 ? partes[0] : '',
      tipo: inferirTipo(linea),
      region: '',
      uva: '',
      anada,
      referencia,
      formato,
      coste_estimado: precio.numero,
      pvp_recomendado: 0,
      disponibilidad: /agotado|sin stock/i.test(linea) ? 'agotado' : '',
      notas: despuesPrecio.slice(0, 180),
    })

    if (vinos.length >= 180) break
  }

  return vinos
}

function respuestaVacia() {
  return {
    vinos: [],
    metodo: 'vacio',
    aviso: 'No se detectaron vinos con suficiente claridad. Prueba copiando una tabla donde aparezcan nombre del vino y precio, o convierte el PDF a Excel/CSV.',
  }
}

export async function POST(req) {
  try {
    const admin = await validarAdmin(req)
    if (admin.error) return Response.json({ vinos: [], error: admin.error }, { status: admin.status })

    const { fileBase64, pdfBase64, mediaType, proveedorNombre, textoCatalogo } = await req.json()
    const data = fileBase64 || pdfBase64
    const tipo = (mediaType || 'application/pdf').toLowerCase()

    if (!data && !textoCatalogo) {
      return Response.json({ vinos: [], error: 'Archivo no recibido' }, { status: 400 })
    }
    if (data && String(data).length > MAX_BASE64_LENGTH) {
      return Response.json({ vinos: [], error: 'Archivo demasiado grande. Usa un PDF de hasta 5 MB o pega el texto de la tarifa.' }, { status: 413 })
    }

    let entrada
    let textoFuente = ''
    const esHojaCalculo = tipo.includes('spreadsheetml') || tipo.includes('ms-excel') || tipo.includes('excel')
    const esCsv = tipo.includes('csv') || tipo.includes('text/plain') || tipo.includes('text/csv')

    if (textoCatalogo) {
      textoFuente = String(textoCatalogo)
      entrada = { type: 'text', text: `Texto copiado del catalogo de distribuidor:\n\n${textoFuente.slice(0, 90000)}` }
    } else if (tipo.startsWith('image/')) {
      entrada = { type: 'image', source: { type: 'base64', media_type: tipo, data } }
    } else if (tipo === 'application/pdf') {
      try {
        textoFuente = await pdfATexto(data)
      } catch (error) {
        console.warn('No se pudo extraer texto local del PDF:', error)
      }
      entrada = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    } else if (esHojaCalculo || esCsv) {
      let vinosTabulares = []
      try {
        vinosTabulares = extraerCatalogoTabular(data, { csv: esCsv })
      } catch (error) {
        console.warn('No se pudo leer el catalogo como tabla:', error)
      }
      if (vinosTabulares.length) {
        return Response.json({
          vinos: vinosTabulares,
          metodo: 'tabla',
          aviso: `Importacion tabular completa: he detectado ${vinosTabulares.length} referencias. Revisa una muestra antes de guardar.`,
        })
      }
      textoFuente = excelATexto(data, { csv: esCsv })
      entrada = { type: 'text', text: `Catalogo de distribuidor en tabla:\n\n${textoFuente.slice(0, 90000)}` }
    } else {
      textoFuente = textoPlano(data)
      entrada = { type: 'text', text: `Catalogo de distribuidor en texto/CSV:\n\n${textoFuente.slice(0, 90000)}` }
    }

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        system: 'Eres un extractor de catalogos profesionales de distribuidores de vino. Devuelves solo JSON valido. No inventas referencias ni precios.',
        messages: [{
          role: 'user',
          content: [
            entrada,
            { type: 'text', text: `${PROMPT_EXTRACCION}\n\nProveedor indicado por el usuario: ${proveedorNombre || 'no indicado'}` }
          ]
        }],
      })

      const vinos = extraerJson(message.content?.[0]?.text)
      if (Array.isArray(vinos) && vinos.length) {
        return Response.json({ vinos, metodo: 'ia' })
      }
    } catch (error) {
      if (!textoFuente) throw error
      console.warn('La IA no pudo importar el catalogo; usando extractor local:', error)
    }

    if (textoFuente) {
      const vinos = extraerCatalogoHeuristico(textoFuente)
      if (vinos.length) {
        return Response.json({
          vinos,
          metodo: 'heuristico',
          aviso: 'Importacion provisional: he detectado nombres y precios automaticamente. Revisa las referencias antes de guardar.',
        })
      }
    }

    return Response.json(respuestaVacia())
  } catch (error) {
    console.error('Error importando catalogo de proveedor:', error)
    return Response.json({ vinos: [], error: 'No se pudo leer el catalogo del proveedor.' }, { status: 500 })
  }
}
