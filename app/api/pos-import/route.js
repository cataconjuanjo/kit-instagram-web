import crypto from 'node:crypto'
import * as XLSX from 'xlsx'
import { requireRestaurantAccess } from '../_lib/auth'
import { supabaseAdmin } from '../../lib/supabaseAdmin'
import { guardarAtribucionDesdeEventos } from '../../lib/recommendationAttribution'
import {
  aplicarOverrides,
  construirPreview,
  detectarMapping,
  normalizarTexto,
  numero,
  redondear,
  resumenFilas,
  texto,
} from '../../lib/posImport'

const MAX_BASE64_LENGTH = 7_000_000

function limpiarBase64(valor = '') {
  return String(valor || '').replace(/^data:[^;]+;base64,/, '')
}

function sha256(valor) {
  return crypto.createHash('sha256').update(valor).digest('hex')
}

function bufferDesdeBase64(base64) {
  return Buffer.from(limpiarBase64(base64), 'base64')
}

function hashArchivo(base64) {
  return sha256(bufferDesdeBase64(base64))
}

function hashLinea(linea) {
  return sha256([
    linea.fecha,
    linea.servicio_tipo || 'otro',
    linea.producto_normalizado,
    redondear(linea.cantidad, 2),
    redondear(linea.importe, 2),
    redondear(linea.precio_unitario, 2),
  ].join('|'))
}

function leerWorkbook(base64) {
  const buffer = bufferDesdeBase64(base64)
  return XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false })
}

function leerFilas(base64) {
  const workbook = leerWorkbook(base64)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return { rows: [], columns: [] }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
  const columns = Array.from(rows.reduce((set, row) => {
    Object.keys(row || {}).forEach(key => set.add(key))
    return set
  }, new Set()))
  return { rows, columns }
}

async function leerOpcional(query) {
  const { data, error } = await query
  if (error) {
    const msg = `${error.message || ''} ${error.details || ''}`
    if (/does not exist|schema cache|relation/i.test(msg)) return { data: [], missing: true }
    throw error
  }
  return { data: data || [], missing: false }
}

async function buscarBatchPorHash(restauranteId, archivoHash) {
  if (!archivoHash) return { batch: null, missing: false }
  const { data, error } = await supabaseAdmin
    .from('pos_import_batches')
    .select('id, archivo_nombre, filas_total, filas_match, filas_duplicadas, importe_total, created_at')
    .eq('restaurante_id', restauranteId)
    .eq('archivo_hash', archivoHash)
    .maybeSingle()
  if (error) {
    const msg = `${error.message || ''} ${error.details || ''}`
    if (/does not exist|schema cache|relation|archivo_hash/i.test(msg)) return { batch: null, missing: true }
    throw error
  }
  return { batch: data || null, missing: false }
}

async function marcarLineasDuplicadas(restauranteId, filas = []) {
  const conHash = filas.map(fila => ({ ...fila, line_hash: fila.line_hash || hashLinea(fila) }))
  const hashes = [...new Set(conHash.map(fila => fila.line_hash).filter(Boolean))]
  if (!hashes.length) return conHash

  const { data, error } = await supabaseAdmin
    .from('pos_sale_lines')
    .select('id, line_hash, batch_id, created_at')
    .eq('restaurante_id', restauranteId)
    .in('line_hash', hashes)
    .limit(5000)

  if (error) {
    const msg = `${error.message || ''} ${error.details || ''}`
    if (/does not exist|schema cache|relation|line_hash/i.test(msg)) return conHash
    throw error
  }

  const existentes = new Map()
  ;(data || []).forEach(linea => {
    if (!existentes.has(linea.line_hash)) existentes.set(linea.line_hash, linea)
  })

  return conHash.map(fila => {
    const existente = existentes.get(fila.line_hash)
    if (!existente) return fila
    return {
      ...fila,
      duplicada: true,
      duplicate_of: existente.id,
      duplicate_batch_id: existente.batch_id,
    }
  })
}

async function cargarBase(restauranteId) {
  const [{ data: vinos, error: vinosError }, aliasesRes] = await Promise.all([
    supabaseAdmin
      .from('vinos')
      .select('id, nombre, bodega, region, referencia_proveedor, precio_botella, precio_copa, coste_compra, activo')
      .eq('restaurante_id', restauranteId),
    leerOpcional(
      supabaseAdmin
        .from('wine_aliases')
        .select('id, vino_id, alias, alias_normalizado, activo')
        .eq('restaurante_id', restauranteId)
        .eq('activo', true)
    ),
  ])
  if (vinosError) throw vinosError
  return {
    vinos: (vinos || []).filter(vino => vino.activo !== false),
    aliases: aliasesRes.data || [],
    aliasesMissing: aliasesRes.missing,
  }
}

async function prepararPreview({ restauranteId, rows, columns, mapping, vinos, aliases }) {
  const mappingFinal = { ...detectarMapping(columns), ...(mapping || {}) }
  const preview = construirPreview(rows, mappingFinal, vinos, aliases)
  const filas = await marcarLineasDuplicadas(restauranteId, preview.filas)
  const resumen = resumenFilas(filas)
  return {
    columnas: columns,
    mapping: mappingFinal,
    filas,
    resumen: {
      ...resumen,
      importe_total: redondear(resumen.importe_total, 2),
    },
  }
}

async function cargarExposiciones(restauranteId, lineas) {
  const vinoIds = [...new Set(lineas.map(linea => linea.vino_id).filter(Boolean))]
  const fechas = [...new Set(lineas.map(linea => linea.fecha).filter(Boolean))]
  if (!vinoIds.length || !fechas.length) return new Map()
  const { data, error } = await supabaseAdmin
    .from('recommendation_exposures')
    .select('id, recommendation_id, vino_id, servicio_fecha, servicio_tipo, created_at')
    .eq('restaurante_id', restauranteId)
    .in('vino_id', vinoIds)
    .in('servicio_fecha', fechas)
    .order('created_at', { ascending: false })
  if (error) return new Map()
  const map = new Map()
  ;(data || []).forEach(exposure => {
    const exacta = `${exposure.vino_id}|${exposure.servicio_fecha}|${exposure.servicio_tipo || 'otro'}`
    const cualquiera = `${exposure.vino_id}|${exposure.servicio_fecha}|*`
    if (!map.has(exacta)) map.set(exacta, exposure)
    if (!map.has(cualquiera)) map.set(cualquiera, exposure)
  })
  return map
}

function detalleVentaTPV(linea, exposure) {
  const atribuida = Boolean(exposure?.recommendation_id)
  return {
    resultado: 'vendida',
    fuente: 'tpv',
    outcome_estado: 'vendida_confirmada',
    atribucion_estado: atribuida ? 'atribuida_recomendacion' : 'venta_real_no_atribuida',
    vino_id: linea.vino_id,
    vino: linea.vino_nombre,
    cantidad: numero(linea.cantidad) || 1,
    importe_vino_estimado: redondear(linea.importe, 2),
    precio_unidad: redondear(linea.precio_unitario, 2),
    formato_venta: linea.formato_venta || 'desconocido',
    producto_tpv: linea.producto_original,
    pos_sale_line_id: linea.id,
    pos_import_batch_id: linea.batch_id,
    recommendation_id: exposure?.recommendation_id || null,
    exposure_id: exposure?.id || null,
    match_confidence_pct: redondear(linea.match_confidence_pct, 2),
    servicio_fecha: linea.fecha,
    servicio_tipo: linea.servicio_tipo,
  }
}

async function registrarVentasEstadisticas(restauranteId, lineas) {
  const lineasMatched = lineas.filter(linea => linea.vino_id && ['match', 'manual'].includes(linea.estado_match))
  if (!lineasMatched.length) return { eventos: 0 }

  const exposiciones = await cargarExposiciones(restauranteId, lineasMatched)
  let unidadesAtribuidas = 0
  let unidadesNoAtribuidas = 0
  let lineasAtribuidas = 0
  const eventos = lineasMatched.map(linea => {
    const exposure = exposiciones.get(`${linea.vino_id}|${linea.fecha}|${linea.servicio_tipo}`) ||
      exposiciones.get(`${linea.vino_id}|${linea.fecha}|*`)
    const cantidad = numero(linea.cantidad) || 1
    if (exposure?.recommendation_id) {
      unidadesAtribuidas += cantidad
      lineasAtribuidas += 1
    } else {
      unidadesNoAtribuidas += cantidad
    }
    return {
      restaurante_id: restauranteId,
      tipo: 'venta',
      detalle: JSON.stringify(detalleVentaTPV(linea, exposure)),
      created_at: `${linea.fecha}T12:00:00.000Z`,
    }
  })

  const { data, error } = await supabaseAdmin
    .from('estadisticas')
    .insert(eventos)
    .select('id, restaurante_id, tipo, detalle, created_at')
  if (error) throw error
  const atribucion = await guardarAtribucionDesdeEventos(supabaseAdmin, data || [])
  return {
    eventos: data?.length || 0,
    lineas_atribuidas: lineasAtribuidas,
    ventas_atribuidas: redondear(unidadesAtribuidas, 2),
    ventas_no_atribuidas: redondear(unidadesNoAtribuidas, 2),
    atribucion,
  }
}

async function guardarAliases(restauranteId, lineas) {
  const payload = lineas
    .filter(linea => linea.vino_id && ['match', 'manual'].includes(linea.estado_match))
    .map(linea => ({
      restaurante_id: restauranteId,
      vino_id: linea.vino_id,
      alias: texto(linea.producto_original, 240),
      alias_normalizado: normalizarTexto(linea.producto_original),
      origen: linea.estado_match === 'manual' ? 'tpv_manual' : 'tpv_import',
      activo: true,
      updated_at: new Date().toISOString(),
    }))
    .filter(item => item.alias_normalizado)

  const unicos = Array.from(new Map(payload.map(item => [`${item.alias_normalizado}|${item.vino_id}`, item])).values())
  if (!unicos.length) return { aliases: 0 }
  const { error } = await supabaseAdmin
    .from('wine_aliases')
    .upsert(unicos, { onConflict: 'restaurante_id,alias_normalizado' })
  if (error) throw error
  return { aliases: unicos.length }
}

function lineaParaInsert(linea, restauranteId, batchId) {
  return {
    batch_id: batchId,
    restaurante_id: restauranteId,
    fecha: linea.fecha,
    servicio_tipo: linea.servicio_tipo || 'otro',
    producto_original: texto(linea.producto_original, 240),
    producto_normalizado: texto(linea.producto_normalizado, 240),
    line_hash: linea.line_hash || hashLinea(linea),
    duplicada: Boolean(linea.duplicada),
    duplicate_of: linea.duplicate_of || null,
    cantidad: redondear(linea.cantidad, 2),
    importe: redondear(linea.importe, 2),
    precio_unitario: redondear(linea.precio_unitario, 2),
    vino_id: linea.vino_id || null,
    match_confidence_pct: redondear(linea.match_confidence_pct, 2),
    estado_match: linea.estado_match || 'sin_match',
    formato_venta: linea.formato_venta || 'desconocido',
    raw: linea.raw || {},
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const restauranteId = texto(searchParams.get('restaurante_id'), 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const batchesRes = await leerOpcional(
      supabaseAdmin
        .from('pos_import_batches')
        .select('id, archivo_nombre, estado, filas_total, filas_match, filas_revision, filas_sin_match, filas_duplicadas, importe_total, created_at')
        .eq('restaurante_id', restauranteId)
        .order('created_at', { ascending: false })
        .limit(8)
    )
    return Response.json({ batches: batchesRes.data || [], pending_migration: batchesRes.missing })
  } catch (error) {
    console.error('[pos-import] leer:', error)
    return Response.json({ error: 'No se pudo leer el historial TPV.' }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const restauranteId = texto(body.restaurante_id, 80)
    const auth = await requireRestaurantAccess(req, supabaseAdmin, restauranteId)
    if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

    const action = texto(body.action, 20) || 'preview'
    const fileBase64 = limpiarBase64(body.fileBase64)
    if (!fileBase64) return Response.json({ error: 'Archivo no recibido.' }, { status: 400 })
    if (fileBase64.length > MAX_BASE64_LENGTH) return Response.json({ error: 'Archivo demasiado grande. Usa un CSV/XLSX de hasta 5 MB.' }, { status: 413 })
    const archivoHash = hashArchivo(fileBase64)

    const { rows, columns } = leerFilas(fileBase64)
    if (!rows.length) return Response.json({ error: 'No se detectaron filas en el archivo.' }, { status: 400 })

    const { vinos, aliases, aliasesMissing } = await cargarBase(restauranteId)
    const duplicateFile = await buscarBatchPorHash(restauranteId, archivoHash)
    const preview = await prepararPreview({ restauranteId, rows, columns, mapping: body.mapping || {}, vinos, aliases })
    if (action !== 'confirm') {
      return Response.json({
        ...preview,
        archivo_hash: archivoHash,
        duplicate_file: Boolean(duplicateFile.batch),
        duplicate_batch: duplicateFile.batch || null,
        aliases_pending_migration: aliasesMissing,
        filas: preview.filas.slice(0, 200),
      })
    }

    if (duplicateFile.batch && !body.force_import) {
      return Response.json({
        error: 'Este archivo ya fue importado. Para proteger los KPI, no se ha duplicado.',
        duplicate_file: true,
        duplicate_batch: duplicateFile.batch,
      }, { status: 409 })
    }

    const lineasConOverrides = aplicarOverrides(preview.filas, vinos, body.overrides || {})
    const resumen = resumenFilas(lineasConOverrides)
    const lineasImportables = lineasConOverrides.filter(linea => !linea.duplicada)
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('pos_import_batches')
      .insert({
        restaurante_id: restauranteId,
        archivo_nombre: texto(body.filename, 240) || 'ventas-tpv',
        archivo_tipo: texto(body.mediaType, 120) || null,
        archivo_hash: archivoHash,
        estado: 'importado',
        filas_total: resumen.filas_total,
        filas_match: resumen.filas_match,
        filas_revision: resumen.filas_revision,
        filas_sin_match: resumen.filas_sin_match,
        filas_duplicadas: resumen.filas_duplicadas,
        importe_total: redondear(resumen.importe_total, 2),
        mapping: preview.mapping || {},
        imported_by: auth.user.id,
        imported_by_email: (auth.user.email || '').toLowerCase(),
      })
      .select('id, archivo_nombre, estado, filas_total, filas_match, filas_revision, filas_sin_match, filas_duplicadas, importe_total, created_at')
      .single()
    if (batchError) throw batchError

    let lineasGuardadas = []
    if (lineasImportables.length) {
      const payloadLineas = lineasImportables.map(linea => lineaParaInsert(linea, restauranteId, batch.id))
      const { data: guardadas, error: lineasError } = await supabaseAdmin
        .from('pos_sale_lines')
        .insert(payloadLineas)
        .select('id, batch_id, restaurante_id, fecha, servicio_tipo, producto_original, cantidad, importe, precio_unitario, vino_id, match_confidence_pct, estado_match, formato_venta, line_hash')
      if (lineasError) throw lineasError
      lineasGuardadas = guardadas || []
    }

    const vinoPorId = new Map(vinos.map(vino => [String(vino.id), vino]))
    const lineasParaEventos = (lineasGuardadas || []).map((linea, index) => ({
      ...linea,
      vino_nombre: vinoPorId.get(String(linea.vino_id))?.nombre || lineasImportables[index]?.vino_nombre || '',
    }))

    const [aliasesRes, estadisticasRes] = await Promise.all([
      body.guardar_aliases === false ? Promise.resolve({ aliases: 0 }) : guardarAliases(restauranteId, lineasImportables),
      registrarVentasEstadisticas(restauranteId, lineasParaEventos),
    ])

    return Response.json({
      ok: true,
      batch,
      resumen: {
        ...resumen,
        importe_total: redondear(resumen.importe_total, 2),
      },
      aliases: aliasesRes.aliases || 0,
      eventos_venta: estadisticasRes.eventos || 0,
      lineas_tpv_atribuidas: estadisticasRes.lineas_atribuidas || 0,
      ventas_tpv_atribuidas: estadisticasRes.ventas_atribuidas || 0,
      ventas_tpv_no_atribuidas: estadisticasRes.ventas_no_atribuidas || 0,
      atribucion: estadisticasRes.atribucion || null,
    })
  } catch (error) {
    console.error('[pos-import] guardar:', error)
    return Response.json({ error: 'No se pudo importar el archivo TPV. Revisa la migracion y el formato.' }, { status: 500 })
  }
}
