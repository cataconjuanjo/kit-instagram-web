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
