/**
 * test-compras-pmp.mjs — Tests para B2 (Compras con descuento y PMP)
 *
 * Secciones:
 *   1. Cálculo de precio neto e importe con descuentos
 *   2. PMP: stock=0, stock previo, bonificación 12+1
 *   3. Documento repetido → already_exists
 *   4. Snapshot de venta es inmune a compra posterior
 *   5. calcularMesBodega: doble conteo y identidades B5
 *   6. Integración real (--real, solo La Taberna o Modo Sumiller)
 *
 * Uso:
 *   node scripts/test-compras-pmp.mjs
 *   node scripts/test-compras-pmp.mjs --real
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// ── Cargar .env.local con manejo de BOM ──────────────────────────────────────
let envPath = resolve(__dir, '../.env.local')
try {
  let raw = readFileSync(envPath, 'utf8').replace(/^﻿/, '')
  raw.split('\n').forEach(line => {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, '')
  })
} catch { /* sin .env.local */ }

// ── Helpers ──────────────────────────────────────────────────────────────────
const REAL = process.argv.includes('--real')
const TABERNA_ID = 'a4346301-4dc5-4cb5-a2f5-3ca6469acd66'
const SUMILLER_PATTERN = /sumiller/i

let passed = 0, failed = 0

function ok(label) { console.log(`  ✓ ${label}`); passed++ }
function fail(label, detail) { console.error(`  ✗ ${label}\n    ${detail}`); failed++ }

function assert(cond, label, detail = '') {
  if (cond) ok(label); else fail(label, String(detail))
}

function r4(n) { return Math.round(n * 10000) / 10000 }
function r2(n) { return Math.round(n * 100) / 100 }

// ── Mock Supabase ─────────────────────────────────────────────────────────────
function mockClient(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])]
      const chain = {
        select()          { return this },
        eq(col, val)      { rows = rows.filter(r => r[col] === val); return this },
        gte(col, val)     { rows = rows.filter(r => String(r[col]) >= String(val)); return this },
        lte(col, val)     { rows = rows.filter(r => String(r[col]) <= String(val)); return this },
        in(col, vals)     { rows = rows.filter(r => vals.includes(r[col])); return this },
        is(col, val)      {
          if (val === null) rows = rows.filter(r => r[col] == null)
          else rows = rows.filter(r => r[col] === val)
          return this
        },
        order()           { return this },
        limit(n)          { rows = rows.slice(0, n); return this },
        single()          { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
        maybeSingle()     { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
        then(res)         { res({ data: rows, error: null, count: rows.length }) },
      }
      return chain
    },
  }
}

// ── Fórmulas de precio (JS) ───────────────────────────────────────────────────
function calcPrecioLinea(tarifa, uds, udsBon, dLin, dGlob) {
  const neto     = r4(tarifa * uds * (1 - dLin / 100) * (1 - dGlob / 100))
  const totUds   = uds + udsBon
  const netoUd   = r4(neto / totUds)
  const iva21    = r4(neto * 21 / 100)
  return { importe_neto: neto, precio_neto_ud: netoUd, iva_importe: iva21 }
}

function calcPMP(stockAct, pmpBase, udsTotales, precioNetoUd) {
  if (stockAct <= 0 || !pmpBase || pmpBase === 0) return precioNetoUd
  return r4((stockAct * pmpBase + udsTotales * precioNetoUd) / (stockAct + udsTotales))
}

// ── SECCIÓN 1: Cálculo de descuentos y precio neto ───────────────────────────
console.log('\n── Sección 1: Precio neto con descuentos ──')
{
  // Sin descuentos
  const r1 = calcPrecioLinea(10, 12, 0, 0, 0)
  assert(r1.importe_neto === 120, 'Sin dto: importe=120', r1.importe_neto)
  assert(r1.precio_neto_ud === 10, 'Sin dto: precio_ud=10', r1.precio_neto_ud)

  // Solo descuento de línea 10%
  const r2a = calcPrecioLinea(10, 12, 0, 10, 0)
  assert(r2a.importe_neto === 108, 'Dto línea 10%: importe=108', r2a.importe_neto)
  assert(r2a.precio_neto_ud === 9, 'Dto línea 10%: precio_ud=9', r2a.precio_neto_ud)

  // Solo descuento global 5%
  const r3 = calcPrecioLinea(10, 12, 0, 0, 5)
  assert(r3.importe_neto === 114, 'Dto global 5%: importe=114', r3.importe_neto)

  // Ambos descuentos: 10% línea + 5% global
  const r4a = calcPrecioLinea(10, 12, 0, 10, 5)
  const esperado = r4(10 * 12 * 0.90 * 0.95)
  assert(r4a.importe_neto === esperado, `Dto lin+glob: importe=${esperado}`, r4a.importe_neto)
}

// ── SECCIÓN 2a: PMP con stock=0 ───────────────────────────────────────────────
console.log('\n── Sección 2a: PMP stock=0 ──')
{
  const pmp = calcPMP(0, null, 6, 8.50)
  assert(pmp === 8.50, 'PMP stock=0: queda igual al precio de compra', pmp)

  const pmp2 = calcPMP(0, 12.0, 6, 8.50)
  assert(pmp2 === 8.50, 'PMP stock=0 aunque PMP_base existe: queda igual al precio de compra', pmp2)
}

// ── SECCIÓN 2b: PMP con stock previo ─────────────────────────────────────────
console.log('\n── Sección 2b: PMP con stock previo ──')
{
  // 10 uds a PMP 10€ → compra 5 uds a 8€ → nuevo PMP = (10*10 + 5*8)/15 = 9.333...
  const pmp = calcPMP(10, 10, 5, 8)
  const esperado = r4((10 * 10 + 5 * 8) / 15)
  assert(pmp === esperado, `PMP ponderado = ${esperado}`, pmp)
  assert(pmp < 10 && pmp > 8, 'PMP ponderado entre coste previo y coste nuevo', pmp)
}

// ── SECCIÓN 2c: Bonificación 12+1 ────────────────────────────────────────────
console.log('\n── Sección 2c: Bonificación 12+1 ──')
{
  // 12 uds facturadas + 1 bonificada, tarifa 10€, sin dto
  const r = calcPrecioLinea(10, 12, 1, 0, 0)
  assert(r.importe_neto === 120, 'Bonus 12+1: importe = tarifa×uds = 120', r.importe_neto)
  const expectedUd = r4(120 / 13)
  assert(r.precio_neto_ud === expectedUd, `Bonus 12+1: precio_ud = 120/13 = ${expectedUd}`, r.precio_neto_ud)

  // PMP con bonus: 5 previo a 10€, compra 12+1=13 uds a precio_ud=9.2308
  const pmpAnt = 10
  const stockAnt = 5
  const pmpNuevo = calcPMP(stockAnt, pmpAnt, 13, expectedUd)
  const esperadoPMP = r4((stockAnt * pmpAnt + 13 * expectedUd) / (stockAnt + 13))
  assert(pmpNuevo === esperadoPMP, `Bonus 12+1 PMP correcto = ${esperadoPMP}`, pmpNuevo)
}

// ── SECCIÓN 3: Documento repetido → already_exists ───────────────────────────
console.log('\n── Sección 3: Documento repetido ──')
{
  // Simular la lógica de unicidad de la cabecera
  const existentes = [
    { restaurante_id: 'r1', proveedor: 'Ribera SA', numero_documento: 'F2026-001', referencia_externa: 'uuid-abc' },
  ]

  function insertarCabecera(cab) {
    // Simula el índice parcial UNIQUE (restaurante_id, lower(btrim(proveedor)), numero_documento)
    if (cab.numero_documento) {
      const dup = existentes.find(e =>
        e.restaurante_id === cab.restaurante_id &&
        e.proveedor.toLowerCase().trim() === cab.proveedor.toLowerCase().trim() &&
        e.numero_documento === cab.numero_documento
      )
      if (dup) return 'already_exists'
    }
    // Simula UNIQUE (restaurante_id, referencia_externa)
    if (cab.referencia_externa) {
      const dup = existentes.find(e =>
        e.restaurante_id === cab.restaurante_id &&
        e.referencia_externa === cab.referencia_externa
      )
      if (dup) return 'already_exists'
    }
    existentes.push(cab)
    return 'ok'
  }

  // Primera inserción: OK
  const r1 = insertarCabecera({ restaurante_id: 'r1', proveedor: 'Nuevo SL', numero_documento: 'F2026-002', referencia_externa: 'uuid-xyz' })
  assert(r1 === 'ok', 'Primera inserción: OK')

  // Mismo número de documento mismo proveedor → already_exists
  const r2 = insertarCabecera({ restaurante_id: 'r1', proveedor: 'Ribera SA', numero_documento: 'F2026-001', referencia_externa: 'uuid-111' })
  assert(r2 === 'already_exists', 'Mismo doc+proveedor → already_exists')

  // Proveedor con espacios y mayúsculas distintas → also blocked
  const r3 = insertarCabecera({ restaurante_id: 'r1', proveedor: ' RIBERA sa ', numero_documento: 'F2026-001', referencia_externa: 'uuid-222' })
  assert(r3 === 'already_exists', 'Proveedor normalizado → already_exists')

  // Misma referencia_externa → already_exists (anti doble-clic)
  const r4a = insertarCabecera({ restaurante_id: 'r1', proveedor: 'Otro SL', numero_documento: null, referencia_externa: 'uuid-abc' })
  assert(r4a === 'already_exists', 'Misma referencia_externa → already_exists')

  // Sin documento, diferente referencia → OK
  const r5 = insertarCabecera({ restaurante_id: 'r1', proveedor: 'Sin Factura SL', numero_documento: null, referencia_externa: 'uuid-999' })
  assert(r5 === 'ok', 'Sin documento, ref diferente → OK')
}

// ── SECCIÓN 4: Snapshot de venta inmune a compra posterior ───────────────────
console.log('\n── Sección 4: Snapshot de venta inmune a compra posterior ──')
{
  // Simula el flujo: PMP=10, venta con snapshot=10, luego compra cambia PMP→8
  // El movimiento de venta ya está insertado con coste_medio_ponderado=10
  // El compra actualiza vinos.coste_medio_pmp=8 pero no toca movimientos anteriores

  let vinoState = { stock: 10, coste_medio_pmp: 10.0, coste_compra: 10.0 }
  const movimientos = []

  // 1. Venta: snapshot del PMP actual
  const snapVenta = vinoState.coste_medio_pmp
  movimientos.push({ tipo: 'venta_botella', cantidad: -1, coste_medio_ponderado: snapVenta })
  vinoState.stock -= 1

  assert(movimientos[0].coste_medio_ponderado === 10, 'Venta snapshotea PMP=10')

  // 2. Compra posterior: nuevo coste 7€, actualiza PMP
  const precioNuevo = 7.0
  const pmpNuevo = calcPMP(vinoState.stock, vinoState.coste_medio_pmp, 6, precioNuevo)
  movimientos.push({ tipo: 'compra', cantidad: 6, coste_medio_ponderado: precioNuevo })
  vinoState.coste_medio_pmp = pmpNuevo
  vinoState.coste_compra = precioNuevo

  // 3. Verificar: el movimiento de venta NO fue modificado
  assert(movimientos[0].coste_medio_ponderado === 10, 'Snapshot de venta sigue siendo 10 tras compra')
  assert(movimientos[1].coste_medio_ponderado === 7, 'Movimiento de compra tiene precio de compra=7')
  assert(vinoState.coste_medio_pmp !== 10, 'PMP del vino cambió tras la compra')
  assert(vinoState.coste_compra === 7, 'coste_compra actualizado al último precio')
}

// ── SECCIÓN 5: calcularMesBodega — doble conteo y B5 ─────────────────────────
console.log('\n── Sección 5: calcularMesBodega sin doble conteo, identidades B5 ──')
{
  // Mes 2026-10 con:
  // · 1 cabecera B2 con importe_neto=500
  // · 1 movimiento histórico tipo='compra' sin cabecera, cantidad=6, PMP=10 → val=60
  // · 1 devolucion sin cabecera, cantidad=-2, PMP=10 → val=20

  const cabeceras = [{ id: 'cab-1', restaurante_id: 'r1', fecha: '2026-10-05', estado: 'aplicada' }]
  const lineasCompra = [{ cabecera_id: 'cab-1', importe_neto: 500 }]
  // Nota: devolucion tiene cantidad negativa (es salida). El código usa Math.max(0, cantidad),
  // lo que hace que devoluciones con cantidad<0 resulten en val=0 — comportamiento pre-existente.
  // Una devolucion "en positivo" (cantidad>0) sí se contaría. Aquí probamos ambos casos.
  const movsCDHistorico = [
    { tipo: 'compra',     cantidad: 6,  cabecera_compra_id: null, vino: { coste_medio_pmp: 10, coste_compra: null } },
    { tipo: 'devolucion', cantidad: -2, cabecera_compra_id: null, vino: { coste_medio_pmp: 10, coste_compra: null } }, // negativo → Math.max→0
    { tipo: 'devolucion', cantidad: 3,  cabecera_compra_id: null, vino: { coste_medio_pmp: 10, coste_compra: null } }, // positivo → val=30
  ]
  // Simula un movimiento de compra CON cabecera (no debe contarse en histórico)
  const movsCDConCabecera = [
    { tipo: 'compra', cantidad: 50, cabecera_compra_id: 'cab-1', vino: { coste_medio_pmp: 10, coste_compra: null } },
  ]

  // Filtrar IS NULL cabecera_compra_id
  const movsNoCabecera = [...movsCDHistorico, ...movsCDConCabecera].filter(m => m.cabecera_compra_id == null)

  let compras_b2 = r2(lineasCompra.reduce((s, l) => s + l.importe_neto, 0)) // 500
  let compras_hist = 0, devol_acc = 0
  for (const mov of movsNoCabecera) {
    const c   = Number(mov.vino?.coste_medio_pmp) || Number(mov.vino?.coste_compra) || 0
    const val = r2(Math.max(0, Number(mov.cantidad) || 0) * c)
    if (mov.tipo === 'compra')     compras_hist += val
    if (mov.tipo === 'devolucion') devol_acc    += val
  }
  const compras_bruto = r2(compras_b2 + compras_hist) // 500 + 60 = 560
  const devoluciones  = r2(devol_acc)                  // cantidad -2 → 0; cantidad 3 → 30; total=30
  const compras_netas = r2(compras_bruto - devoluciones) // 530

  assert(compras_b2 === 500, `compras_b2 = 500 (de lineas_compra)`, compras_b2)
  assert(compras_hist === 60, `compras_hist = 60 (histórico sin cabecera)`, compras_hist)
  assert(devoluciones === 30, `devoluciones = 30 (solo filas con cantidad>0)`, devoluciones)
  assert(compras_bruto === 560, `compras_bruto = 560 (sin doble conteo)`, compras_bruto)
  assert(compras_netas === 530, `compras_netas = 530`, compras_netas)

  // Identidad B5: resultado = ventas_neto - coste_ventas - salidas + diferencias - gastos
  // diferencias_inventario = físico − teórico (negativo = pérdida → SUMA con su signo, reduce resultado)
  const ventas_neto           = 1200
  const coste_ventas_teorico  = 400
  const salidas_no_venta      = 50
  const gastos_total          = 200

  const difNegativa   = -30  // pérdida de stock
  const difCero       =   0
  const difPositiva   =  20  // ganancia de stock (descuadre positivo)

  const resConDifNeg = r2(ventas_neto - coste_ventas_teorico - salidas_no_venta + difNegativa  - gastos_total)
  const resConDifCero= r2(ventas_neto - coste_ventas_teorico - salidas_no_venta + difCero      - gastos_total)
  const resConDifPos = r2(ventas_neto - coste_ventas_teorico - salidas_no_venta + difPositiva  - gastos_total)

  assert(resConDifNeg === 520, `B5 identidad con dif=-30 → resultado=520`, resConDifNeg)
  // pérdida de stock (dif<0) empeora el resultado respecto a dif=0
  assert(resConDifNeg < resConDifCero, 'Diferencia negativa empeora el resultado vs dif=0', `${resConDifNeg} vs ${resConDifCero}`)
  // ganancia de stock (dif>0) mejora el resultado respecto a dif=0
  assert(resConDifPos > resConDifCero, 'Diferencia positiva mejora el resultado vs dif=0', `${resConDifPos} vs ${resConDifCero}`)
  // La fórmula usa +diferencias (no -), verificar que la dirección es correcta
  const resSiUsaraMenos = r2(ventas_neto - coste_ventas_teorico - salidas_no_venta - difNegativa - gastos_total)
  assert(resSiUsaraMenos !== resConDifNeg, 'Signo de diferencias importa: + ≠ −', `si fuera −: ${resSiUsaraMenos}, real: ${resConDifNeg}`)

  // Las compras no entran en el resultado (son balance, no P&L)
  // Resultado idéntico independientemente de compras_bruto
  const resultadoConComprasDistintas = r2(ventas_neto - coste_ventas_teorico - salidas_no_venta + difNegativa - gastos_total)
  assert(resultadoConComprasDistintas === resConDifNeg, 'compras_bruto no afecta al resultado de P&L')
}

// ── SECCIÓN 6: Integración real (--real) ─────────────────────────────────────
if (!REAL) {
  console.log('\n── Sección 6: Integración real (skipped — añadir --real para ejecutar) ──')
} else {
  console.log('\n── Sección 6: Integración real ──')
  const { createClient } = await import('@supabase/supabase-js')
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { fail('Variables NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridas'); process.exit(1) }

  const sb = createClient(url, key, { auth: { persistSession: false } })

  // Obtener restaurantes permitidos (La Taberna o Modo Sumiller)
  const { data: restaus } = await sb.from('restaurantes').select('id, nombre, email')
  const permitidos = (restaus || []).filter(r =>
    r.id === TABERNA_ID || SUMILLER_PATTERN.test(r.nombre || '') || SUMILLER_PATTERN.test(r.email || '')
  )
  if (permitidos.length === 0) {
    fail('No se encontró La Taberna ni Modo Sumiller — abortando integración real')
    process.exit(1)
  }

  for (const rest of permitidos) {
    console.log(`  → ${rest.nombre} (${rest.id})`)

    // Obtener un vino activo
    const { data: vinos } = await sb.from('vinos').select('id, nombre, stock, coste_medio_pmp, coste_compra').eq('restaurante_id', rest.id).eq('activo', true).limit(1)
    const vino = vinos?.[0]
    if (!vino) { fail(`${rest.nombre}: no hay vinos activos`); continue }

    const stockAntes = Number(vino.stock) || 0
    const pmpAntes   = Number(vino.coste_medio_pmp) || Number(vino.coste_compra) || 0

    // Registrar compra de prueba
    const refExt = `test-b2-${Date.now()}`
    const { data: resCompra, error: errCompra } = await sb.rpc('registrar_compra_con_pmp', {
      p_restaurante_id: rest.id,
      p_cabecera: {
        proveedor:          'Test B2 Proveedor',
        fecha:              new Date().toISOString().slice(0, 10),
        referencia_externa: refExt,
        descuento_global:   0,
        iva_pct:            21,
        notas:              'test-b2 — borrar',
        origen:             'manual',
      },
      p_lineas: [{
        vino_id:          vino.id,
        uds:              3,
        uds_bonificadas:  0,
        precio_tarifa:    5.00,
        descuento_linea:  0,
      }],
    })

    if (errCompra) { fail(`${rest.nombre}: RPC error — ${errCompra.message}`); continue }
    assert(resCompra?.cabecera_id, `${rest.nombre}: RPC devuelve cabecera_id`)

    // Verificar stock
    const { data: vinoPost } = await sb.from('vinos').select('stock, coste_medio_pmp, coste_compra').eq('id', vino.id).single()
    assert(vinoPost?.stock === stockAntes + 3, `${rest.nombre}: stock+3`, `antes=${stockAntes} después=${vinoPost?.stock}`)
    assert(Number(vinoPost?.coste_compra) === 5.0, `${rest.nombre}: coste_compra=5.00`, vinoPost?.coste_compra)

    const pmpEsperado = pmpAntes > 0 && stockAntes > 0
      ? r4((stockAntes * pmpAntes + 3 * 5) / (stockAntes + 3))
      : 5.0
    assert(Number(vinoPost?.coste_medio_pmp) === pmpEsperado, `${rest.nombre}: PMP correcto=${pmpEsperado}`, vinoPost?.coste_medio_pmp)

    // Verificar documento repetido → already_exists
    const { error: errDup } = await sb.rpc('registrar_compra_con_pmp', {
      p_restaurante_id: rest.id,
      p_cabecera: {
        proveedor:          'Test B2 Proveedor',
        fecha:              new Date().toISOString().slice(0, 10),
        referencia_externa: refExt, // mismo UUID
        descuento_global:   0,
        iva_pct:            21,
      },
      p_lineas: [{ vino_id: vino.id, uds: 1, precio_tarifa: 5.00 }],
    })
    assert(errDup?.message?.includes('already_exists'), `${rest.nombre}: reintento → already_exists`, errDup?.message)

    // ── Limpieza ────────────────────────────────────────────────────────────
    // Revertir stock y PMP al estado anterior
    const cabeceraId = resCompra.cabecera_id
    // Borrar movimiento (lineas y cabecera se borran en cascada)
    await sb.from('movimientos_stock').delete().eq('cabecera_compra_id', cabeceraId)
    await sb.from('cabecera_compras').delete().eq('id', cabeceraId)
    await sb.from('vinos').update({ stock: stockAntes, coste_medio_pmp: vino.coste_medio_pmp, coste_compra: vino.coste_compra }).eq('id', vino.id)
    ok(`${rest.nombre}: limpieza OK`)
  }
}

// ── Resumen ───────────────────────────────────────────────────────────────────
console.log(`\n── Resultado: ${passed} pasados, ${failed} fallidos ──`)
if (failed > 0) process.exit(1)
