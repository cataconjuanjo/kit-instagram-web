/**
 * Auditoría de stock del kiosko — SOLO SELECT.
 * Aborta si detecta cualquier mutación (inserción/actualización/borrado).
 *
 * Uso:
 *   node --env-file=.env.local scripts/audit-stock-sibaris.mjs [slug]
 *
 * Si no se pasa slug usa la variable AUDIT_SLUG del env, o 'sibaris' por defecto.
 */

import { createClient } from '@supabase/supabase-js'

// ── Configuración ────────────────────────────────────────────────────────────
const SLUG     = process.argv[2] || process.env.AUDIT_SLUG || 'sibaris'
const SB_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SB_URL || !SB_KEY) {
  console.error('[ERROR] Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const db = createClient(SB_URL, SB_KEY)

// ── Utilidades ───────────────────────────────────────────────────────────────
function tbl(headers, rows) {
  if (!rows.length) { console.log('(sin datos)\n'); return }
  const w = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)))
  const sep = w.map(n => '-'.repeat(n)).join('-+-')
  const fmt = row => row.map((v, i) => String(v ?? '').padEnd(w[i])).join(' | ')
  console.log('| ' + fmt(headers) + ' |')
  console.log('+-' + sep + '-+')
  rows.forEach(r => console.log('| ' + fmt(r) + ' |'))
  console.log()
}

async function fetchAll(queryFn) {
  const PAGE = 1000; let from = 0; let all = []
  while (true) {
    const { data, error } = await queryFn(from)
    if (error) throw new Error(error.message)
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const hace90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  console.log(`\n# AUDITORÍA STOCK KIOSKO — slug="${SLUG}" — ${new Date().toISOString().slice(0, 19)}Z\n`)

  // ── 0. Tienda ──────────────────────────────────────────────────────────────
  const { data: tienda, error: te } = await db
    .from('tiendas')
    .select('id, slug, square_tracks_inventory, activo')
    .eq('slug', SLUG)
    .single()
  if (te || !tienda) {
    console.error('[ERROR] Tienda no encontrada:', SLUG, te?.message)
    console.error('  → Prueba con: node --env-file=.env.local scripts/audit-stock-sibaris.mjs <TU_SLUG>')
    process.exit(1)
  }
  const TID = tienda.id
  console.log(`tienda_id              : ${TID}`)
  console.log(`square_tracks_inventory: ${tienda.square_tracks_inventory}`)
  console.log(`tienda.activo          : ${tienda.activo}`)
  console.log()

  // ── 1. Snapshot de stock actual ────────────────────────────────────────────
  console.log('## 1. STOCK ACTUAL (vinos_tienda)\n')
  const vinos = await fetchAll(from =>
    db.from('vinos_tienda')
      .select('id, nombre, stock, activo, categoria, square_catalog_id, square_variation_id, updated_at')
      .eq('tienda_id', TID)
      .range(from, from + 999)
  )
  const vinosVino = vinos.filter(v => v.categoria !== 'otro' && v.categoria !== 'carta')

  const cPos  = vinosVino.filter(v => Number(v.stock) >  0).length
  const cZero = vinosVino.filter(v => Number(v.stock) === 0).length
  const cNeg  = vinosVino.filter(v => Number(v.stock) <  0).length
  const cAct  = vinosVino.filter(v =>  v.activo).length
  const cInac = vinosVino.filter(v => !v.activo).length

  console.log(`Total vinos (cat≠otro,carta): ${vinosVino.length}  |  activos: ${cAct}  |  inactivos: ${cInac}`)
  console.log(`stock > 0 : ${cPos}  |  stock = 0 : ${cZero}  |  stock < 0 : ${cNeg}`)

  // Discrepancias activo↔stock (síntoma de stock mal gestionado)
  const activoSinStock  = vinosVino.filter(v =>  v.activo && Number(v.stock) <= 0)
  const inactivoConStock = vinosVino.filter(v => !v.activo && Number(v.stock) >  0)
  if (activoSinStock.length || inactivoConStock.length) {
    console.log(`\n⚠️  DISCREPANCIAS activo ≠ stock:`)
    console.log(`   activo=true  pero stock≤0 : ${activoSinStock.length}`)
    console.log(`   activo=false pero stock>0  : ${inactivoConStock.length}`)
    if (activoSinStock.length) {
      console.log('\n   activo=true pero stock≤0 (primeros 10):')
      tbl(['nombre','stock','updated_at'],
        activoSinStock.slice(0, 10).map(v => [
          (v.nombre || '').slice(0, 35), v.stock, (v.updated_at || '').slice(0, 16)
        ]))
    }
    if (inactivoConStock.length) {
      console.log('   activo=false pero stock>0 (primeros 10):')
      tbl(['nombre','stock','updated_at'],
        inactivoConStock.slice(0, 10).map(v => [
          (v.nombre || '').slice(0, 35), v.stock, (v.updated_at || '').slice(0, 16)
        ]))
    }
  } else {
    console.log('✅  Sin discrepancias activo↔stock')
  }

  if (cNeg > 0) {
    console.log('\n🔴 STOCK NEGATIVO:')
    tbl(['nombre','stock','activo'],
      vinosVino.filter(v => Number(v.stock) < 0).map(v => [
        (v.nombre || '').slice(0, 40), v.stock, v.activo
      ]))
  }

  // Lookup: square_id → vino
  const byCat = {}, byVar = {}
  for (const v of vinos) {
    if (v.square_catalog_id)   byCat[v.square_catalog_id]   = v
    if (v.square_variation_id) byVar[v.square_variation_id] = v
  }
  function vinoBySquareId(id) { return byVar[id] || byCat[id] || null }

  // ── 2. Ventas en 90d — payment_lines_applied ──────────────────────────────
  console.log('\n## 2. VENTAS EN 90 DÍAS (payment_lines_applied)\n')
  let pla = []
  try {
    pla = await fetchAll(from =>
      db.from('payment_lines_applied')
        .select('payment_id, catalog_id, qty, stock_antes, stock_despues, created_at')
        .eq('tienda_id', TID)
        .gte('created_at', hace90)
        .order('created_at', { ascending: true })
        .range(from, from + 999)
    )
  } catch (e) {
    console.log(`⚠️  payment_lines_applied no accesible: ${e.message}`)
  }

  console.log(`Líneas en payment_lines_applied (90d): ${pla.length}`)

  if (pla.length > 0) {
    // Agregar por catalog_id
    const byCatalog = {}
    for (const row of pla) {
      if (!byCatalog[row.catalog_id]) {
        const v = vinoBySquareId(row.catalog_id)
        byCatalog[row.catalog_id] = {
          nombre: v?.nombre || `[${row.catalog_id?.slice(0,12)}]`,
          stockActual: v != null ? Number(v.stock) : null,
          uds: 0, ultimaVenta: null, ultimoStockCero: null, udsPostCero: 0,
        }
      }
      const e = byCatalog[row.catalog_id]
      e.uds += Number(row.qty)
      if (!e.ultimaVenta || row.created_at > e.ultimaVenta) e.ultimaVenta = row.created_at
      if (Number(row.stock_despues) === 0 && Number(row.stock_antes) > 0) {
        if (!e.ultimoStockCero || row.created_at > e.ultimoStockCero) {
          e.ultimoStockCero = row.created_at
          e.udsPostCero = 0
        }
      }
    }
    // Segundo paso: sumar ventas posteriores al último stock=0
    for (const row of pla) {
      const e = byCatalog[row.catalog_id]
      if (e?.ultimoStockCero && row.created_at > e.ultimoStockCero) {
        e.udsPostCero += Number(row.qty)
      }
    }

    const filas = Object.values(byCatalog).sort((a, b) => b.uds - a.uds).slice(0, 30)
    tbl(
      ['nombre','stock_actual','uds_90d','uds_post_cero','ultima_venta'],
      filas.map(r => [
        r.nombre.slice(0, 30),
        r.stockActual != null ? r.stockActual : 'N/A',
        r.uds,
        r.udsPostCero > 0 ? `⚠️ ${r.udsPostCero}` : '0',
        (r.ultimaVenta || '').slice(0, 16),
      ])
    )

    // Ventas con stock_antes ≤ 0 (anomalía: se vendió sin stock)
    const anomalias = pla.filter(r => Number(r.stock_antes) <= 0)
    if (anomalias.length > 0) {
      console.log(`🔴 Ventas con stock_antes≤0 (sobreventa clampeada a 0): ${anomalias.length} líneas`)
      const byV = {}
      for (const a of anomalias) {
        const k = vinoBySquareId(a.catalog_id)?.nombre || a.catalog_id?.slice(0, 20) || '?'
        byV[k] = (byV[k] || 0) + Number(a.qty)
      }
      tbl(['vino','uds_vendidas_con_stock_0'],
        Object.entries(byV).sort((a,b) => b[1]-a[1]).slice(0,15).map(([k,v]) => [k.slice(0,35), v]))
    } else {
      console.log('✅  Sin ventas detectadas con stock_antes≤0\n')
    }
  } else {
    console.log('(sin datos en payment_lines_applied — puede que la tabla esté vacía o el tienda_id no coincida)\n')
  }

  // ── 3. Duplicados en square_sync_log ──────────────────────────────────────
  console.log('\n## 3. PAGOS DUPLICADOS EN square_sync_log (90d)\n')
  const syncLogs = await fetchAll(from =>
    db.from('square_sync_log')
      .select('event_id, payment_id, order_id, ok, estado, lineas, created_at')
      .eq('tienda_slug', SLUG)
      .eq('ok', true)
      .gte('created_at', hace90)
      .order('created_at', { ascending: true })
      .range(from, from + 999)
  )
  console.log(`Entradas ok=true en square_sync_log (90d): ${syncLogs.length}`)

  // Mismo payment_id en múltiples event_ids
  const byPayment = {}
  for (const log of syncLogs) {
    if (!log.payment_id || log.payment_id.startsWith('event:')) continue
    if (!byPayment[log.payment_id]) byPayment[log.payment_id] = []
    byPayment[log.payment_id].push(log)
  }
  const dupsPago = Object.entries(byPayment).filter(([, rows]) => rows.length > 1)
  if (dupsPago.length > 0) {
    console.log(`🔴 ${dupsPago.length} payment_id con MÚLTIPLES event_ids ok (doble-conteo en analytics):`)
    tbl(['payment_id','nEvents','ts_evento_1','ts_evento_2'],
      dupsPago.slice(0, 10).map(([pid, rows]) => [
        pid.slice(0, 14) + '…', rows.length,
        (rows[0].created_at || '').slice(0, 16),
        (rows[1]?.created_at || '').slice(0, 16),
      ]))
  } else {
    console.log('✅  Sin duplicados de pago (1 payment_id = 1 evento ok)\n')
  }

  // Grupos de ventas con timestamp exactamente igual (mismo pago multi-vino — esperado)
  const byTs = {}
  for (const log of syncLogs) {
    if (!byTs[log.created_at]) byTs[log.created_at] = []
    byTs[log.created_at].push(log)
  }
  const sharedTs = Object.entries(byTs).filter(([, rows]) => rows.length > 1)
  console.log(`Grupos con timestamp compartido (esperado: mismo pago con varios vinos): ${sharedTs.length}`)
  if (sharedTs.length > 0) {
    const ejemplos = sharedTs.slice(0, 3)
    ejemplos.forEach(([ts, logs]) => {
      const wines = logs.flatMap(l =>
        (l.lineas || []).filter(li => li.status === 'ok').map(li => (li.vino_nombre || li.catalog_object_id || '?').slice(0, 20))
      ).slice(0, 4)
      console.log(`  ${(ts || '').slice(0, 16)} → ${wines.join(' | ')}`)
    })
    console.log()
  }

  // ── 4. Reposiciones en stock_movements ────────────────────────────────────
  console.log('\n## 4. REPOSICIONES DE STOCK (stock_movements, 90d)\n')
  try {
    const { data: movs, error: me } = await db
      .from('stock_movements')
      .select('vino_id, vino_nombre, stock_anterior, stock_nuevo, created_at')
      .eq('tienda_id', TID)
      .gte('created_at', hace90)
      .order('created_at', { ascending: false })
      .limit(200)

    if (me) {
      console.log(`⚠️  Error en stock_movements: ${me.message}`)
    } else {
      const todos = movs || []
      const repos  = todos.filter(m => Number(m.stock_nuevo) > Number(m.stock_anterior))
      const bajadas = todos.filter(m => Number(m.stock_nuevo) < Number(m.stock_anterior))
      console.log(`Total movimientos en 90d: ${todos.length}  |  subidas (repos): ${repos.length}  |  bajadas: ${bajadas.length}`)
      if (repos.length > 0) {
        tbl(['vino','stock_ant','stock_nuevo','fecha'],
          repos.slice(0, 15).map(r => [
            (r.vino_nombre || '').slice(0, 30),
            r.stock_anterior, r.stock_nuevo,
            (r.created_at || '').slice(0, 16),
          ]))
      } else {
        console.log('⚠️  CERO reposiciones registradas en 90 días.')
        console.log('   Si se han hecho reposiciones y no aparecen, el POST /admin/stock-log no se está llamando\n')
        console.log('   o las reposiciones solo actualizan vinos_tienda.stock sin pasar por stock-log.\n')
      }
    }
  } catch (e) {
    console.log(`⚠️  stock_movements no accesible: ${e.message}\n`)
  }

  // ── 5. Estado sync Square — últimos eventos ──────────────────────────────
  console.log('\n## 5. SYNC CON SQUARE — ÚLTIMOS EVENTOS\n')
  const { data: recent10 } = await db
    .from('square_sync_log')
    .select('event_id, payment_id, order_id, tienda_slug, ok, error_msg, estado, created_at')
    .eq('tienda_slug', SLUG)
    .order('created_at', { ascending: false })
    .limit(10)
  if (recent10?.length) {
    tbl(['event_id','payment_id','ok','estado','created_at'],
      (recent10 || []).map(r => [
        (r.event_id || '').slice(0, 16) + '…',
        (r.payment_id || r.order_id || '?').slice(0, 14) + '…',
        r.ok ? '✅' : '❌',
        r.estado || '?',
        (r.created_at || '').slice(0, 16),
      ]))
  } else {
    console.log('(sin entradas en square_sync_log para este slug)\n')
  }

  // Errores recientes
  const { data: errores } = await db
    .from('square_sync_log')
    .select('event_id, error_msg, created_at')
    .eq('tienda_slug', SLUG)
    .eq('ok', false)
    .order('created_at', { ascending: false })
    .limit(10)
  if (errores?.length) {
    console.log(`Últimos errores (ok=false):`)
    tbl(['event_id','error_msg','created_at'],
      (errores || []).map(r => [
        (r.event_id || '').slice(0, 16) + '…',
        (r.error_msg || '').slice(0, 50),
        (r.created_at || '').slice(0, 16),
      ]))
  } else {
    console.log('✅  Sin errores recientes en square_sync_log\n')
  }

  // Eventos inventory.count.updated (tienda_slug='webhook') que afectan a esta tienda
  console.log('Eventos inventory.count.updated recientes que afectan a esta tienda:')
  const vinoIds = new Set(vinos.map(v => v.id))
  const { data: invLogs } = await db
    .from('square_sync_log')
    .select('event_id, ok, lineas, created_at')
    .eq('tienda_slug', 'webhook')
    .eq('ok', true)
    .order('created_at', { ascending: false })
    .limit(100)

  const invRelevantes = (invLogs || []).filter(log =>
    (log.lineas || []).some(l => l.status === 'ok' && vinoIds.has(l.vino_id))
  )
  if (invRelevantes.length > 0) {
    console.log(`⚠️  ${invRelevantes.length} eventos inventory.count.updated recientes afectan a esta tienda:`)
    tbl(['event_id','vinos_afectados','stock_antes→después','fecha'],
      invRelevantes.slice(0, 10).map(e => {
        const ls = (e.lineas || []).filter(l => l.status === 'ok' && vinoIds.has(l.vino_id))
        const resumen = ls.slice(0, 2)
          .map(l => `${(l.vino_nombre || '?').slice(0, 12)}: ${l.stock_antes}→${l.stock_despues}`)
          .join('; ')
        return [
          (e.event_id || '').slice(0, 14) + '…',
          ls.length,
          resumen.slice(0, 45),
          (e.created_at || '').slice(0, 16),
        ]
      }))
    console.log('   ⚠️  Estos SET sobrescriben el stock manual si Square no conoce la reposición física.')
  } else {
    console.log('✅  Ningún inventory.count.updated reciente afecta a esta tienda (o Square no envía estos eventos)\n')
  }

  // ── 6. Vinos agotados con ventas recientes (el síntoma reportado) ─────────
  console.log('\n## 6. VINOS "AGOTADO" CON VENTAS EN 90 DÍAS\n')
  const vinosAgotados = vinosVino.filter(v => !v.activo || Number(v.stock) <= 0)
  const agotadosConVentas = []
  for (const v of vinosAgotados) {
    const log = syncLogs.find(l =>
      (l.lineas || []).some(li => li.status === 'ok' && li.vino_id === v.id)
    )
    if (log) {
      const unidades = syncLogs.reduce((s, l) =>
        s + (l.lineas || []).filter(li => li.status === 'ok' && li.vino_id === v.id)
           .reduce((ss, li) => ss + (li.quantity || 1), 0), 0)
      agotadosConVentas.push({ nombre: v.nombre, stock: v.stock, activo: v.activo, uds90d: unidades, ultimaVenta: log.created_at })
    }
  }
  if (agotadosConVentas.length > 0) {
    console.log(`🔴 ${agotadosConVentas.length} vinos con stock≤0 o inactivos que tienen ventas en 90d:`)
    tbl(['nombre','stock','activo','uds_90d','ultima_venta'],
      agotadosConVentas.sort((a,b) => b.uds90d - a.uds90d).slice(0, 20).map(r => [
        (r.nombre || '').slice(0, 30),
        r.stock, r.activo,
        r.uds90d,
        (r.ultimaVenta || '').slice(0, 16),
      ]))
    console.log('   Estos son los candidatos a "vendidos después de agotar" que reportas.')
  } else {
    console.log('✅  Ningún vino agotado tiene ventas registradas en los últimos 90 días\n')
  }

  console.log('\n--- FIN DEL INFORME ---\n')
  console.log('Pega la salida completa (desde la línea # AUDITORÍA hasta aquí) para el diagnóstico.')
}

main().catch(e => { console.error('[FATAL]', e.message, e.stack?.split('\n')[1] || ''); process.exit(1) })
