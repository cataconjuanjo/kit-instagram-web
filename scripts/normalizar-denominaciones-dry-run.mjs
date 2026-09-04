/**
 * Dry-run de normalización DOP/IGP España.
 *
 * SOLO LECTURA — no escribe nada en Supabase.
 *
 * Trabaja por valor único de zona (no fila a fila): agrupa primero,
 * aplica la lógica una vez por valor distinto, luego propaga a todas
 * las filas que comparten ese valor.
 *
 * Prerrequisitos:
 *   1. supabase/normalizar_denominaciones_v1.sql ejecutado
 *   2. scripts/seed-ref-denominaciones-es.mjs ejecutado
 *
 * Uso:
 *   node --env-file=.env.local scripts/normalizar-denominaciones-dry-run.mjs > informe-denominaciones-dry-run.csv
 *
 * CSV → stdout. Resumen por sección → stderr.
 */

import { createClient } from '@supabase/supabase-js'
import { construirMapaDenominaciones, resolverZona } from '../app/lib/normalizarDenominacion.js'
import { splitZonaTipo, sospechaZona } from '../app/lib/normalizarCatalogo.js'

// ── Supabase ────────────────────────────────────────────────────────────────

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

// ── Cargar tabla de referencia ───────────────────────────────────────────────

process.stderr.write('Cargando ref_denominaciones_es...\n')
const { data: refs, error: refsError } = await supabase
  .from('ref_denominaciones_es')
  .select('pais, comunidad_autonoma, tipo, nombre_oficial, nombre_norm')

if (refsError) {
  console.error(`ERROR cargando ref_denominaciones_es: ${refsError.message}`)
  console.error('¿Ejecutaste normalizar_denominaciones_v1.sql y seed-ref-denominaciones-es.mjs?')
  process.exitCode = 1
  process.exit()
}

if (!refs || refs.length === 0) {
  console.error('ERROR: ref_denominaciones_es está vacía. Ejecuta seed-ref-denominaciones-es.mjs primero.')
  process.exitCode = 1
  process.exit()
}

process.stderr.write(`  ${refs.length} denominaciones cargadas\n\n`)
const mapa = construirMapaDenominaciones(refs)

// ── Leer valores distintos de zona con conteo de referencias ─────────────────

process.stderr.write('Leyendo valores distintos de zona en proveedor_catalogo_vinos...\n')

// Supabase no soporta GROUP BY directo en el cliente JS; lo hacemos paginado
// y agrupamos en memoria.
const CHUNK = 1000
let filas = []
let desde = 0

while (true) {
  const { data, error } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('zona')
    .order('zona', { nullsFirst: false })
    .range(desde, desde + CHUNK - 1)

  if (error) {
    console.error(`Error leyendo Supabase: ${error.message}`)
    process.exitCode = 1; process.exit()
  }
  filas = filas.concat(data || [])
  process.stderr.write(`  ${filas.length} filas leídas...\r`)
  if (!data || data.length < CHUNK) break
  desde += CHUNK
}

process.stderr.write(`\nTotal filas: ${filas.length}\n\n`)

// Agrupar por valor de zona
const conteo = new Map()
for (const f of filas) {
  const z = f.zona ?? null
  conteo.set(z, (conteo.get(z) ?? 0) + 1)
}

// Separar NULL (zona no asignada en v1 aún)
const nNull = conteo.get(null) ?? 0
conteo.delete(null)

process.stderr.write(`Valores distintos de zona: ${conteo.size}  (${nNull} filas con zona=NULL — no se tocan)\n\n`)

// ── Aplicar resolverZona por valor único ─────────────────────────────────────

const resultados = []
for (const [zona, nRefs] of conteo.entries()) {
  const res = resolverZona(zona, mapa)
  resultados.push({ zona, nRefs, fuente: 'zona', ...res })
}

// ── Segunda pasada: filas con zona=NULL → usar region como fuente ────────────

process.stderr.write('\nLeyendo filas con zona=NULL y region no nula...\n')

const filasNullZona = []
let desdeNull = 0
while (true) {
  const { data, error } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('region')
    .is('zona', null)
    .not('region', 'is', null)
    .order('region', { nullsFirst: false })
    .range(desdeNull, desdeNull + CHUNK - 1)

  if (error) {
    console.error(`Error leyendo filas zona=NULL: ${error.message}`)
    process.exitCode = 1; process.exit()
  }
  filasNullZona.push(...(data || []))
  if (!data || data.length < CHUNK) break
  desdeNull += CHUNK
}

process.stderr.write(`  ${filasNullZona.length} filas zona=NULL con region\n\n`)

// Agrupar por region (valor bruto), luego derivar zona candidata
const conteoRegion = new Map()
for (const f of filasNullZona) {
  const r = f.region ?? null
  if (r) conteoRegion.set(r, (conteoRegion.get(r) ?? 0) + 1)
}

for (const [regionRaw, nRefs] of conteoRegion.entries()) {
  const { zona: z } = splitZonaTipo(regionRaw)
  if (!z || sospechaZona(z)) {
    resultados.push({
      zona: regionRaw, nRefs, fuente: 'region',
      pais: null, comunidad_autonoma: null, do_igp: null,
      confianza: 'no_es_zona', motivo: `zona=NULL, region sospechosa o vacía tras split: "${regionRaw}"`,
      zona_revisar: true,
    })
    continue
  }
  const res = resolverZona(z, mapa)
  resultados.push({ zona: regionRaw, nRefs, fuente: 'region', ...res })
}

// ── Ordenar: primero exactos, luego contención, luego ccaa/pais, luego especiales, luego sin resolver
const ORDEN_CONFIANZA = {
  exacto: 0, contencion: 1, ccaa_sin_do: 2, pais_sin_ccaa: 3,
  fuera_de_ambito: 4, caso_especial: 5, no_es_zona: 6, sin_resolver: 7,
}
resultados.sort((a, b) =>
  (ORDEN_CONFIANZA[a.confianza] ?? 9) - (ORDEN_CONFIANZA[b.confianza] ?? 9) ||
  b.nRefs - a.nRefs
)

// ── CSV (stdout) ─────────────────────────────────────────────────────────────

function csvEsc(val) {
  const s = String(val ?? '')
  return (s.includes('"') || s.includes(',') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s
}

process.stdout.write('zona_original,n_referencias,fuente,pais_prop,ccaa_prop,do_igp_prop,confianza,motivo\n')

for (const r of resultados) {
  process.stdout.write([
    csvEsc(r.zona),
    r.nRefs,
    r.fuente,
    csvEsc(r.pais ?? ''),
    csvEsc(r.comunidad_autonoma ?? ''),
    csvEsc(r.do_igp ?? ''),
    r.confianza,
    csvEsc(r.motivo),
  ].join(',') + '\n')
}

// ── Resumen por sección (stderr) ─────────────────────────────────────────────

const g = (confianza, fuente) =>
  resultados.filter(r => r.confianza === confianza && (!fuente || r.fuente === fuente))

const grupos = {
  exacto:         g('exacto'),
  contencion:     g('contencion'),
  ccaa_sin_do:    g('ccaa_sin_do'),
  pais_sin_ccaa:  g('pais_sin_ccaa'),
  fuera_de_ambito:g('fuera_de_ambito'),
  caso_especial:  g('caso_especial'),
  no_es_zona:     g('no_es_zona'),
  sin_resolver:   g('sin_resolver'),
}

const totalRefs = r => r.reduce((s, x) => s + x.nRefs, 0)

const nulasConRegion = filasNullZona.length
const nSinRegionYSinZona = nNull - nulasConRegion

process.stderr.write('\n════════════════════════════════════════════════════════\n')
process.stderr.write('RESUMEN DRY-RUN — normalización DOP/IGP España\n')
process.stderr.write('════════════════════════════════════════════════════════\n')
process.stderr.write(`Total filas en catálogo           : ${filas.length}\n`)
process.stderr.write(`  zona = NULL, sin region          : ${nSinRegionYSinZona} (intocables)\n`)
process.stderr.write(`  zona = NULL, region disponible   : ${nulasConRegion} (backfill desde region)\n`)
process.stderr.write(`Valores distintos de zona          : ${conteo.size}\n`
  + `Valores distintos de region (zona=NULL): ${conteoRegion.size}\n`)

const fz = f => f.fuente === 'zona'
const fr = f => f.fuente === 'region'

process.stderr.write(`\n── APLICA AUTOMÁTICAMENTE (fuente=zona) ────────────────\n`)
process.stderr.write(`Exacto         : ${grupos.exacto.filter(fz).length} valores · ${totalRefs(grupos.exacto.filter(fz))} refs\n`)
process.stderr.write(`CCAA sin DOP   : ${grupos.ccaa_sin_do.filter(fz).length} valores · ${totalRefs(grupos.ccaa_sin_do.filter(fz))} refs\n`)
process.stderr.write(`País sin CCAA  : ${grupos.pais_sin_ccaa.filter(fz).length} valores · ${totalRefs(grupos.pais_sin_ccaa.filter(fz))} refs\n`)
process.stderr.write(`\n── APLICA AUTOMÁTICAMENTE (backfill desde region) ──────\n`)
process.stderr.write(`Exacto         : ${grupos.exacto.filter(fr).length} valores · ${totalRefs(grupos.exacto.filter(fr))} refs\n`)
process.stderr.write(`CCAA sin DOP   : ${grupos.ccaa_sin_do.filter(fr).length} valores · ${totalRefs(grupos.ccaa_sin_do.filter(fr))} refs\n`)
process.stderr.write(`País sin CCAA  : ${grupos.pais_sin_ccaa.filter(fr).length} valores · ${totalRefs(grupos.pais_sin_ccaa.filter(fr))} refs\n`)

process.stderr.write(`\n── REVISAR ANTES DE APLICAR ────────────────────────────\n`)
process.stderr.write(`Contención     : ${grupos.contencion.length} valores · ${totalRefs(grupos.contencion)} refs\n`)

if (grupos.contencion.length) {
  for (const r of grupos.contencion) {
    process.stderr.write(`  [${r.fuente}] "${r.zona}" (${r.nRefs} refs) → ${r.do_igp ?? r.comunidad_autonoma}  [${r.motivo}]\n`)
  }
}

process.stderr.write(`\n── NO SE TOCAN (fuera de ámbito España) ────────────────\n`)
process.stderr.write(`Fuera de ámbito: ${grupos.fuera_de_ambito.length} valores · ${totalRefs(grupos.fuera_de_ambito)} refs\n`)

process.stderr.write(`\n── PARA REVISIÓN MANUAL ────────────────────────────────\n`)
process.stderr.write(`Sin resolver   : ${grupos.sin_resolver.length} valores · ${totalRefs(grupos.sin_resolver)} refs\n`)
if (grupos.sin_resolver.length) {
  for (const r of grupos.sin_resolver) {
    process.stderr.write(`  [${r.fuente}] "${r.zona}" (${r.nRefs} refs)\n`)
  }
}

process.stderr.write(`\n── CASOS ESPECIALES SECTOR (no DOP oficial) ────────────\n`)
process.stderr.write(`Caso especial  : ${grupos.caso_especial.length} valores · ${totalRefs(grupos.caso_especial)} refs\n`)
if (grupos.caso_especial.length) {
  for (const r of grupos.caso_especial) {
    process.stderr.write(`  "${r.zona}" (${r.nRefs} refs)\n`)
  }
}

process.stderr.write(`\n── TEXTO NO GEOGRÁFICO ─────────────────────────────────\n`)
process.stderr.write(`No es zona     : ${grupos.no_es_zona.length} valores · ${totalRefs(grupos.no_es_zona)} refs\n`)
if (grupos.no_es_zona.length) {
  for (const r of grupos.no_es_zona) {
    process.stderr.write(`  "${r.zona}" (${r.nRefs} refs)\n`)
  }
}

process.stderr.write(`\n════════════════════════════════════════════════════════\n`)
process.stderr.write('CSV escrito en stdout. Revisa antes de ejecutar el apply.\n')
process.stderr.write('Los matches por CONTENCIÓN requieren revisión explícita.\n')
process.stderr.write('════════════════════════════════════════════════════════\n')
