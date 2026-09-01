/**
 * Recalcula nombre para las filas donde nombre_raw contiene un ordinal
 * (er, nd, rd, th) que se normalizó mal antes del fix de titleCaseNombre().
 *
 * - Lee desde nombre_raw (no de nombre) para evitar encadenamiento de transformaciones.
 * - Solo actualiza filas donde el nombre recalculado difiere del actual.
 *
 * Uso: node --env-file=.env.local scripts/fix-ordinales-nombres.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { titleCaseNombre } from '../app/lib/normalizarNombre.js'

const supabaseUrl = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: Faltan variables NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const RE_ORDINAL = /\d+(er|nd|rd|th)\b/i

// ── Leer todas las filas con nombre_raw no nulo ─────────────────────────────

process.stderr.write('Leyendo filas con nombre_raw...\n')
let filas = [], desde = 0
while (true) {
  const { data, error } = await supabase
    .from('proveedor_catalogo_vinos')
    .select('id, nombre, nombre_raw')
    .not('nombre_raw', 'is', null)
    .order('id')
    .range(desde, desde + 999)
  if (error) { console.error(error.message); process.exit(1) }
  filas = filas.concat(data || [])
  if (!data || data.length < 1000) break
  desde += 1000
}
process.stderr.write(`  ${filas.length} filas con nombre_raw\n`)

// ── Filtrar las que tienen ordinal en nombre_raw ────────────────────────────

const conOrdinal = filas.filter(r => RE_ORDINAL.test(r.nombre_raw))
process.stderr.write(`  ${conOrdinal.length} filas con ordinal en nombre_raw\n\n`)

if (!conOrdinal.length) {
  process.stderr.write('Nada que corregir.\n')
  process.exit(0)
}

// ── Calcular los que realmente cambian ──────────────────────────────────────

const patches = []
for (const r of conOrdinal) {
  const nombreCorregido = titleCaseNombre(r.nombre_raw)
  if (nombreCorregido !== r.nombre) {
    patches.push({ id: r.id, nombre: nombreCorregido, nombre_raw_actual: r.nombre_raw, nombre_antes: r.nombre })
  }
}

process.stderr.write(`Filas a corregir (nombre cambia): ${patches.length}\n`)
if (!patches.length) {
  process.stderr.write('El nombre ya era correcto en todas. Fix ya aplicado previamente.\n')
  process.exit(0)
}

// Mostrar muestra
process.stderr.write('\nMuestra (máx 10):\n')
patches.slice(0, 10).forEach(p => {
  process.stderr.write(`  [${p.id}] "${p.nombre_antes}" → "${p.nombre}"\n`)
})

// ── Aplicar en batches de 100 ───────────────────────────────────────────────

const BATCH = 100
const now = new Date().toISOString()
let aplicados = 0

process.stderr.write(`\nActualizando en batches de ${BATCH}...\n`)
for (let i = 0; i < patches.length; i += BATCH) {
  const batch = patches.slice(i, i + BATCH)
  await Promise.all(batch.map(async p => {
    const { error } = await supabase
      .from('proveedor_catalogo_vinos')
      .update({ nombre: p.nombre, updated_at: now })
      .eq('id', p.id)
    if (error) { console.error(`Error en ${p.id}:`, error.message); throw error }
  }))
  aplicados += batch.length
  process.stderr.write(`  ${aplicados}/${patches.length}...\r`)
}

process.stderr.write(`\n\nFix completado: ${patches.length} nombres corregidos.\n`)
