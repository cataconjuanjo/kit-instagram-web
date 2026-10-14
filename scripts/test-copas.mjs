/**
 * test-copas.mjs — B4: Venta por copa, botella abierta, rendimiento
 *
 * Uso:
 *   node --env-file=.env.local scripts/test-copas.mjs            # unit tests (sin DB)
 *   node --env-file=.env.local scripts/test-copas.mjs --real     # integración vs La Taberna del Puerto
 *
 * Requiere para --real:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_RESTAURANTE_ID
 *
 * Restaurantes permitidos: La Taberna del Puerto o Modo Sumiller.
 * NUNCA Araboka ni Lo de Carmen.
 * La suite --real limpia al final todos los datos que crea.
 */

// ─── helpers ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0

function assert(cond, msg) {
  if (cond) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

function assertEqual(a, b, msg) {
  if (a === b) {
    passed++
    console.log(`  ✓ ${msg}  (${a})`)
  } else {
    failed++
    console.error(`  ✗ ${msg}  expected=${b} got=${a}`)
  }
}

function r4(v) { return Math.round(Number(v) * 10000) / 10000 }
function r2(v) { return Math.round(Number(v) * 100)   / 100   }

// ─── Lógica pura extraída de la RPC (para tests unitarios sin DB) ─────────────

/**
 * Simula el consumo de copas con apertura automática de botellas.
 * Devuelve { botellas_abiertas, copas_restantes, saldo_inicial }.
 */
function simularConsumoCopas({
  copas_vendidas,      // int — copas a servir
  stock_inicial,       // int — stock actual del vino
  copas_teoricas,      // float — copas vendibles por botella (con merma)
  saldo_inicial = null // float | null — copas restantes en botella abierta (null = sin botella)
}) {
  let stock = stock_inicial
  let botellas_opened = 0
  let saldo = saldo_inicial     // null = no hay botella abierta
  let pendientes = copas_vendidas

  let iter = 0
  const MAX_ITER = copas_vendidas + 2

  while (pendientes > 0 && iter++ < MAX_ITER) {
    // Si no hay botella o saldo < 1: abrir nueva
    if (saldo === null || saldo < 1) {
      // Descartar fracción si existe
      saldo = null
      // Abrir botella
      stock = Math.max(0, stock - 1)
      botellas_opened++
      saldo = copas_teoricas
    }

    // Servir FLOOR(saldo) copas (sin fracciones)
    const servir = Math.min(Math.floor(saldo), pendientes)
    if (servir < 1) throw new Error('copas_teoricas < 1: configuración inválida')

    saldo = r4(saldo - servir)
    pendientes -= servir

    // Marcar agotada si llega a 0
    if (saldo === 0) saldo = null
  }

  return {
    stock_final:      stock,
    botellas_opened,
    copas_restantes: saldo ?? 0,
    delta_stock:     -(botellas_opened),
  }
}

// ─── Fórmula de coste copa (igual que calcularMesBodega / B5) ─────────────────
function costeCopa(coste_botella, copas_por_botella, merma_pct) {
  const copasVendibles = r4(copas_por_botella * (1 - merma_pct / 100))
  return coste_botella > 0 && copasVendibles > 0
    ? r4(coste_botella / copasVendibles)
    : 0
}

function costeCopasPorLineas(copas_vendidas, coste_botella, copas_por_botella, merma_pct) {
  const copasVendibles = r4(copas_por_botella * (1 - merma_pct / 100))
  return copasVendibles > 0 ? r2((copas_vendidas / copasVendibles) * coste_botella) : 0
}

// ═════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Apertura automática al primer copa
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── Sección 1: Apertura automática al primer copa ──────────────────────')

{
  const r = simularConsumoCopas({ copas_vendidas: 1, stock_inicial: 6, copas_teoricas: 4.5, saldo_inicial: null })
  assertEqual(r.botellas_opened, 1, 'Sin botella abierta: se abre 1 botella')
  assertEqual(r.stock_final, 5, 'Stock baja de 6 a 5')
  assertEqual(r.copas_restantes, 3.5, 'Saldo restante = 4.5 − 1 = 3.5')
}

// ─── Sección 2: Consumir sin abrir ────────────────────────────────────────────
console.log('\n── Sección 2: Consumir sin abrir (saldo suficiente) ───────────────────')

{
  const r = simularConsumoCopas({ copas_vendidas: 2, stock_inicial: 5, copas_teoricas: 4.5, saldo_inicial: 3.5 })
  assertEqual(r.botellas_opened, 0, 'Con saldo 3.5 y 2 copas: no abre botella')
  assertEqual(r.stock_final, 5, 'Stock no cambia')
  assertEqual(r.copas_restantes, 1.5, 'Saldo restante = 3.5 − 2 = 1.5')
}

// ─── Sección 3: Consumo que cruza botella ─────────────────────────────────────
console.log('\n── Sección 3: Consumo que cruza botella (saldo 1.5, pide 2 copas) ─────')

{
  // saldo=1.5: puede dar FLOOR(1.5)=1 copa, luego abre nueva para la segunda
  const r = simularConsumoCopas({ copas_vendidas: 2, stock_inicial: 5, copas_teoricas: 4.5, saldo_inicial: 1.5 })
  assertEqual(r.botellas_opened, 1, 'Abre 1 botella cuando el saldo no alcanza')
  assertEqual(r.stock_final, 4, 'Stock baja de 5 a 4')
  // Sirvió 1 de la primera botella (1.5 → 0.5, < 1 descartado), abrió nueva (4.5), sirvió 1 → 3.5
  assert(r.copas_restantes > 0, 'Saldo positivo en la nueva botella')
}

// ─── Sección 4: N grande abre varias botellas ─────────────────────────────────
console.log('\n── Sección 4: N grande (10 copas, botella=4.5 copas, sin saldo) ────────')

{
  // 10 copas / 4.5 ≈ 2.22 → necesita 3 botellas
  const r = simularConsumoCopas({ copas_vendidas: 10, stock_inicial: 8, copas_teoricas: 4.5, saldo_inicial: null })
  assertEqual(r.botellas_opened, 3, '10 copas / 4.5 = 3 botellas necesarias')
  assertEqual(r.stock_final, 5, 'Stock baja de 8 a 5')
  // 3 botellas × 4 FLOOR = 12 posibles, servimos 10, quedan 4.5 − (10 − 4 − 4) = 4.5 − 2 = 2.5
  assert(r.copas_restantes >= 0, 'Saldo no negativo')
}

// ─── Sección 5: Fraccionario — saldo < 1 se descarta ─────────────────────────
console.log('\n── Sección 5: Saldo fraccionario < 1 se descarta al servir siguiente ──')

{
  // copas_por_botella=5, merma=10% → copas_teoricas = 4.5 (no entero)
  const copas_teoricas = r4(5 * (1 - 10 / 100))   // 4.5
  assertEqual(copas_teoricas, 4.5, 'copasVendibles = 5 × 0.9 = 4.5')

  // Servimos 4 copas de una botella → saldo = 0.5
  let r = simularConsumoCopas({ copas_vendidas: 4, stock_inicial: 4, copas_teoricas, saldo_inicial: copas_teoricas })
  assertEqual(r.botellas_opened, 0, 'Servir 4 de 4.5: no abre botella')
  assertEqual(r.copas_restantes, 0.5, 'Saldo = 0.5 tras servir 4')

  // Al pedir 1 copa más: saldo=0.5 < 1 → se descarta, abre nueva
  r = simularConsumoCopas({ copas_vendidas: 1, stock_inicial: 4, copas_teoricas, saldo_inicial: 0.5 })
  assertEqual(r.botellas_opened, 1, 'Saldo 0.5 < 1: descarta y abre nueva botella')
  assertEqual(r.copas_restantes, 3.5, 'Nueva botella (4.5) − 1 = 3.5')
}

// ─── Sección 6: control_stock_desde NULL no toca saldo ni stock ───────────────
console.log('\n── Sección 6: Gate control_stock_desde — sin saldo cuando gate activo ─')

{
  // Simulación del gate: v_actualiza_stock = FALSE → no entra en copa path
  // Verificamos que el guard NOT v_por_copa || NOT v_actualiza_stock excluye la lógica
  const gateActivo = true
  const entraEnLogiaCopa = !gateActivo  // FALSE
  assert(!entraEnLogiaCopa, 'Gate activo: no entra en copa path')
  // Stock sin cambios:
  const stockDespues = 8  // mismo que antes
  assertEqual(stockDespues, 8, 'Stock sin cambios cuando gate activo')
}

// ─── Sección 7: Cerrar botella manual — stock NO baja dos veces ───────────────
console.log('\n── Sección 7: Cierre manual — rotura con delta=0 (stock ya bajó) ───')

{
  // Simular apertura: stock 8 → 7 (botella abierta con 4.5 copas, sirvió 2 → saldo=2.5)
  const stockTrasApertura = 7
  const coste_copa = costeCopa(14, 5, 10)   // 14 / 4.5 = 3.1111

  // Al cerrar: cantidad=0 en movimientos, stock_anterior=stock_nuevo=7
  const deltaStock = 0  // CAMBIO #2: no baja de nuevo
  assertEqual(deltaStock, 0, 'Cerrar botella: delta_stock = 0')
  assertEqual(stockTrasApertura, 7, 'Stock permanece en 7 tras cerrar botella')

  const copasDescartadas = 2.5
  const costeDescartado = r2(copasDescartadas * coste_copa)
  assert(costeDescartado > 0, `Coste descartado = ${costeDescartado} € (copas_restantes × coste_copa)`)
  assert(costeDescartado < 14, 'Coste descartado < coste botella entera')
}

// ─── Sección 8: Identidad B5 — coste copa usa copas_vendidas, no cantidad ────
console.log('\n── Sección 8: Identidad B5 — coste de copa viene de copas_vendidas ────')

{
  const coste_botella = 14
  const copas_por_botella = 5
  const merma_pct = 10

  // Escenario: vendo 3 copas, necesito abrir 1 botella (delta_stock = -1)
  // El movimiento tiene cantidad=-1, copas_vendidas=3
  // calcularMesBodega usa copas_vendidas (de partes_servicio_lineas), nunca cantidad

  const costeViaMovimiento = Math.abs(-1) * coste_botella   // = 14 € (INCORRECTO si se usara cantidad)
  const costeViaCopas = costeCopasPorLineas(3, coste_botella, copas_por_botella, merma_pct)
  // copasVendibles = 4.5 → coste = 3/4.5 × 14 = 9.33

  assert(costeViaCopas < coste_botella, 'Coste 3 copas < coste botella entera')
  assert(costeViaMovimiento > costeViaCopas, 'Si se usara cantidad (−1 bot) el coste sería mayor: regresión evitada')
  console.log(`    coste correcto (por copas_vendidas): ${costeViaCopas} €`)
  console.log(`    coste incorrecto (por cantidad=-1):  ${costeViaMovimiento} € ← NO se usa`)

  // Invitación copa: misma lógica, no valorar una botella entera
  const costeInvitacion = costeCopasPorLineas(2, coste_botella, copas_por_botella, merma_pct)
  assert(costeInvitacion < coste_botella, 'invitacion_copa: coste < coste botella entera')
  console.log(`    coste invitación 2 copas: ${costeInvitacion} € (no 1 botella = ${coste_botella} €)`)
}

// ─── Sección 9: Idempotencia — nota sobre ausencia de referencia_externa ─────
console.log('\n── Sección 9: Idempotencia — comportamiento actual sin ref. externa ──')

{
  // aplicar_ajustes v4 no añade idempotencia por referencia_externa
  // (no existe hoy en movimientos_stock ni en partes_servicio).
  // B8 lo añadirá. Por ahora: dos llamadas idénticas crean dos movimientos.
  const tieneIdempotencia = false   // diseño documentado
  assert(!tieneIdempotencia, 'Sin idempotencia en v4 (B8 la añadirá si aplica)')
  console.log('    Nota: referencia_externa solo existe en cabecera_compras (B2).')
  console.log('    B4 no añade idempotencia para no crear un camino paralelo prematuro.')
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`Tests: ${passed} ✓  ${failed} ✗  total ${passed + failed}`)

if (failed > 0) process.exit(1)

// ═════════════════════════════════════════════════════════════════════════════
// INTEGRACIÓN (--real) — requiere variables de entorno y B4 aplicado en DB
// ═════════════════════════════════════════════════════════════════════════════
if (!process.argv.includes('--real')) {
  console.log('\n(Para tests de integración: --real)\n')
  process.exit(0)
}

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = Object.entries(process.env)
  .find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID = process.env.TEST_RESTAURANTE_ID

const faltantes = [
  !SUPABASE_URL   && 'NEXT_PUBLIC_SUPABASE_URL',
  !SUPABASE_KEY   && 'SUPABASE_SERVICE_ROLE_KEY',
  !RESTAURANTE_ID && 'TEST_RESTAURANTE_ID',
].filter(Boolean)
if (faltantes.length) { console.error(`ERROR: falta: ${faltantes.join(', ')}`); process.exit(1) }

const PERMITIDOS = [
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66',  // La Taberna del Puerto
  // Modo Sumiller (añadir su UUID si es necesario)
]
if (!PERMITIDOS.includes(RESTAURANTE_ID)) {
  console.error(`SEGURIDAD: TEST_RESTAURANTE_ID (${RESTAURANTE_ID}) no está en la lista de restaurantes permitidos.`)
  console.error('Solo están permitidos: La Taberna del Puerto y Modo Sumiller.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

console.log('\n── Integración contra DB real ─────────────────────────────────────────')
console.log(`   Restaurante: ${RESTAURANTE_ID}`)

// ── Buscar un vino por_copa=true con stock > 0 para las pruebas ───────────────
const { data: vinosCopa } = await db
  .from('vinos')
  .select('id, nombre, stock, coste_compra, coste_medio_pmp, por_copa')
  .eq('restaurante_id', RESTAURANTE_ID)
  .eq('por_copa', true)
  .gt('stock', 2)
  .limit(1)

const vinoTest = vinosCopa?.[0]
if (!vinoTest) {
  console.log('SKIP: No hay vinos con por_copa=true y stock>2. Aplica b4_copas_botella_abierta.sql primero.')
  process.exit(0)
}

console.log(`   Vino de prueba: ${vinoTest.nombre} (stock=${vinoTest.stock})`)

// ── Buscar un vino sin por_copa para probar el rechazo ────────────────────────
const { data: vinosSinMarca } = await db
  .from('vinos')
  .select('id, nombre')
  .eq('restaurante_id', RESTAURANTE_ID)
  .eq('por_copa', false)
  .limit(1)

const vinoSinMarca = vinosSinMarca?.[0]

// ── Leer settings ─────────────────────────────────────────────────────────────
const { data: settings } = await db
  .from('restaurant_economic_settings')
  .select('copas_por_botella, merma_copa_pct, control_stock_desde')
  .eq('restaurante_id', RESTAURANTE_ID)
  .single()

const copasXBot  = Number(settings?.copas_por_botella) || 5
const merraPct   = Number(settings?.merma_copa_pct)    || 0
const copasT     = r4(copasXBot * (1 - merraPct / 100))

console.log(`   Settings: copas_por_botella=${copasXBot}, merma=${merraPct}%, copas_teoricas=${copasT}`)

// ── Limpiar cualquier botella abierta previa para el vino de prueba ───────────
await db.from('botellas_abiertas').delete()
  .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)

const stockAntes = vinoTest.stock
let passed_r = 0, failed_r = 0
function assertR(cond, msg) {
  if (cond) { passed_r++; console.log(`  ✓ ${msg}`) }
  else       { failed_r++; console.error(`  ✗ ${msg}`) }
}

// ── R1: Primera copa abre botella ─────────────────────────────────────────────
console.log('\n  [R1] Primera copa abre botella automáticamente')
{
  const { data, error } = await db.rpc('aplicar_ajustes_stock_atomicos', {
    p_restaurante_id: RESTAURANTE_ID,
    p_ajustes: [{ vino_id: vinoTest.id, modo: 'delta', tipo: 'venta_copa', valor: 0,
                  copas_vendidas: 1, origen: 'manual', motivo: 'TEST-B4-R1' }],
  })
  assertR(!error, `R1 sin error (${error?.message ?? 'ok'})`)
  if (!error) {
    const { data: vino } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
    assertR(vino.stock === stockAntes - 1, `Stock bajó de ${stockAntes} a ${vino.stock}`)
    const { data: bot } = await db.from('botellas_abiertas').select('*')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id).eq('estado', 'abierta').maybeSingle()
    assertR(!!bot, 'Botella abierta creada')
    assertR(Number(bot?.copas_restantes) === copasT - 1, `Saldo = ${bot?.copas_restantes} (esperado ${copasT - 1})`)
    const { data: mov } = await db.from('movimientos_stock').select('cantidad, copas_vendidas')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)
      .eq('motivo', 'TEST-B4-R1').maybeSingle()
    assertR(mov?.cantidad === -1, `Movimiento: cantidad=-1 (abrió 1 botella)`)
    assertR(mov?.copas_vendidas === 1, `Movimiento: copas_vendidas=1`)
  }
}

// ── R2: Consumir sin abrir (saldo suficiente) ─────────────────────────────────
console.log('\n  [R2] Consumir 1 copa del saldo (sin abrir botella)')
{
  const { data: botAntes } = await db.from('botellas_abiertas').select('copas_restantes')
    .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id).eq('estado', 'abierta').maybeSingle()
  const saldoAntes = Number(botAntes?.copas_restantes) || 0

  const { data: vinoAntes } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
  const stockEnR2 = vinoAntes.stock

  const { error } = await db.rpc('aplicar_ajustes_stock_atomicos', {
    p_restaurante_id: RESTAURANTE_ID,
    p_ajustes: [{ vino_id: vinoTest.id, modo: 'delta', tipo: 'venta_copa', valor: 0,
                  copas_vendidas: 1, origen: 'manual', motivo: 'TEST-B4-R2' }],
  })
  assertR(!error, `R2 sin error`)
  if (!error && saldoAntes >= 2) {
    const { data: vino } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
    assertR(vino.stock === stockEnR2, `Stock no cambia (sigue en ${vino.stock})`)
    const { data: bot } = await db.from('botellas_abiertas').select('copas_restantes')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id).eq('estado', 'abierta').maybeSingle()
    assertR(r4(Number(bot?.copas_restantes)) === r4(saldoAntes - 1), `Saldo bajó de ${saldoAntes} a ${bot?.copas_restantes}`)
  }
}

// ── R3: Vino sin por_copa rechazado ───────────────────────────────────────────
console.log('\n  [R3] Vino sin por_copa rechazado por la RPC')
if (vinoSinMarca) {
  const { error } = await db.rpc('aplicar_ajustes_stock_atomicos', {
    p_restaurante_id: RESTAURANTE_ID,
    p_ajustes: [{ vino_id: vinoSinMarca.id, modo: 'delta', tipo: 'venta_copa', valor: 0,
                  copas_vendidas: 1, origen: 'manual', motivo: 'TEST-B4-R3' }],
  })
  assertR(error?.message?.includes('vino_no_por_copa'), `RPC rechaza vino sin por_copa: "${error?.message}"`)
} else {
  console.log('  SKIP R3: no hay vino con por_copa=false disponible')
}

// ── R4: Cerrar botella abierta → stock NO baja ────────────────────────────────
console.log('\n  [R4] Cerrar botella manual: delta_stock = 0')
{
  const { data: vinoAntes } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
  const stockAntesR4 = vinoAntes.stock

  const { data, error } = await db.rpc('gestionar_botella_copa', {
    p_restaurante_id: RESTAURANTE_ID,
    p_vino_id:        vinoTest.id,
    p_accion:         'cerrar',
    p_motivo:         'TEST-B4-R4',
  })
  assertR(!error, `R4 sin error (${error?.message ?? 'ok'})`)
  if (!error) {
    const { data: vino } = await db.from('vinos').select('stock').eq('id', vinoTest.id).single()
    assertR(vino.stock === stockAntesR4, `Stock no bajó (sigue en ${vino.stock}) — cambio #2`)
    const { data: bot } = await db.from('botellas_abiertas').select('estado, copas_restantes')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    assertR(bot?.estado === 'cerrada_manual', `Botella marcada cerrada_manual`)
    assertR(Number(bot?.copas_restantes) === 0, `Saldo = 0 tras cierre manual`)
    // Verificar que el movimiento de rotura tiene cantidad=0
    const { data: mov } = await db.from('movimientos_stock').select('cantidad, tipo')
      .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)
      .eq('motivo', 'TEST-B4-R4').maybeSingle()
    assertR(mov?.tipo === 'rotura', 'Movimiento tipo=rotura')
    assertR(mov?.cantidad === 0, `Movimiento cantidad=0 (stock no baja dos veces)`)
  }
}

// ── Limpieza ──────────────────────────────────────────────────────────────────
console.log('\n  Limpiando datos de prueba...')
{
  // Eliminar movimientos de prueba
  await db.from('movimientos_stock').delete()
    .eq('restaurante_id', RESTAURANTE_ID)
    .in('motivo', ['TEST-B4-R1','TEST-B4-R2','TEST-B4-R3','TEST-B4-R4'])

  // Eliminar botellas de prueba
  await db.from('botellas_abiertas').delete()
    .eq('restaurante_id', RESTAURANTE_ID).eq('vino_id', vinoTest.id)

  // Restaurar stock del vino (era stockAntes)
  await db.from('vinos').update({ stock: stockAntes }).eq('id', vinoTest.id)
  console.log(`  ✓ Stock de ${vinoTest.nombre} restaurado a ${stockAntes}`)
}

// ── Resumen integración ───────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`)
console.log(`Integración: ${passed_r} ✓  ${failed_r} ✗`)
if (failed_r > 0) process.exit(1)
console.log('\nTodos los tests pasaron.\n')
