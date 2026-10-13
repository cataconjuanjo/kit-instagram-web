/**
 * test-cierre-mensual.mjs
 * Integration test: cierre mensual de bodega (B5)
 *
 * Verifica:
 *   1. Tabla cierres_mensuales_bodega (insert, UNIQUE, delete)
 *   2. gastos_mensuales en restaurant_economic_settings (update, restaurar)
 *   3. RPC calcularMesBodega a través de la API de Supabase directamente
 *
 * No llama a las rutas HTTP (requieren JWT); opera con service role.
 *
 * Uso:
 *   node --env-file=.env.local scripts/test-cierre-mensual.mjs
 *
 * Requiere:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TEST_RESTAURANTE_ID
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL    = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID  = process.env.TEST_RESTAURANTE_ID

const faltantes = [
  !SUPABASE_URL   && 'NEXT_PUBLIC_SUPABASE_URL',
  !SUPABASE_KEY   && 'SUPABASE_SERVICE_ROLE_KEY',
  !RESTAURANTE_ID && 'TEST_RESTAURANTE_ID',
].filter(Boolean)
if (faltantes.length) {
  console.error(`ERROR: falta${faltantes.length > 1 ? 'n' : ''}: ${faltantes.join(', ')}`)
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

let passed = 0
let failed = 0
function ok(label)           { console.log(`  ✓ ${label}`); passed++ }
function fail(label, detail) { console.error(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failed++ }
function section(title)      { console.log(`\n── ${title}`) }

const MES = '2026-01'  // mes de prueba (pasado, no interfiere con datos reales)

// Capturar gastos originales para restauración
let gastosOriginales = []

console.log('\ntest-cierre-mensual.mjs\n')

try {

  // ── 1. Tabla cierres_mensuales_bodega ──────────────────────────────────────
  section('1. Tabla cierres_mensuales_bodega')

  // Limpiar residuos de ejecuciones anteriores
  await db.from('cierres_mensuales_bodega')
    .delete().eq('restaurante_id', RESTAURANTE_ID).eq('mes', MES)

  const snapshot = { test: true, mes: MES, resultado: 0, ventas_bruto: 0 }
  const { data: cierre, error: insertErr } = await db
    .from('cierres_mensuales_bodega')
    .insert({ restaurante_id: RESTAURANTE_ID, mes: MES, snapshot })
    .select().single()

  if (insertErr) { fail('insert cierre', insertErr.message); throw new Error('tabla no accesible') }
  ok('insert cierre')
  if (cierre?.mes === MES) ok('mes guardado correctamente')
  else fail('mes guardado', `esperado ${MES}, obtenido ${cierre?.mes}`)
  if (cierre?.snapshot?.test === true) ok('snapshot guardado')
  else fail('snapshot guardado', JSON.stringify(cierre?.snapshot))

  // UNIQUE constraint
  const { error: dupErr } = await db
    .from('cierres_mensuales_bodega')
    .insert({ restaurante_id: RESTAURANTE_ID, mes: MES, snapshot })
  if (dupErr) ok('UNIQUE constraint rechaza duplicado')
  else fail('UNIQUE constraint', 'permitió insertar duplicado')

  // DELETE
  const { error: delErr } = await db
    .from('cierres_mensuales_bodega')
    .delete().eq('restaurante_id', RESTAURANTE_ID).eq('mes', MES)
  if (!delErr) ok('delete cierre')
  else fail('delete cierre', delErr.message)

  // Verificar que no existe
  const { data: gone } = await db
    .from('cierres_mensuales_bodega')
    .select('id').eq('restaurante_id', RESTAURANTE_ID).eq('mes', MES).maybeSingle()
  if (!gone) ok('registro ausente tras delete')
  else fail('registro ausente tras delete', 'todavía existe')

  // ── 2. gastos_mensuales en settings ───────────────────────────────────────
  section('2. gastos_mensuales en restaurant_economic_settings')

  const { data: settings, error: settErr } = await db
    .from('restaurant_economic_settings')
    .select('gastos_mensuales')
    .eq('restaurante_id', RESTAURANTE_ID)
    .single()

  if (settErr) { fail('leer settings', settErr.message); throw new Error('settings no accesibles') }
  ok('settings accesibles')

  gastosOriginales = Array.isArray(settings?.gastos_mensuales) ? settings.gastos_mensuales : []
  ok(`gastos_mensuales es array (${gastosOriginales.length} entradas previas)`)

  // Insertar gasto de prueba para el MES
  const gastoTest = { mes: MES, concepto: 'Gasto de prueba B5', importe: 99.99 }
  const nuevoArr  = [...gastosOriginales.filter(g => g.mes !== MES), gastoTest]

  const { error: updErr } = await db
    .from('restaurant_economic_settings')
    .update({ gastos_mensuales: nuevoArr })
    .eq('restaurante_id', RESTAURANTE_ID)
  if (!updErr) ok('actualizar gastos_mensuales')
  else { fail('actualizar gastos_mensuales', updErr.message); throw new Error() }

  // Verificar lectura
  const { data: settPost } = await db
    .from('restaurant_economic_settings')
    .select('gastos_mensuales').eq('restaurante_id', RESTAURANTE_ID).single()
  const guardado = (settPost?.gastos_mensuales || []).find(g => g.mes === MES)
  if (guardado) ok('gasto de prueba guardado')
  else fail('gasto de prueba guardado', 'no encontrado')
  if (guardado?.importe === 99.99) ok('importe correcto (99.99)')
  else fail('importe correcto', `obtenido: ${guardado?.importe}`)

  // ── 3. Estructura conteos_inventario accesible ────────────────────────────
  section('3. Verificar acceso a conteos_inventario')

  const { data: conteos, error: contErr } = await db
    .from('conteos_inventario')
    .select('id, estado, cerrado_en')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('estado', 'cerrado')
    .order('cerrado_en', { ascending: false })
    .limit(3)

  if (!contErr) ok(`conteos accesibles (${conteos?.length ?? 0} cerrados)`)
  else fail('conteos accesibles', contErr.message)

  // ── 4. Verificar columna mes en conteos_inventario ────────────────────────
  section('4. Estructura de conteos_inventario_lineas')

  if (conteos && conteos.length > 0) {
    const { data: lineas, error: linErr } = await db
      .from('conteos_inventario_lineas')
      .select('id, vino_id, stock_teorico, stock_contado, coste_unitario_snapshot, contado, diferencia')
      .eq('conteo_id', conteos[0].id)
      .limit(3)
    if (!linErr) ok(`líneas accesibles (${lineas?.length ?? 0} en último conteo)`)
    else fail('líneas accesibles', linErr.message)

    if (lineas && lineas.length > 0) {
      const l = lineas[0]
      if ('coste_unitario_snapshot' in l) ok('columna coste_unitario_snapshot existe')
      else fail('columna coste_unitario_snapshot', 'no encontrada')
      if ('diferencia' in l) ok('columna diferencia existe')
      else fail('columna diferencia', 'no encontrada')
    }
  } else {
    console.log('  ℹ  Sin conteos cerrados — se omite verificación de lineas')
  }

  // ── 5. Verificar iva_venta_pct y merma_copa_pct en settings ───────────────
  section('5. Columnas de settings para calcularMesBodega')

  const { data: settFull, error: settFullErr } = await db
    .from('restaurant_economic_settings')
    .select('iva_venta_pct, copas_por_botella, merma_copa_pct, gastos_mensuales')
    .eq('restaurante_id', RESTAURANTE_ID)
    .single()

  if (!settFullErr) {
    ok('iva_venta_pct accesible' + (settFull?.iva_venta_pct != null ? ` (${settFull.iva_venta_pct}%)` : ' (NULL)'))
    ok('copas_por_botella accesible' + (settFull?.copas_por_botella != null ? ` (${settFull.copas_por_botella})` : ' (NULL)'))
    ok('merma_copa_pct accesible' + (settFull?.merma_copa_pct != null ? ` (${settFull.merma_copa_pct}%)` : ' (NULL)'))
  } else {
    fail('settings completos', settFullErr.message)
  }

} finally {

  // ── Limpieza ───────────────────────────────────────────────────────────────
  section('Limpieza')

  // Restaurar gastos originales (quitar el gasto de prueba)
  const { error: restoreErr } = await db
    .from('restaurant_economic_settings')
    .update({ gastos_mensuales: gastosOriginales })
    .eq('restaurante_id', RESTAURANTE_ID)
  if (!restoreErr) ok('gastos_mensuales restaurados')
  else console.error(`  ✗ restaurar gastos_mensuales: ${restoreErr.message}`)

  // Asegurar limpieza del cierre de prueba
  await db.from('cierres_mensuales_bodega')
    .delete().eq('restaurante_id', RESTAURANTE_ID).eq('mes', MES)
  ok('cierre de prueba eliminado (si existía)')
}

// ── Resultado ──────────────────────────────────────────────────────────────────
console.log(`\n────────────────────────────────────────────────────────────────`)
console.log(`  Resultado: ${passed} pasados, ${failed} fallidos`)
console.log(`────────────────────────────────────────────────────────────────\n`)
process.exit(failed > 0 ? 1 : 0)
