import { NextResponse } from 'next/server'
import { supabaseAdmin } from '../../../../../lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'
import { requireKioskoAccess } from '../../../../_lib/kioskoAuth'

const TIPOS_VALIDOS = new Set([
  'tinto', 'blanco', 'rosado', 'espumoso', 'generoso', 'dulce', 'naranja', 'sin_alcohol',
])

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const raw = text.replace(/^﻿/, '')
  const lines = raw.split(/\r?\n/)

  function parseLine(line) {
    const fields = []
    let i = 0
    while (i <= line.length) {
      if (i === line.length) { fields.push(''); break }
      if (line[i] === '"') {
        let j = i + 1, val = ''
        while (j < line.length) {
          if (line[j] === '"' && line[j + 1] === '"') { val += '"'; j += 2 }
          else if (line[j] === '"') { j++; break }
          else { val += line[j++] }
        }
        fields.push(val)
        i = j
        if (i < line.length && line[i] === ',') i++
      } else {
        let j = i
        while (j < line.length && line[j] !== ',') j++
        fields.push(line.slice(i, j))
        i = j + 1
      }
    }
    return fields
  }

  const headers = parseLine(lines[0]).map(h =>
    h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  const filas = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseLine(lines[i])
    const row = {}
    headers.forEach((h, idx) => { row[h] = (vals[idx] ?? '').trim() })
    filas.push(row)
  }
  return filas
}

// ── XLSX parser ───────────────────────────────────────────────────────────────
async function parseXLSX(arrayBuffer) {
  const XLSXmod = await import('xlsx')
  const XLSX    = XLSXmod.default || XLSXmod
  const wb      = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' })
  const ws      = wb.Sheets[wb.SheetNames[0]]
  const rows    = XLSX.utils.sheet_to_json(ws, { defval: '' })

  return rows.map(row => {
    const norm = {}
    for (const [k, v] of Object.entries(row)) {
      const key = String(k)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s/]+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
      norm[key] = String(v ?? '').trim()
    }
    return norm
  })
}

// ── PDF parser ─────────────────────────────────────────────────────────────────
async function parsePDF(arrayBuffer) {
  let pdfParse
  try {
    const mod = await import('pdf-parse/lib/pdf-parse.js')
    pdfParse  = mod.default || mod
  } catch {
    throw new Error('La importación de PDF no está disponible. Exporta el catálogo a CSV o Excel.')
  }

  const data  = await pdfParse(Buffer.from(arrayBuffer))
  const texto = data.text?.trim()
  if (!texto) throw new Error('El PDF no tiene texto legible (puede ser un PDF de imágenes escaneadas)')

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: `Extrae la lista de vinos de este texto. Devuelve ÚNICAMENTE un array JSON válido:
[{"nombre":"...","bodega":"...","tipo":"tinto|blanco|rosado|espumoso|generoso|dulce|naranja|sin_alcohol","uva":"...","anada":"...","region":"...","pais":"España","precio_pvp":0.0}]
Omite campos que no aparezcan o sean nulos. Solo el array JSON, sin texto adicional.`,
    messages: [{ role: 'user', content: texto.slice(0, 12000) }],
  })

  const txt   = resp.content[0]?.text || ''
  const match = txt.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('No se encontraron vinos en el PDF')

  const wines = JSON.parse(match[0])
  return wines.map(row => {
    const norm = {}
    for (const [k, v] of Object.entries(row)) {
      norm[String(k).toLowerCase()] = v != null ? String(v).trim() : ''
    }
    return norm
  })
}

// ── Row mapper ────────────────────────────────────────────────────────────────
function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function bool(v) {
  if (v === true || v === false) return v
  const s = String(v).toLowerCase().trim()
  return s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes'
}

function mapFila(row, tiendaId) {
  const nombre = (row.nombre || '').trim()
  if (!nombre) return null

  const tipoRaw = (row.tipo || '').trim().toLowerCase()
  const tipo    = TIPOS_VALIDOS.has(tipoRaw) ? tipoRaw : null

  return {
    tienda_id:            tiendaId,
    nombre,
    bodega:               row.bodega              || null,
    tipo,
    uva:                  row.uva                 || null,
    anada:                row.anada               || null,
    region:               row.region              || null,
    pais:                 row.pais                || 'España',
    precio_pvp:           num(row.precio_pvp),
    precio_coste:         num(row.precio_coste),
    stock:                num(row.stock) ?? 0,
    ubicacion_estanteria: row.ubicacion_estanteria || null,
    foto_url:             row.foto_url             || null,
    descripcion:          row.descripcion          || null,
    notas_cata:           row.notas_cata           || null,
    puntuacion:           num(row.puntuacion),
    destacado:            bool(row.destacado),
    activo:               row.activo !== undefined ? bool(row.activo) : true,
  }
}

// ── POST ───────────────────────────────────────────────────────────────────────
export async function POST(request, { params }) {
  const { slug } = await params
  const access = await requireKioskoAccess(request, slug)
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status })
  const tiendaId = access.tienda.id

  let archivo, reemplazar, modo
  try {
    const fd  = await request.formData()
    archivo   = fd.get('file')
    if (!archivo) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
    modo       = fd.get('modo') || 'añadir'
    reemplazar = modo === 'reemplazar'
  } catch {
    return NextResponse.json({ error: 'Error al leer el archivo' }, { status: 400 })
  }

  const nombre = (archivo.name || '').toLowerCase()
  const mime   = (archivo.type || '').toLowerCase()
  let filas    = []

  try {
    if (nombre.endsWith('.csv') || mime.includes('csv') || mime.includes('text/plain')) {
      filas = parseCSV(await archivo.text())
    } else if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls') || mime.includes('spreadsheet') || mime.includes('excel')) {
      filas = await parseXLSX(await archivo.arrayBuffer())
    } else if (nombre.endsWith('.pdf') || mime.includes('pdf')) {
      filas = await parsePDF(await archivo.arrayBuffer())
    } else {
      return NextResponse.json({ error: 'Formato no reconocido. Usa CSV, Excel (.xlsx) o PDF.' }, { status: 400 })
    }
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Error al procesar el archivo' }, { status: 400 })
  }

  const vinos = filas.map(f => mapFila(f, tiendaId)).filter(Boolean)
  if (!vinos.length) {
    return NextResponse.json({
      error: 'No se encontraron vinos. Revisa que el archivo tenga una columna "nombre".',
    }, { status: 400 })
  }

  // ── Modo "solo precios" o "solo stock": PATCH por nombre+bodega ────────────
  if (modo === 'solo_precios' || modo === 'solo_stock') {
    const { data: existentes } = await supabaseAdmin
      .from('vinos_tienda')
      .select('id, nombre, bodega')
      .eq('tienda_id', tiendaId)

    const norm = s => (s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const existMap = new Map()
    for (const v of existentes || []) {
      existMap.set(`${norm(v.nombre)}|${norm(v.bodega)}`, v.id)
    }

    let actualizados = 0
    let sinCambios   = 0
    const errores    = []

    for (const fila of filas) {
      const key = `${norm(fila.nombre || '')}|${norm(fila.bodega || '')}`
      const id  = existMap.get(key)
      if (!id) { sinCambios++; continue }

      let patch
      if (modo === 'solo_precios') {
        patch = {}
        if (fila.precio_pvp   !== undefined && fila.precio_pvp   !== '') patch.precio_pvp   = num(fila.precio_pvp)
        if (fila.precio_coste !== undefined && fila.precio_coste !== '') patch.precio_coste = num(fila.precio_coste)
        if (fila.precio_oferta !== undefined && fila.precio_oferta !== '') patch.precio_oferta = num(fila.precio_oferta)
      } else {
        const stockVal = num(fila.stock)
        if (stockVal === null) { sinCambios++; continue }
        patch = { stock: stockVal }
      }

      if (!Object.keys(patch).length) { sinCambios++; continue }
      const { error } = await supabaseAdmin.from('vinos_tienda').update(patch).eq('id', id)
      if (error) errores.push(`${fila.nombre}: ${error.message}`)
      else       actualizados++
    }

    return NextResponse.json({ insertados: 0, actualizados, sinCambios, omitidos: filas.length - vinos.length, errores })
  }

  if (reemplazar) {
    const { error: delErr } = await supabaseAdmin
      .from('vinos_tienda').delete().eq('tienda_id', tiendaId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  const LOTE = 100
  let insertados = 0
  const errores  = []

  for (let i = 0; i < vinos.length; i += LOTE) {
    const { error: insErr } = await supabaseAdmin.from('vinos_tienda').insert(vinos.slice(i, i + LOTE))
    if (insErr) errores.push(`Lote ${Math.floor(i / LOTE) + 1}: ${insErr.message}`)
    else        insertados += Math.min(LOTE, vinos.length - i)
  }

  return NextResponse.json({ insertados, omitidos: filas.length - vinos.length, errores })
}
