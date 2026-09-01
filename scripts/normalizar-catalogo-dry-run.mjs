/**
 * Dry-run de normalización del catálogo de proveedores.
 *
 * SOLO LECTURA — no escribe nada en Supabase.
 *
 * Uso:
 *   node --env-file=.env.local scripts/normalizar-catalogo-dry-run.mjs > informe-normalizacion.csv
 *
 * El CSV se escribe en stdout; los mensajes de progreso y resumen van a stderr.
 */

import { createClient } from '@supabase/supabase-js'
import { titleCaseNombre } from '../app/lib/normalizarNombre.js'
import { splitZonaTipo, sospechaZona, splitFormato } from '../app/lib/normalizarCatalogo.js'

// ── Supabase ────────────────────────────────────────────────────────────────
// .env.local puede tener un BOM al inicio del primer nombre de clave;
// buscamos la URL por nombre limpio ignorando el BOM.
const supabaseUrl = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  process.stderr.write('ERROR: Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY\n')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Lectura paginada ────────────────────────────────────────────────────────

async function leerTodo() {
  const CHUNK = 1000
  let filas = []
  let desde = 0

  process.stderr.write('Leyendo filas de proveedor_catalogo_vinos...\n')

  while (true) {
    const { data, error } = await supabase
      .from('proveedor_catalogo_vinos')
      .select('id, nombre, region, tipo, formato, referencia, proveedor_id')
      .order('id')
      .range(desde, desde + CHUNK - 1)

    if (error) {
      process.stderr.write(`Error leyendo Supabase: ${error.message}\n`)
      process.exit(1)
    }

    filas = filas.concat(data || [])
    process.stderr.write(`  ${filas.length} filas leídas...\r`)

    if (!data || data.length < CHUNK) break
    desde += CHUNK
  }

  process.stderr.write(`\nTotal leídas: ${filas.length} filas\n\n`)
  return filas
}

// ── Transformaciones ────────────────────────────────────────────────────────

function procesarNombre(id, nombre) {
  if (!nombre) return []
  const nuevo = titleCaseNombre(nombre)
  if (nuevo === nombre) return []
  return [{ id, campo: 'nombre', valor_original: nombre, valor_nuevo: nuevo, estado: 'OK' }]
}

function procesarRegion(id, region, tipoActual) {
  if (!region) return []
  const { zona, tipo: tipoExtraido, revisarAnada } = splitZonaTipo(region)
  const sospecha = sospechaZona(zona)
  const estado = sospecha
    ? 'REVISAR_ZONA'
    : revisarAnada
      ? 'REVISAR_ZONA — posible añada en vez de tipo'
      : 'OK'
  const cambios = []

  if (zona !== region.trim() || tipoExtraido || revisarAnada) {
    cambios.push({
      id,
      campo: 'region→zona',
      valor_original: region,
      valor_nuevo: zona,
      estado,
    })
    if (tipoExtraido && tipoExtraido.toLowerCase() !== (tipoActual || '').toLowerCase()) {
      cambios.push({
        id,
        campo: 'region→tipo',
        valor_original: tipoActual || '(vacío)',
        valor_nuevo: tipoExtraido,
        estado,
      })
    }
  }

  return cambios
}

function procesarFormato(id, formato) {
  if (!formato) return []
  const r = splitFormato(formato)

  const hayExtraccion =
    r.tamanyo !== formato ||
    r.unidades_por_caja !== null ||
    r.referencia_proveedor ||
    r.almacen_proveedor ||
    r.graduacion

  if (!hayExtraccion) return []

  const estadoBase = r.revisar ? 'REVISAR_FORMATO' : 'OK'
  const estado = r.revisar && r.revisarMsg
    ? `${estadoBase} — ${r.revisarMsg}`
    : estadoBase

  const partes = [
    `tamanyo="${r.tamanyo}"`,
    `uds=${r.unidades_por_caja ?? '—'}`,
    `ref="${r.referencia_proveedor}"`,
  ]
  if (r.graduacion)        partes.push(`graduacion="${r.graduacion}"`)
  if (r.almacen_proveedor) partes.push(`almacen="${r.almacen_proveedor}"`)

  return [{
    id,
    campo: 'formato',
    valor_original: formato,
    valor_nuevo: partes.join(' | '),
    estado,
  }]
}

// ── Escaping CSV (RFC 4180) ─────────────────────────────────────────────────

function csvEsc(val) {
  const s = String(val ?? '')
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

// ── Main ────────────────────────────────────────────────────────────────────

const filas = await leerTodo()

let totalCambios = 0
let contOK = 0
let contRevisarZona = 0
let contRevisarFormato = 0

process.stdout.write('id,campo,valor_original,valor_nuevo,estado\n')

for (const fila of filas) {
  const cambios = [
    ...procesarNombre(fila.id, fila.nombre),
    ...procesarRegion(fila.id, fila.region, fila.tipo),
    ...procesarFormato(fila.id, fila.formato),
  ]

  for (const c of cambios) {
    process.stdout.write(
      [c.id, c.campo, csvEsc(c.valor_original), csvEsc(c.valor_nuevo), csvEsc(c.estado)]
        .join(',') + '\n'
    )
    totalCambios++
    if (c.estado.startsWith('REVISAR_ZONA'))    contRevisarZona++
    else if (c.estado.startsWith('REVISAR_FORMATO')) contRevisarFormato++
    else contOK++
  }
}

process.stderr.write(`\n════════════════════════════════════════\n`)
process.stderr.write(`RESUMEN DEL DRY-RUN (v2)\n`)
process.stderr.write(`────────────────────────────────────────\n`)
process.stderr.write(`Filas leídas de Supabase : ${filas.length}\n`)
process.stderr.write(`Cambios detectados       : ${totalCambios}\n`)
process.stderr.write(`  OK (aplicar directo)   : ${contOK}\n`)
process.stderr.write(`  REVISAR_ZONA           : ${contRevisarZona}\n`)
process.stderr.write(`  REVISAR_FORMATO        : ${contRevisarFormato}\n`)
process.stderr.write(`════════════════════════════════════════\n`)
