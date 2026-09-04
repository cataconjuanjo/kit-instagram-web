/**
 * Apply: actualiza pais / comunidad_autonoma / do_igp / zona_revisar
 * en proveedor_catalogo_vinos para los vinos españoles.
 *
 * SOLO EJECUTAR TRAS REVISAR EL CSV DEL DRY-RUN Y CONFIRMAR CON EL USUARIO.
 *
 * Qué hace:
 *   - Carga ref_denominaciones_es de Supabase.
 *   - Lee todos los valores distintos de zona y aplica resolverZona().
 *   - Aplica el mapeo a las filas del catálogo en lotes de 200 (UPDATE por zona,
 *     no fila a fila) usando zona como clave de agrupación.
 *   - NO modifica la columna zona legada.
 *   - NO toca filas con zona = NULL.
 *   - NO toca filas con confianza 'fuera_de_ambito' (fuera del alcance España).
 *   - Filas sin_resolver / caso_especial / no_es_zona: zona_revisar = true,
 *     pais/ccaa/do_igp quedan NULL (no inventa nada).
 *
 * Prerrequisitos:
 *   1. supabase/normalizar_denominaciones_v1.sql ejecutado
 *   2. scripts/seed-ref-denominaciones-es.mjs ejecutado
 *   3. Dry-run revisado y confirmado
 *
 * Uso:
 *   node --env-file=.env.local scripts/normalizar-denominaciones-apply.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { construirMapaDenominaciones, resolverZona } from '../app/lib/normalizarDenominacion.js'
import { splitZonaTipo, sospechaZona } from '../app/lib/normalizarCatalogo.js'

// ── Supabase ────────────────────────────────────────────────────────────────

const supabaseUrl = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
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

if (refsError || !refs?.length) {
  console.error('ERROR: ref_denominaciones_es vacía o inaccesible.', refsError?.message ?? '')
  console.error('Ejecuta primero: scripts/seed-ref-denominaciones-es.mjs')
  process.exit(1)
}

process.stderr.write(`  ${refs.length} denominaciones cargadas\n\n`)
const mapa = construirMapaDenominaciones(refs)

// ── Leer todos los valores distintos de zona con conteo ──────────────────────

process.stderr.write('Leyendo filas de proveedor_catalogo_vinos...\n')

const CHUNK = 1000
let filas = []
let desde = 0
while (true) {
  const { data, error } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('id, zona')
    .order('id')
    .range(desde, desde + CHUNK - 1)

  if (error) { console.error('Error leyendo:', error.message); process.exit(1) }
  filas = filas.concat(data || [])
  process.stderr.write(`  ${filas.length} filas leídas...\r`)
  if (!data || data.length < CHUNK) break
  desde += CHUNK
}

process.stderr.write(`\nTotal: ${filas.length} filas\n\n`)

// ── Calcular mapeo zona → resultado (una vez por valor único) ────────────────

const mapaZona = new Map()  // zona_text → resultado resolverZona
const agrupadoPorZona = new Map()  // zona_text → [ids]

for (const f of filas) {
  const z = f.zona ?? null
  if (z === null) continue  // zona=NULL: sin tocar

  if (!mapaZona.has(z)) {
    mapaZona.set(z, resolverZona(z, mapa))
    agrupadoPorZona.set(z, [])
  }
  agrupadoPorZona.get(z).push(f.id)
}

// ── Filtrar qué se aplica ────────────────────────────────────────────────────
// fuera_de_ambito → skip (no son zonas españolas, esta fase no las toca)
// Para el resto: asignamos pais/ccaa/do_igp y zona_revisar según confianza

const conts = {
  exacto: 0, contencion: 0, ccaa_sin_do: 0, pais_sin_ccaa: 0,
  sin_resolver: 0, caso_especial: 0, no_es_zona: 0,
  fuera_de_ambito_skip: 0, zona_null_skip: 0,
}

// Construir lista de UPDATE a aplicar (agrupados por zona para eficiencia)
// UPDATE en Supabase vía cliente JS requiere filtrar por id; agrupamos por
// el patch resultante para hacer un UPDATE...IN (ids del mismo grupo).
// Máximo 200 ids por lote.

const LOTE_IDS = 200
let filasActualizadas = 0

process.stderr.write('Aplicando updates...\n')

for (const [zona, res] of mapaZona.entries()) {
  if (res.confianza === 'fuera_de_ambito') {
    conts.fuera_de_ambito_skip += agrupadoPorZona.get(zona).length
    continue
  }

  const ids = agrupadoPorZona.get(zona)
  conts[res.confianza] = (conts[res.confianza] ?? 0) + 1

  const patch = {
    pais:               res.pais ?? null,
    comunidad_autonoma: res.comunidad_autonoma ?? null,
    do_igp:             res.do_igp ?? null,
    zona_revisar:       res.zona_revisar,
    updated_at:         new Date().toISOString(),
  }

  // Aplicar en sublotes de LOTE_IDS
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const sublote = ids.slice(i, i + LOTE_IDS)
    const { error } = await supabase
      .from('proveedor_catalogo_vinos')
      .update(patch)
      .in('id', sublote)

    if (error) {
      console.error(`\nERROR actualizando zona "${zona}":`, error.message)
      console.error('El script se detiene. Puedes relanzarlo: las filas ya escritas no se vuelven a tocar.')
      process.exit(1)
    }
    filasActualizadas += sublote.length
    process.stderr.write(`  ${filasActualizadas} filas escritas...\r`)
  }
}

// ── Backfill: filas con zona=NULL y region disponible ────────────────────────
// Para cada región distinta: extraer zona candidata con splitZonaTipo,
// luego resolverZona para obtener pais/ccaa/do_igp.
// Actualiza: zona, zona_original (ambos = z extraída), pais, ccaa, do_igp, zona_revisar.
// fuera_de_ambito: también se actualiza (zona_original = z; pais/ccaa/do_igp quedan NULL).

process.stderr.write('\n\nBackfill de filas zona=NULL...\n')

// Leer solo id y region para las filas con zona=NULL y region no nula
const filasBackfill = []
let desdeB = 0
while (true) {
  const { data, error } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('id, region')
    .is('zona', null)
    .not('region', 'is', null)
    .order('id')
    .range(desdeB, desdeB + CHUNK - 1)

  if (error) { console.error('Error leyendo backfill:', error.message); process.exit(1) }
  filasBackfill.push(...(data || []))
  if (!data || data.length < CHUNK) break
  desdeB += CHUNK
}

process.stderr.write(`  ${filasBackfill.length} filas zona=NULL con region\n`)

// Agrupar por region bruta → { ids, z_candidata, resultado }
const mapaRegion = new Map()   // regionRaw → { ids, z, res }

for (const f of filasBackfill) {
  const reg = f.region
  if (!mapaRegion.has(reg)) {
    const { zona: z } = splitZonaTipo(reg)
    let res = null
    if (z && !sospechaZona(z)) {
      res = resolverZona(z, mapa)
    }
    mapaRegion.set(reg, { ids: [], z: z || reg, res })
  }
  mapaRegion.get(reg).ids.push(f.id)
}

const contsB = { actualizadas: 0, sospechosas_skip: 0 }

for (const [, { ids, z, res }] of mapaRegion.entries()) {
  if (!res) {
    // zona sospechosa → zona_original = z, zona_revisar = true, resto NULL
    contsB.sospechosas_skip += ids.length
    for (let i = 0; i < ids.length; i += LOTE_IDS) {
      const sublote = ids.slice(i, i + LOTE_IDS)
      const { error } = await supabase
        .from('proveedor_catalogo_vinos')
        .update({ zona: z, zona_original: z, pais: null, comunidad_autonoma: null, do_igp: null, zona_revisar: true, updated_at: new Date().toISOString() })
        .in('id', sublote)
      if (error) { console.error('Error backfill sospechosa:', error.message); process.exit(1) }
    }
    continue
  }

  const patch = {
    zona:               z,
    zona_original:      z,
    pais:               res.pais ?? null,
    comunidad_autonoma: res.comunidad_autonoma ?? null,
    do_igp:             res.do_igp ?? null,
    zona_revisar:       res.zona_revisar,
    updated_at:         new Date().toISOString(),
  }

  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const sublote = ids.slice(i, i + LOTE_IDS)
    const { error } = await supabase
      .from('proveedor_catalogo_vinos')
      .update(patch)
      .in('id', sublote)
    if (error) { console.error('Error backfill:', error.message); process.exit(1) }
    contsB.actualizadas += sublote.length
    filasActualizadas += sublote.length
    process.stderr.write(`  ${filasActualizadas} filas escritas (total)...\r`)
  }
}

process.stderr.write(`\n  Backfill: ${contsB.actualizadas} filas actualizadas, ${contsB.sospechosas_skip} con zona sospechosa (zona_revisar=true)\n`)

// ── Resumen ─────────────────────────────────────────────────────────────────

process.stderr.write(`\n\n════════════════════════════════════════════════════════\n`)
process.stderr.write(`APPLY completado\n`)
process.stderr.write(`════════════════════════════════════════════════════════\n`)
process.stderr.write(`Filas totales leídas   : ${filas.length + filasBackfill.length}\n`)
process.stderr.write(`  con zona no-nula     : ${filas.length}\n`)
process.stderr.write(`  zona=NULL backfill   : ${filasBackfill.length}\n`)
process.stderr.write(`Filas actualizadas     : ${filasActualizadas}\n`)
process.stderr.write(`Fuera de ámbito (skip) : ${conts.fuera_de_ambito_skip} refs\n`)
process.stderr.write(`\nDesglose zona (fuente=zona):\n`)
process.stderr.write(`  exacto         : ${conts.exacto} valores únicos\n`)
process.stderr.write(`  contencion     : ${conts.contencion} valores únicos\n`)
process.stderr.write(`  ccaa_sin_do    : ${conts.ccaa_sin_do} valores únicos\n`)
process.stderr.write(`  pais_sin_ccaa  : ${conts.pais_sin_ccaa} valores únicos\n`)
process.stderr.write(`  sin_resolver   : ${conts.sin_resolver} valores únicos → zona_revisar=true\n`)
process.stderr.write(`  caso_especial  : ${conts.caso_especial} valores únicos → zona_revisar=true\n`)
process.stderr.write(`  no_es_zona     : ${conts.no_es_zona} valores únicos → zona_revisar=true\n`)
process.stderr.write(`\nDesglose backfill (fuente=region):\n`)
process.stderr.write(`  actualizadas   : ${contsB.actualizadas} filas\n`)
process.stderr.write(`  sospechosas    : ${contsB.sospechosas_skip} filas → zona_revisar=true\n`)
process.stderr.write(`════════════════════════════════════════════════════════\n`)
process.stderr.write(`\nSiguientes pasos:\n`)
process.stderr.write(`  - Consulta zona_revisar=true en el admin para revisar manualmente.\n`)
process.stderr.write(`  - La columna zona fue actualizada en las filas de backfill (antes NULL).\n`)
process.stderr.write(`  - zona_original refleja el valor derivado de region para las filas de backfill.\n`)
process.stderr.write(`════════════════════════════════════════════════════════\n`)
