/**
 * test-cierre-mensual.mjs
 * Tests para B5 cierre mensual de bodega.
 *
 * Parte 1 – Identidades contables con fixtures (sin red, sin .env)
 * Parte 2 – Integración con restaurante real (requiere .env.local)
 *
 * Uso:
 *   node --env-file=.env.local scripts/test-cierre-mensual.mjs
 *
 * Variables opcionales para integración:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   TEST_RESTAURANTE_ID  (Araboka/La Taberna — NO usar Lo de Carmen)
 */

import { calcularMesBodega } from '../app/lib/agregarPeriodoBodega.js'
import { createClient } from '@supabase/supabase-js'

// ── Runner ─────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
function ok(label)           { console.log(`  ✓ ${label}`); passed++ }
function fail(label, detail) { console.error(`  ✗ ${label}${detail !== undefined ? ': ' + String(detail) : ''}`); failed++ }
function section(title)      { console.log(`\n── ${title}`) }
function cerca(a, b, tol)    { return Math.abs(a - b) <= (tol ?? 0.02) }

// ── Mock Supabase ──────────────────────────────────────────────────────────────
// Chainable builder. Supports direct await (.then) and terminal methods.

function mockClient(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])]

      const chain = {
        select()  { return this },
        eq(col, val) {
          rows = rows.filter(r => r[col] === val)
          return this
        },
        gte(col, val) {
          rows = rows.filter(r => String(r[col]) >= String(val))
          return this
        },
        lte(col, val) {
          rows = rows.filter(r => String(r[col]) <= String(val))
          return this
        },
        in(col, vals) {
          rows = rows.filter(r => vals.includes(r[col]))
          return this
        },
        order()  { return this },
        limit(n) { rows = rows.slice(0, n); return this },
        single()      { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }) },
        then(resolve) { resolve({ data: rows, error: null, count: rows.length }) },
      }

      return chain
    },
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────────
//
// Estructura real de las tablas:
//   partes_servicio:        id, restaurante_id, fecha, turno, estado
//   partes_servicio_lineas: id, parte_id, vino_id, tipo, cantidad, copas_vendidas,
//                           precio_unitario, mesa, vino:{id,nombre,coste_medio_pmp,coste_compra}
//   movimientos_stock:      id, restaurante_id, tipo, cantidad, created_at,
//                           vino:{coste_medio_pmp,coste_compra}
//   restaurant_economic_settings: restaurante_id, iva_venta_pct, copas_por_botella,
//                                 merma_copa_pct, ml_por_copa, fuente_ventas, gastos_mensuales

const RID       = 'test-rest-id'
const MES       = '2026-01'
const VA        = 'vino-a'
const VB        = 'vino-b'
const VC        = 'vino-c'
const PARTE_ID  = 'parte-enero-1'

// Ventas del mes en el parte:
//   vA botella ×3 @ 30€ carta, coste 25€
//   vB botella ×2 @ 20€ carta, coste 20€
//   vA copa    ×5 @ 5€/copa,   coste botella 25€
//   vB cocina  ×1 @ 20€ carta, coste 20€  (salida no venta)
//   vC botella ×1 @ 30€ carta, sin coste
const LINEAS = [
  { id: 'l1', parte_id: PARTE_ID, vino_id: VA, tipo: 'venta_botella', cantidad: 3, copas_vendidas: 0, precio_unitario: 30, vino: { id: VA, nombre: 'Vino A', coste_medio_pmp: 25, coste_compra: 25 } },
  { id: 'l2', parte_id: PARTE_ID, vino_id: VB, tipo: 'venta_botella', cantidad: 2, copas_vendidas: 0, precio_unitario: 20, vino: { id: VB, nombre: 'Vino B', coste_medio_pmp: 20, coste_compra: 20 } },
  { id: 'l3', parte_id: PARTE_ID, vino_id: VA, tipo: 'venta_copa',    cantidad: 0, copas_vendidas: 5, precio_unitario:  5, vino: { id: VA, nombre: 'Vino A', coste_medio_pmp: 25, coste_compra: 25 } },
  { id: 'l4', parte_id: PARTE_ID, vino_id: VB, tipo: 'cocina',        cantidad: 1, copas_vendidas: 0, precio_unitario: 20, vino: { id: VB, nombre: 'Vino B', coste_medio_pmp: 20, coste_compra: 20 } },
  { id: 'l5', parte_id: PARTE_ID, vino_id: VC, tipo: 'venta_botella', cantidad: 1, copas_vendidas: 0, precio_unitario: 30, vino: { id: VC, nombre: 'Vino C', coste_medio_pmp: null, coste_compra: null } },
]

const PARTES = [
  { id: PARTE_ID, restaurante_id: RID, fecha: '2026-01-15', turno: 'noche', estado: 'cerrado' },
]

// Compra 10×25€ + devolución 2×20€ → compras_bruto=250, devoluciones=40, netas=210
const MOVIMIENTOS = [
  { id: 'm1', restaurante_id: RID, tipo: 'compra',     cantidad: 10, created_at: '2026-01-05T10:00:00+01:00', vino: { coste_medio_pmp: 25, coste_compra: 25 } },
  { id: 'm2', restaurante_id: RID, tipo: 'devolucion', cantidad:  2, created_at: '2026-01-20T10:00:00+01:00', vino: { coste_medio_pmp: 20, coste_compra: 20 } },
]

const SETTINGS = {
  restaurante_id:    RID,
  fuente_ventas:     null,
  iva_venta_pct:     10,
  copas_por_botella: 5,
  merma_copa_pct:    10,
  ml_por_copa:       null,
  gastos_mensuales:  [{ mes: MES, concepto: 'Alquiler', importe: 100 }],
}

// ── Valores esperados ──────────────────────────────────────────────────────────
//
// ventas_bruto = ingresos_venta = 3×30 + 2×20 + 5×5 + 1×30 = 90+40+25+30 = 185€
//   (cocina va a consumos_valor, no a ingresos_venta)
//
// ventas_neto  = round(185 / 1.10, 2) = 168.18€
//
// coste_ventas_teorico:
//   copasVendibles = round(5 × (1−10/100), 4) = 4.5
//   vA: uds=3 (botella), copas=5
//       coste_botellas  = round(3×25, 2) = 75
//       coste_copas     = round((5/4.5)×25, 2) = round(27.7778, 2) = 27.78
//   vB: uds = 2 (botella) + 1 (cocina) = 3,  copas=0
//       coste_botellas  = round(3×20, 2) = 60
//   vC: sin coste → skip
//   total = 75 + 27.78 + 60 = 162.78€
//
// salidas_no_venta = consumos_valor = 1×20 = 20€
// compras_bruto = 10×25 = 250€
// devoluciones  = 2×20  =  40€
// compras_netas = 210€
// gastos_total  = 100€
//
// resultado = 168.18 − 162.78 − 20 − 0 − 100 = −114.60€

const EXP = {
  ventas_bruto:         185,
  ventas_neto:          168.18,
  coste_ventas_teorico: 162.78,
  salidas_no_venta:     20,
  compras_bruto:        250,
  devoluciones:         40,
  compras_netas:        210,
  gastos_total:         100,
  resultado:            -114.60,
}

// ── Parte 1: identidades contables ────────────────────────────────────────────

section('1. Identidades contables (fixtures)')

let d
try {
  const supabase = mockClient({
    partes_servicio:            PARTES,
    partes_servicio_lineas:     LINEAS,
    movimientos_stock:          MOVIMIENTOS,
    restaurant_economic_settings: [SETTINGS],
    conteos_inventario:           [],
    conteos_inventario_lineas:    [],
  })

  d = await calcularMesBodega({ restaurante_id: RID, mes: MES, supabase })

  if (!d) { fail('calcularMesBodega devuelve datos', 'devolvió null/undefined'); throw new Error('sin datos') }
  ok('calcularMesBodega ejecuta sin error')

  // Fixture spot checks
  if (cerca(d.ventas_bruto, EXP.ventas_bruto, 0.01))
    ok(`ventas_bruto fixture  [${d.ventas_bruto}€ ≈ ${EXP.ventas_bruto}€]`)
  else
    fail('ventas_bruto fixture', `got ${d.ventas_bruto}, exp ${EXP.ventas_bruto}`)

  if (cerca(d.compras_bruto, EXP.compras_bruto, 0.01))
    ok(`compras_bruto fixture  [${d.compras_bruto}€]`)
  else
    fail('compras_bruto fixture', `got ${d.compras_bruto}`)

  if (cerca(d.devoluciones, EXP.devoluciones, 0.01))
    ok(`devoluciones fixture  [${d.devoluciones}€]`)
  else
    fail('devoluciones fixture', `got ${d.devoluciones}`)

  if (d.iva_pct === 10) ok('iva_pct fixture (10%)')
  else fail('iva_pct fixture', `got ${d.iva_pct}`)

  if (cerca(d.gastos_total, EXP.gastos_total, 0.01)) ok('gastos_total fixture (100€)')
  else fail('gastos_total fixture', `got ${d.gastos_total}`)

  // Identity: ventas_neto = ventas_bruto / (1 + iva/100)
  const ivaId = d.ventas_bruto / (1 + d.iva_pct / 100)
  if (cerca(d.ventas_neto, ivaId, 0.02))
    ok(`ventas_neto = ventas_bruto/(1+iva/100)  [${d.ventas_neto.toFixed(2)} ≈ ${ivaId.toFixed(2)}]`)
  else
    fail('ventas_neto identity', `${d.ventas_neto.toFixed(2)} ≠ ${ivaId.toFixed(2)}`)

  // Identity: compras_netas = compras_bruto − devoluciones
  const cnId = d.compras_bruto - d.devoluciones
  if (cerca(d.compras_netas, cnId, 0.01))
    ok(`compras_netas = compras_bruto − devoluciones  [${d.compras_netas.toFixed(2)}]`)
  else
    fail('compras_netas identity', `${d.compras_netas.toFixed(2)} ≠ ${cnId.toFixed(2)}`)

  // Identity: resultado = ventas_neto − coste − salidas − diff − gastos
  const diff = d.diferencias_inventario ?? 0
  const resId = d.ventas_neto - d.coste_ventas_teorico - d.salidas_no_venta - diff - d.gastos_total
  if (cerca(d.resultado, resId, 0.02))
    ok(`resultado = ventas_neto − coste − salidas − diff − gastos  [${d.resultado.toFixed(2)}]`)
  else
    fail('resultado identity', `${d.resultado.toFixed(2)} ≠ ${resId.toFixed(2)}`)

  // Identity: ventas_bruto === informe.resumen.ingresos_venta
  if (d.informe?.resumen != null) {
    if (cerca(d.ventas_bruto, d.informe.resumen.ingresos_venta, 0.01))
      ok(`ventas_bruto === informe.resumen.ingresos_venta  [${d.ventas_bruto}]`)
    else
      fail('ventas_bruto vs ingresos_venta', `${d.ventas_bruto} ≠ ${d.informe.resumen.ingresos_venta}`)
  } else {
    console.log('  ℹ  informe.resumen no disponible — se omite verificación ingresos_venta')
  }

  // vC sin coste → debe aparecer en cobertura.sin_coste
  if (Array.isArray(d.cobertura?.sin_coste))
    ok(`cobertura.sin_coste array (${d.cobertura.sin_coste.length} entrada(s))`)
  else
    fail('cobertura.sin_coste', `tipo: ${typeof d.cobertura?.sin_coste}`)

  // diferencias_inventario = null (sin conteos)
  if (d.diferencias_inventario === null)
    ok('diferencias_inventario = null (sin conteos en fixtures)')
  else
    fail('diferencias_inventario fixture', `got ${d.diferencias_inventario}`)

} catch (e) {
  if (e.message !== 'sin datos') fail('calcularMesBodega (excepción)', e.message)
}

// ── Parte 2: integración con restaurante real ──────────────────────────────────

const SUPABASE_URL    = Object.entries(process.env).find(([k]) => k.replace(/^﻿/, '') === 'NEXT_PUBLIC_SUPABASE_URL')?.[1]
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID  = process.env.TEST_RESTAURANTE_ID

if (!SUPABASE_URL || !SUPABASE_KEY || !RESTAURANTE_ID) {
  console.log('\n  ℹ  Variables de entorno no disponibles — se omite integración real.\n')
} else {
  section('2. Integración con restaurante real')

  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

  const { data: ultimoParte } = await db
    .from('partes_servicio')
    .select('fecha')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('estado', 'cerrado')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  const mesReal = ultimoParte?.fecha
    ? ultimoParte.fecha.slice(0, 7)
    : new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')

  console.log(`  Usando mes: ${mesReal}`)

  let dr
  try {
    dr = await calcularMesBodega({ restaurante_id: RESTAURANTE_ID, mes: mesReal, supabase: db })

    if (!dr) {
      fail('calcularMesBodega real devuelve datos', 'devolvió null/undefined')
    } else {
      ok('calcularMesBodega real ejecuta sin error')

      // Campos requeridos
      const required = ['ventas_bruto', 'ventas_neto', 'iva_pct', 'coste_ventas_teorico',
        'margen_bruto', 'compras_bruto', 'devoluciones', 'compras_netas',
        'gastos_total', 'resultado', 'partes_incluidos']
      const missing = required.filter(k => !(k in dr))
      if (missing.length === 0) ok('todos los campos requeridos presentes')
      else fail('campos requeridos', `faltan: ${missing.join(', ')}`)

      // IVA identity
      if (dr.iva_pct && dr.ventas_bruto > 0) {
        const exp = dr.ventas_bruto / (1 + dr.iva_pct / 100)
        if (cerca(dr.ventas_neto, exp, 0.05))
          ok(`ventas_neto ≈ ventas_bruto/(1+iva/100)  [${dr.ventas_neto.toFixed(2)}]`)
        else
          fail('ventas_neto identity real', `${dr.ventas_neto.toFixed(2)} ≠ ${exp.toFixed(2)}`)
      } else {
        console.log('  ℹ  Sin ventas o IVA nulo — se omite identity IVA')
      }

      // compras_netas identity
      const cn = dr.compras_bruto - dr.devoluciones
      if (cerca(dr.compras_netas, cn, 0.01))
        ok(`compras_netas = compras_bruto − devoluciones  [${dr.compras_netas.toFixed(2)}]`)
      else
        fail('compras_netas identity real', `${dr.compras_netas.toFixed(2)} ≠ ${cn.toFixed(2)}`)

      // resultado identity
      const diff = dr.diferencias_inventario ?? 0
      const res = dr.ventas_neto - dr.coste_ventas_teorico - dr.salidas_no_venta - diff - dr.gastos_total
      if (cerca(dr.resultado, res, 0.05))
        ok(`resultado identity real  [${dr.resultado.toFixed(2)}]`)
      else
        fail('resultado identity real', `${dr.resultado.toFixed(2)} ≠ ${res.toFixed(2)}`)
    }
  } catch (e) {
    fail('calcularMesBodega real', e.message)
  }
}

// ── Resultado ──────────────────────────────────────────────────────────────────

console.log(`\n────────────────────────────────────────────────────────────────`)
console.log(`  Resultado: ${passed} pasados, ${failed} fallidos`)
console.log(`────────────────────────────────────────────────────────────────\n`)
process.exit(failed > 0 ? 1 : 0)
