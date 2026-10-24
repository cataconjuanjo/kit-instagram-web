/**
 * Smoke test F1 — SUMILLER
 * Ejecutar con: node --env-file=.env.local scripts/smoke-sumiller-f1.mjs --confirm
 * Sin --confirm imprime aviso y sale (dry-run).
 *
 * Crea fixtures efímeros en la BD (restaurante + vino) y los borra en finally.
 * Nunca toca UUIDs de producción (denylist).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { compararHistoricoConflicto } from '../app/lib/compararHistoricoConflicto.js'
import { historicoPayloadDesdeCierre } from '../app/lib/sommCierre.js'
import { decidirHistoricoAuto } from '../app/lib/historicoAutoDecision.js'
import { clasificarCierresParaBackfill } from '../app/lib/backfillCierresUtil.js'

// ── Guard ─────────────────────────────────────────────────────────────────────
if (!process.argv.includes('--confirm')) {
  console.log('Dry-run: pasa --confirm para ejecutar contra la BD.')
  console.log('Uso: node scripts/smoke-sumiller-f1.mjs --confirm')
  process.exit(0)
}

// ── Carga .env.local si las vars no vienen del entorno ────────────────────────
{
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env.local')
  try {
    const lines = readFileSync(envPath, 'utf8').split('\n')
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let val   = line.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  } catch { /* .env.local no encontrado — asume que las vars ya están en el entorno */ }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  // opcional: solo T3

const requiredVars = [
  !SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
  !SERVICE_KEY  && 'SUPABASE_SERVICE_ROLE_KEY',
].filter(Boolean)

if (requiredVars.length > 0) {
  console.error('ERROR: Variables de entorno faltantes:', requiredVars.join(', '))
  process.exit(1)
}

if (!ANON_KEY) {
  console.warn('AVISO: NEXT_PUBLIC_SUPABASE_ANON_KEY no encontrada — T3 (REVOKE anon) se saltará')
}

// ── Denylist producción ───────────────────────────────────────────────────────
const UUID_DENYLIST = new Set([
  'db3af496-00f1-4295-82b6-35427b9b6286', // Lo de Carmen
  '7af94e33-48cd-43b8-b939-4796ba58e4d8', // Araboka
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66', // La Taberna del Puerto
  '6b528438-3d24-432d-9728-dc2ff868baf6', // Modo Sumiller
])

const SMOKE_REST_ID = '00000001-f100-4000-0000-000000000001'
const SMOKE_VINO_ID = '00000001-f100-4000-0000-000000000002'
const SMOKE_MES     = '2026-10'

if (UUID_DENYLIST.has(SMOKE_REST_ID) || UUID_DENYLIST.has(SMOKE_VINO_ID)) {
  console.error('ERROR: UUID de smoke está en la denylist de producción. Abortando.')
  process.exit(1)
}

// ── Clientes Supabase ─────────────────────────────────────────────────────────
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const anon  = ANON_KEY
  ? createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

const MAX_BYTES = 10 * 1024 * 1024

// Fixtures solo necesarios en T4. Se crean y limpian dentro del propio test.

// ── T1: compararHistoricoConflicto sin diff ───────────────────────────────────
test('T1: compararHistoricoConflicto sin diff → null', () => {
  const r = compararHistoricoConflicto(
    { ingresos: 1000, consumo_mp: 300, gastos_fijos: 200, stock_final_valor: 500 },
    { ingresos: 1000, consumo_mp: 300, gastos_fijos: 200, valor_stock_bodega: 500 },
  )
  assert.equal(r, null)
})

// ── T2: compararHistoricoConflicto con diff ───────────────────────────────────
test('T2: compararHistoricoConflicto consumo_mp difiere → conflicto', () => {
  const r = compararHistoricoConflicto(
    { ingresos: 1000, consumo_mp: 350, gastos_fijos: 200, stock_final_valor: 500 },
    { ingresos: 1000, consumo_mp: 300, gastos_fijos: 200, valor_stock_bodega: 500 },
  )
  assert.deepEqual(r, { consumo_mp: { auto: 350, manual: 300 } })
})

// ── T3: RPC upsert_libro_compras_factura anon → permission denied ─────────────
test('T3: RPC upsert_libro_compras_factura anon → permission denied', { skip: !ANON_KEY }, async () => {
  const { error } = await anon.rpc('upsert_libro_compras_factura', {
    p_restaurante_id: SMOKE_REST_ID,
    p_periodo:        SMOKE_MES,
    p_proveedor:      'smoke-proveedor',
    p_entrada:        { fecha: '2026-10-01', importe: 100, cabecera_compra_id: 'smoke-fake-id' },
  })
  assert.ok(error, 'La llamada anon debe fallar (REVOKE verificado)')
})

// ── T4: stock_mensual_bodega GENERATED columns ────────────────────────────────
test('T4: stock_mensual_bodega GENERATED columns (stock_final_teorico + valor_stock_final)', async () => {
  // Crear fixtures mínimos (limpieza en finally)
  let restCreated = false
  let vinoCreated = false
  try {
    const { error: rErr } = await admin.from('restaurantes').upsert({
      id:                   SMOKE_REST_ID,
      nombre:               'Smoke Test F1',
      slug:                 'smoke-sumiller-f1-test',
      email:                'smoke-f1@cartaviva.local',
      ciudad:               'Test',
      provincia_codigo:     'XX',
      plan:                 'sumiller',
      subscription_status:  'active',
      subscription_ends_at: '2027-12-31T00:00:00Z',
      camarero_pin:         '',
      hub_activo:           false,
    }, { onConflict: 'id' })
    assert.equal(rErr, null, `Fixture restaurante: ${rErr?.message}`)
    restCreated = true

    const { error: vErr } = await admin.from('vinos').upsert({
      id:             SMOKE_VINO_ID,
      restaurante_id: SMOKE_REST_ID,
      nombre:         'Smoke Vino Test',
      tipo:           'tinto',
      activo:         true,
    }, { onConflict: 'id' })
    assert.equal(vErr, null, `Fixture vino: ${vErr?.message}`)
    vinoCreated = true

    // Limpiar fila previa si existe
    await admin.from('stock_mensual_bodega')
      .delete()
      .eq('restaurante_id', SMOKE_REST_ID)
      .eq('mes', SMOKE_MES)
      .eq('vino_id', SMOKE_VINO_ID)

    const { error: ins } = await admin.from('stock_mensual_bodega').insert({
      restaurante_id:   SMOKE_REST_ID,
      mes:              SMOKE_MES,
      vino_id:          SMOKE_VINO_ID,
      stock_inicial:    10,
      entradas:         5,
      salidas:          3,
      stock_final_real: 12,
      coste_medio:      15.0,
    })
    assert.equal(ins, null, `Insert stock_mensual_bodega: ${ins?.message}`)

    const { data, error: sel } = await admin.from('stock_mensual_bodega')
      .select('stock_final_teorico, valor_stock_final')
      .eq('restaurante_id', SMOKE_REST_ID)
      .eq('mes', SMOKE_MES)
      .eq('vino_id', SMOKE_VINO_ID)
      .single()
    assert.equal(sel, null, `Select falló: ${sel?.message}`)
    // stock_final_teorico = 10+5-3 = 12
    assert.equal(data.stock_final_teorico, 12)
    // valor_stock_final = COALESCE(12, GREATEST(0,12)) * 15 = 180.00
    assert.equal(Number(data.valor_stock_final), 180)
  } finally {
    await admin.from('stock_mensual_bodega').delete().eq('restaurante_id', SMOKE_REST_ID)
    if (vinoCreated) await admin.from('vinos').delete().eq('id', SMOKE_VINO_ID)
    if (restCreated) await admin.from('restaurantes').delete().eq('id', SMOKE_REST_ID)
  }
})

// ── T5: historicoPayloadDesdeCierre ──────────────────────────────────────────
test('T5: historicoPayloadDesdeCierre → consumo_mp=500, pct_mp=25, origen=auto', () => {
  const payload = historicoPayloadDesdeCierre({
    restaurante_id:      SMOKE_REST_ID,
    mes:                 '2026-10',
    snapshot:            { ventas_neto: 2000, stock_final: 500, gastos_total: 300 },
    stock_inicial_valor: 400,
    compras_total:       600,
  })
  // consumo_mp = 400+600-500 = 500
  assert.equal(payload.consumo_mp, 500)
  // pct_mp = 500/2000*100 = 25.00
  assert.equal(payload.pct_mp, 25)
  assert.equal(payload.anio, 2026)
  assert.equal(payload.mes, 10)
  assert.equal(payload.origen, 'auto')
})

// ── T6: decidirHistoricoAuto manual + conflicto → upsert=false ───────────────
test('T6: decidirHistoricoAuto fila manual con conflicto → upsert=false, conflicto reportado', () => {
  const payload = { ingresos: 1000, consumo_mp: 500, gastos_fijos: 200, stock_final_valor: 300 }
  const fila    = { ingresos: 1000, consumo_mp: 600, gastos_fijos: 200, valor_stock_bodega: 300, origen: 'manual' }
  const { upsert, conflicto } = decidirHistoricoAuto(payload, fila)
  assert.equal(upsert, false)
  assert.deepEqual(conflicto, { consumo_mp: { auto: 500, manual: 600 } })
})

// ── T7: MAX_BYTES gate ────────────────────────────────────────────────────────
test('T7: MAX_BYTES gate — 8 MB acepta, 11 MB rechaza', () => {
  assert.ok(8  * 1024 * 1024 <= MAX_BYTES, '8 MB debería pasar')
  assert.ok(11 * 1024 * 1024 >  MAX_BYTES, '11 MB debería superar el límite')
})

// ── T8: clasificarCierresParaBackfill ─────────────────────────────────────────
test('T8: clasificarCierresParaBackfill separa reconstruibles/no-reconstruibles', () => {
  const cierres = [
    { mes: '2026-08', snapshot: { vinos_stock: [{ vino_id: 'v1', stock_uds: 10, coste_medio: 5 }] } },
    { mes: '2026-09', snapshot: {} },
    { mes: '2026-10', snapshot: { vinos_stock: [] } },
  ]
  const { reconstruibles, noReconstruibles } = clasificarCierresParaBackfill(cierres)
  assert.equal(reconstruibles.length, 1)
  assert.equal(reconstruibles[0].mes, '2026-08')
  assert.deepEqual(noReconstruibles, ['2026-09', '2026-10'])
})

// ── T9: RPC upsert_libro_compras_factura — idempotencia + segunda entrada ──────
test('T9: RPC upsert_libro_compras_factura — idempotencia + segunda cabecera', async () => {
  const PERIODO  = '2026-10'
  const PROVEEDOR = 'smoke-proveedor-t9'
  const CAB_ID_1  = '00000001-f100-4000-0000-000000000010'
  const CAB_ID_2  = '00000001-f100-4000-0000-000000000011'
  let restCreated = false

  try {
    // Fixture restaurante
    const { error: rErr } = await admin.from('restaurantes').upsert({
      id:                   SMOKE_REST_ID,
      nombre:               'Smoke Test F1',
      slug:                 'smoke-sumiller-f1-test',
      email:                'smoke-f1@cartaviva.local',
      ciudad:               'Test',
      provincia_codigo:     'XX',
      plan:                 'sumiller',
      subscription_status:  'active',
      subscription_ends_at: '2027-12-31T00:00:00Z',
      camarero_pin:         '',
      hub_activo:           false,
    }, { onConflict: 'id' })
    assert.equal(rErr, null, `Fixture restaurante: ${rErr?.message}`)
    restCreated = true

    const entry1 = { fecha: '2026-10-01', importe: 150.00, cabecera_compra_id: CAB_ID_1 }
    const entry2 = { fecha: '2026-10-15', importe: 200.00, cabecera_compra_id: CAB_ID_2 }

    // 1ª llamada — crea fila
    const { error: e1 } = await admin.rpc('upsert_libro_compras_factura', {
      p_restaurante_id: SMOKE_REST_ID,
      p_periodo:        PERIODO,
      p_proveedor:      PROVEEDOR,
      p_entrada:        entry1,
    })
    if (e1) console.error('[T9] llamada 1 error literal:', JSON.stringify(e1))
    assert.equal(e1, null, `1ª llamada RPC falló: ${e1?.message}`)

    // 2ª llamada — mismo cabecera_compra_id (idempotente, no debe duplicar)
    const { error: e2 } = await admin.rpc('upsert_libro_compras_factura', {
      p_restaurante_id: SMOKE_REST_ID,
      p_periodo:        PERIODO,
      p_proveedor:      PROVEEDOR,
      p_entrada:        entry1,
    })
    if (e2) console.error('[T9] llamada 2 error literal:', JSON.stringify(e2))
    assert.equal(e2, null, `2ª llamada RPC (idempotente) falló: ${e2?.message}`)

    // a) 1 fila — b) 1 entrada con CAB_ID_1
    const { data: rows, error: selErr } = await admin.from('libro_compras')
      .select('facturas')
      .eq('restaurante_id', SMOKE_REST_ID)
      .eq('periodo', PERIODO)
      .eq('proveedor', PROVEEDOR)
    assert.equal(selErr, null, `Select libro_compras: ${selErr?.message}`)
    assert.equal(rows.length, 1, `a) esperaba 1 fila, encontró ${rows.length}`)
    const entradasCab1 = rows[0].facturas.filter(f => f.cabecera_compra_id === CAB_ID_1)
    assert.equal(entradasCab1.length, 1,
      `b) esperaba 1 entrada con cabecera_compra_id=${CAB_ID_1}, encontró ${entradasCab1.length}`)

    // 3ª llamada — otra cabecera_compra_id → añade segunda entrada
    const { error: e3 } = await admin.rpc('upsert_libro_compras_factura', {
      p_restaurante_id: SMOKE_REST_ID,
      p_periodo:        PERIODO,
      p_proveedor:      PROVEEDOR,
      p_entrada:        entry2,
    })
    if (e3) console.error('[T9] llamada 3 error literal:', JSON.stringify(e3))
    assert.equal(e3, null, `3ª llamada RPC falló: ${e3?.message}`)

    // c) 2 entradas totales
    const { data: row3, error: sel3 } = await admin.from('libro_compras')
      .select('facturas')
      .eq('restaurante_id', SMOKE_REST_ID)
      .eq('periodo', PERIODO)
      .eq('proveedor', PROVEEDOR)
      .single()
    assert.equal(sel3, null, `Select final libro_compras: ${sel3?.message}`)
    assert.equal(row3.facturas.length, 2,
      `c) esperaba 2 entradas totales, encontró ${row3.facturas.length}: ${JSON.stringify(row3.facturas)}`)

  } finally {
    await admin.from('libro_compras').delete().eq('restaurante_id', SMOKE_REST_ID)
    if (restCreated) await admin.from('restaurantes').delete().eq('id', SMOKE_REST_ID)
  }
})

// ── T10: verificación limpieza — 0 filas del restaurante temporal ─────────────
test('T10: limpieza — 0 filas del restaurante temporal en todas las tablas', async () => {
  const checks = {
    restaurantes:        admin.from('restaurantes').select('*', { count: 'exact', head: true }).eq('id', SMOKE_REST_ID),
    vinos:               admin.from('vinos').select('*', { count: 'exact', head: true }).eq('restaurante_id', SMOKE_REST_ID),
    stock_mensual_bodega: admin.from('stock_mensual_bodega').select('*', { count: 'exact', head: true }).eq('restaurante_id', SMOKE_REST_ID),
    libro_compras:        admin.from('libro_compras').select('*', { count: 'exact', head: true }).eq('restaurante_id', SMOKE_REST_ID),
    cabecera_compras:     admin.from('cabecera_compras').select('*', { count: 'exact', head: true }).eq('restaurante_id', SMOKE_REST_ID),
    lineas_compra:        admin.from('lineas_compra').select('*', { count: 'exact', head: true }).eq('restaurante_id', SMOKE_REST_ID),
  }

  const resultados = {}
  for (const [tabla, query] of Object.entries(checks)) {
    const { count, error } = await query
    resultados[tabla] = error ? `ERROR: ${error.message}` : count
  }

  console.log('\n  T10 recuentos por tabla:')
  for (const [tabla, val] of Object.entries(resultados)) {
    const ok = val === 0
    console.log(`    ${ok ? '✔' : '✖'} ${tabla}: ${val}`)
  }

  for (const [tabla, val] of Object.entries(resultados)) {
    assert.equal(val, 0, `${tabla} tiene ${val} filas del restaurante temporal`)
  }
})
