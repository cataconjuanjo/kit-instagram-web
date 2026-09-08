/**
 * Dry-run / apply de normalización de TIPO y ZONA en proveedor_catalogo_vinos.
 *
 * SOLO LECTURA por defecto. Pasa --apply para escribir cambios en Supabase.
 *
 * Outputs:
 *   stdout          → CSV principal (id, proveedor, nombre, tipo_origen,
 *                     tipo_normalizado, zona_origen, zona_normalizada, accion)
 *   informe-encoding.csv → Filas donde repararMojibake cambió algo
 *
 * Uso:
 *   node --env-file=.env.local scripts/normalizar-tipos-dry-run.mjs           > informe-tipos.csv
 *   node --env-file=.env.local scripts/normalizar-tipos-dry-run.mjs --apply   > informe-tipos-applied.csv
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { normalizarTipo, normalizarZona, TIPOS_AMBIGUOS } from '../app/lib/normalizarTipo.js'

const APPLY = process.argv.includes('--apply')
const DIR   = path.resolve(import.meta.dirname || process.cwd())

// ── Tipos que son NO vino — no se mapean y se reportan aparte ───────────────
const NO_VINO_TIPO_NORM = new Set([
  'destilado/licor', 'licor', 'aove', 'orujos', 'amaro',
  'destilado', 'aceite', 'aceite de oliva',
])

function esNoVino(rawTipo) {
  if (!rawTipo) return false
  const n = String(rawTipo).trim().toLowerCase()
  return NO_VINO_TIPO_NORM.has(n)
}

// ── repararMojibake (igual que app/api/admin/proveedores/route.js) ───────────
function repararMojibake(valor) {
  if (!valor || !/[ÃÂâ]/.test(valor)) return valor
  const w1252 = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86,
    '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
    'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
    '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
    'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
  }
  const bytes = Uint8Array.from(Array.from(valor).map(c => {
    const code = c.charCodeAt(0)
    return w1252[c] ?? (code <= 255 ? code : code & 255)
  }))
  const reparado = new TextDecoder('utf-8').decode(bytes)
  return reparado.includes('�') ? valor : reparado
}

// ── Supabase ─────────────────────────────────────────────────────────────────
const supabaseUrl = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  process.stderr.write('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY\n')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Lectura paginada ─────────────────────────────────────────────────────────
async function leerTodo() {
  const CHUNK = 1000
  let filas = [], desde = 0
  process.stderr.write('Leyendo proveedor_catalogo_vinos...\n')
  while (true) {
    const { data, error } = await supabase
      .from('proveedor_catalogo_vinos')
      .select('id, proveedor_id, nombre, tipo, tipo_raw, region, zona, proveedores_vino(nombre)')
      .order('id')
      .range(desde, desde + CHUNK - 1)
    if (error) { process.stderr.write(`Error: ${error.message}\n`); process.exit(1) }
    filas = filas.concat(data || [])
    process.stderr.write(`  ${filas.length} filas...\r`)
    if (!data || data.length < CHUNK) break
    desde += CHUNK
  }
  process.stderr.write(`\nTotal: ${filas.length} filas\n\n`)
  return filas
}

// ── Aplicar en lotes ─────────────────────────────────────────────────────────
async function aplicarLote(cambios) {
  const LOTE = 200
  let n = 0
  for (let i = 0; i < cambios.length; i += LOTE) {
    const lote = cambios.slice(i, i + LOTE)
    await Promise.all(lote.map(c =>
      supabase.from('proveedor_catalogo_vinos')
        .update({ ...c.update, updated_at: new Date().toISOString() })
        .eq('id', c.id)
    ))
    n += lote.length
    process.stderr.write(`  Aplicados ${n} / ${cambios.length}\r`)
  }
  process.stderr.write('\n')
}

// ── CSV helper ────────────────────────────────────────────────────────────────
function esc(val) {
  const s = String(val ?? '')
  return (s.includes('"') || s.includes(',') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s
}

// ── Main ──────────────────────────────────────────────────────────────────────
const filas = await leerTodo()

const stats = {
  total: filas.length,
  sin_cambio: 0, normalizado: 0, normalizada_zona: 0,
  sin_mapeo: 0, ambiguo: 0, no_vino: 0, encoding_reparado: 0,
}

const paraAplicar = []
const encodingRows = []  // para informe-encoding.csv

process.stdout.write(
  'id,proveedor,nombre,tipo_origen,tipo_normalizado,zona_origen,zona_normalizada,accion\n'
)

for (const fila of filas) {
  const prov = fila.proveedores_vino?.nombre || fila.proveedor_id

  // ── 1. Reparar encoding ────────────────────────────────────────────────────
  const tipoDb   = fila.tipo   || ''
  const zonaDb   = fila.zona   || fila.region || ''
  const tipoRep  = repararMojibake(tipoDb)
  const zonaRep  = repararMojibake(zonaDb)

  const tipoEncCambiado = tipoRep !== tipoDb
  const zonaEncCambiada = zonaRep !== zonaDb

  if (tipoEncCambiado) {
    stats.encoding_reparado++
    encodingRows.push({ id: fila.id, prov, nombre: fila.nombre, campo: 'tipo', antes: tipoDb, despues: tipoRep })
  }
  if (zonaEncCambiada) {
    encodingRows.push({ id: fila.id, prov, nombre: fila.nombre, campo: 'zona', antes: zonaDb, despues: zonaRep })
  }

  // ── 2. No-vino (antes de normalizar) ──────────────────────────────────────
  if (esNoVino(tipoRep)) {
    stats.no_vino++
    process.stdout.write(
      [esc(fila.id), esc(prov), esc(fila.nombre),
       esc(tipoDb), '', esc(zonaDb), '', 'no_vino'].join(',') + '\n'
    )
    continue
  }

  // ── 3. Normalizar tipo ────────────────────────────────────────────────────
  const tipoOrigen  = fila.tipo_raw || tipoRep || ''
  const tipoCanonico = tipoOrigen ? normalizarTipo(tipoOrigen) : null
  const esAmbiguo = Object.keys(TIPOS_AMBIGUOS).some(k => tipoOrigen.toLowerCase().includes(k))

  let accionTipo
  let tipoNuevo    = fila.tipo
  let tipoRawNuevo = fila.tipo_raw

  if (esAmbiguo) {
    accionTipo = 'ambiguo'; stats.ambiguo++
  } else if (!tipoCanonico && tipoOrigen) {
    accionTipo = 'sin_mapeo'; stats.sin_mapeo++
  } else if (tipoCanonico && tipoCanonico !== fila.tipo) {
    accionTipo = 'normalizado'; stats.normalizado++
    tipoNuevo    = tipoCanonico
    tipoRawNuevo = tipoRawNuevo || (tipoEncCambiado ? tipoDb : fila.tipo)
  } else {
    accionTipo = 'sin_cambio'; stats.sin_cambio++
  }

  // ── 4. Normalizar zona ────────────────────────────────────────────────────
  const zonaOrigen = zonaRep || ''
  const { display: zonaDisplay } = normalizarZona(zonaOrigen)
  const zonaEsCambiada = zonaDisplay && zonaDisplay !== zonaOrigen
  if (zonaEsCambiada) stats.normalizada_zona++

  // ── 5. CSV principal ──────────────────────────────────────────────────────
  const accionFinal = accionTipo !== 'sin_cambio'
    ? accionTipo
    : zonaEsCambiada ? 'normalizada' : 'sin_cambio'

  process.stdout.write(
    [esc(fila.id), esc(prov), esc(fila.nombre),
     esc(tipoOrigen), esc(tipoCanonico || ''),
     esc(zonaOrigen), esc(zonaDisplay || ''),
     esc(accionFinal)].join(',') + '\n'
  )

  // ── 6. Acumular para --apply (solo cambios seguros) ───────────────────────
  if (APPLY && (accionTipo === 'normalizado' || zonaEsCambiada || tipoEncCambiado || zonaEncCambiada)) {
    const update = {}
    if (accionTipo === 'normalizado' || tipoEncCambiado) {
      update.tipo     = tipoNuevo
      update.tipo_raw = tipoRawNuevo || null
    }
    if (zonaEsCambiada) update.zona = zonaDisplay
    else if (zonaEncCambiada) update.zona = zonaRep
    paraAplicar.push({ id: fila.id, update })
  }
}

// ── Escribir informe-encoding.csv ────────────────────────────────────────────
const encPath = path.join(DIR, 'informe-encoding.csv')
const encLines = ['id,proveedor,nombre,campo,valor_original,valor_reparado\n',
  ...encodingRows.map(r =>
    [esc(r.id), esc(r.prov), esc(r.nombre), esc(r.campo), esc(r.antes), esc(r.despues)].join(',') + '\n'
  )
]
fs.writeFileSync(encPath, encLines.join(''), 'utf-8')

// ── Resumen stderr ────────────────────────────────────────────────────────────
process.stderr.write('\n════════════════════════════════════════\n')
process.stderr.write(`RESUMEN — tipo y zona\n`)
process.stderr.write('────────────────────────────────────────\n')
process.stderr.write(`Total filas              : ${stats.total}\n`)
process.stderr.write(`Sin cambio               : ${stats.sin_cambio}\n`)
process.stderr.write(`Tipo normalizado         : ${stats.normalizado}\n`)
process.stderr.write(`Zona normalizada (solo)  : ${stats.normalizada_zona}\n`)
process.stderr.write(`Sin mapeo (manual)       : ${stats.sin_mapeo}\n`)
process.stderr.write(`Ambiguo (moscatel…)      : ${stats.ambiguo}\n`)
process.stderr.write(`No-vino (excluido)       : ${stats.no_vino}\n`)
process.stderr.write(`Encoding reparado        : ${stats.encoding_reparado}\n`)
process.stderr.write(`Informe encoding         : ${encPath}\n`)
if (stats.encoding_reparado > 0) {
  process.stderr.write('\n⚠  Revisa informe-encoding.csv antes de comunicar resultados.\n')
}
if (APPLY) {
  if (!paraAplicar.length) {
    process.stderr.write('\nNada que aplicar.\n')
  } else {
    process.stderr.write(`\nAplicando ${paraAplicar.length} cambios...\n`)
    await aplicarLote(paraAplicar)
    process.stderr.write(`✓ ${paraAplicar.length} filas actualizadas.\n`)
  }
} else {
  process.stderr.write('\n[Dry-run] Pasa --apply para escribir los cambios.\n')
}
process.stderr.write('════════════════════════════════════════\n')
