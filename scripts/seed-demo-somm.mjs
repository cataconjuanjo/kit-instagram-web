#!/usr/bin/env node
/**
 * seed-demo-somm.mjs — Fase 1b
 * Siembra tablas Somm para el restaurante DEMO: precios, proveedores, cierres,
 * explotación, libro de compras, pricing, tramos, presupuesto y bonus.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-demo-somm.mjs                             # dry-run
 *   node --env-file=.env.local scripts/seed-demo-somm.mjs --confirm --nombre "Casa Marisma"
 *
 * Requisitos: SEED_DEMO_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { fileURLToPath } from 'url'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── flags ─────────────────────────────────────────────────────────────────────
const DRY_RUN    = !process.argv.includes('--confirm')
const NOMBRE_IDX = process.argv.indexOf('--nombre')
const NOMBRE     = NOMBRE_IDX !== -1 ? process.argv[NOMBRE_IDX + 1] : null

if (!DRY_RUN && !NOMBRE) {
  console.error('ERROR: --confirm requiere --nombre "<nombre del restaurante DEMO>"')
  console.error('Ejemplo: node --env-file=.env.local scripts/seed-demo-somm.mjs --confirm --nombre "Casa Marisma"')
  process.exit(1)
}

// ── DEMO_ID + denylist de UUIDs ───────────────────────────────────────────────
const DEMO_ID = process.env.SEED_DEMO_ID
if (!DEMO_ID) { console.error('ERROR: SEED_DEMO_ID no está definido'); process.exit(1) }

const UUID_DENYLIST = new Set([
  'db3af496-00f1-4295-82b6-35427b9b6286', // Lo de Carmen
  '7af94e33-48cd-43b8-b939-4796ba58e4d8', // Araboka
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66', // La Taberna del Puerto
  '6b528438-3d24-432d-9728-dc2ff868baf6', // Modo Sumiller
])
if (UUID_DENYLIST.has(DEMO_ID)) {
  console.error(`ERROR: SEED_DEMO_ID ${DEMO_ID} está en la denylist de UUIDs`)
  process.exit(1)
}

// ── Denylist de nombres protegidos ────────────────────────────────────────────
const NAME_DENYLIST = ['lo de carmen', 'araboka', 'la taberna', 'modo sumiller']

// ── Meses de simulación ───────────────────────────────────────────────────────
const MESES_SIM = [
  '2025-10','2025-11','2025-12',
  '2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
  '2026-07','2026-08','2026-09',
]

// ── Gastos bodega imputados (reducidos frente a gastos totales del restaurante)
// Objetivo: margen explotación anual ~25-30 %; ene-feb en torno a 0.
const PERSONAL_BODEGA    = [1700,1700,1800, 1700,1700,1750,1800,1850,1950,2000,2000,1900]
const SUMINISTROS_BODEGA = [300, 300, 320,  300, 300, 310, 320, 330, 350, 370, 380, 360]
const ALQUILER_BODEGA    = 900  // proporcional fijo/mes

// ── Fórmula precio_botella: PVP = coste / (1 − m) × 1.10 ─────────────────────
function marginPct(coste) {
  if (coste < 5)  return 0.68
  if (coste < 12) return 0.65
  if (coste < 25) return 0.62
  return 0.60
}

function calcPvpBotella(coste) {
  const m   = marginPct(coste)
  const raw = coste / (1 - m) * 1.10
  if (coste >= 25) return Math.round(raw / 5) * 5   // múltiplo de 5€
  return Math.round(raw)                             // entero
}

function margenBotella(coste, pvp) {
  if (!pvp || !coste) return null
  const pvpNeto = pvp / 1.10
  return Math.round((pvpNeto - coste) / pvpNeto * 100)
}

// ── Helpers de impresión ──────────────────────────────────────────────────────
function showTable(label, rows) {
  console.log(`\n  ${label} — ${rows.length} fila(s)`)
  for (const r of rows.slice(0, 2)) console.log('   ', JSON.stringify(r))
  if (rows.length > 2) console.log(`    … ${rows.length - 2} más`)
}

function printVinosTable(vinoTable, warnings) {
  const hdr = '  ' +
    'nombre'.padEnd(38) +
    'coste'.padStart(7) +
    'pvp_bot'.padStart(9) +
    'margen'.padStart(8) +
    '  proveedor'
  console.log('\n' + hdr)
  console.log('  ' + '─'.repeat(hdr.length - 2))
  for (const r of vinoTable) {
    const costeStr = Number(r.coste) > 0 ? r.coste.toFixed(2) : '—'
    const pvpStr   = r.pvp_bot !== null ? `${r.pvp_bot}€` : 'N/A'
    const margStr  = r.margen !== null ? `${r.margen}%` : 'N/A'
    const provStr  = (r.proveedor || '—').slice(0, 30)
    console.log(
      '  ' +
      (r.nombre || '').slice(0, 37).padEnd(38) +
      costeStr.padStart(7) +
      pvpStr.padStart(9) +
      margStr.padStart(8) +
      '  ' + provStr
    )
  }
  if (warnings.length > 0) {
    console.log(`\n  ⚠  ${warnings.length} vino(s) con margen botella < 55 % (fuera de lo previsto):`)
    for (const w of warnings) {
      console.log(`     ${w.nombre}: coste=${w.coste.toFixed(2)}€, pvp=${w.pvp}€, margen=${w.margen}%`)
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPA_URL || !SUPA_KEY) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no definidos')
    process.exit(1)
  }
  const supabase = createClient(SUPA_URL, SUPA_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Verificación de nombre y denylist ──────────────────────────────────────
  const { data: rest } = await supabase
    .from('restaurantes')
    .select('nombre')
    .eq('id', DEMO_ID)
    .maybeSingle()
  const dbName = (rest?.nombre ?? '').trim()

  // Denylist por nombre (siempre activa, dry-run o confirm)
  for (const denied of NAME_DENYLIST) {
    if (dbName.toLowerCase().includes(denied)) {
      console.error(`ERROR: el restaurante "${dbName}" (${DEMO_ID}) está protegido y no puede modificarse con este script.`)
      process.exit(1)
    }
  }

  // En confirm, --nombre debe coincidir exactamente (case-insensitive) con la BD
  if (!DRY_RUN) {
    if (dbName.toLowerCase() !== NOMBRE.trim().toLowerCase()) {
      console.error(`ERROR: --nombre "${NOMBRE}" no coincide con el nombre en la BD: "${dbName}"`)
      process.exit(1)
    }
  }

  const mode = DRY_RUN ? '[DRY-RUN]' : `[CONFIRM — ${dbName}]`
  console.log(`\n${mode} seed-demo-somm  DEMO_ID=${DEMO_ID}  restaurante="${dbName}"\n`)

  // ═══════════════════════════════════════════════════════════════════════════
  // S0: Actualizar restaurant_economic_settings.gastos_mensuales
  //     (gastos bodega imputados — más bajos que los gastos totales del local)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('[S0] Actualizando gastos_mensuales bodega (personal 1700-2000€, alquiler 900€, suministros 300-380€)...')

  const newGastosArr = []
  MESES_SIM.forEach((mes, i) => {
    newGastosArr.push({ mes, concepto: 'Alquiler local', importe: ALQUILER_BODEGA })
    newGastosArr.push({ mes, concepto: 'Personal sala',  importe: PERSONAL_BODEGA[i] })
    newGastosArr.push({ mes, concepto: 'Suministros',    importe: SUMINISTROS_BODEGA[i] })
  })

  // Resumen compacto de los 12 meses
  console.log('\n  mes       personal  alquiler  suminist  total')
  console.log('  ─────────────────────────────────────────────')
  MESES_SIM.forEach((mes, i) => {
    const tot = PERSONAL_BODEGA[i] + ALQUILER_BODEGA + SUMINISTROS_BODEGA[i]
    console.log(
      `  ${mes}   ${String(PERSONAL_BODEGA[i]).padStart(6)}    ${String(ALQUILER_BODEGA).padStart(5)}    ${String(SUMINISTROS_BODEGA[i]).padStart(5)}  ${String(tot).padStart(5)}`
    )
  })

  if (!DRY_RUN) {
    const { error } = await supabase.from('restaurant_economic_settings')
      .update({ gastos_mensuales: newGastosArr })
      .eq('restaurante_id', DEMO_ID)
    if (error) throw new Error(`S0: ${error.message}`)
    console.log('   ✓')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S1: vinos — precio_botella, proveedor, referencia_proveedor, stock_minimo
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S1] Calculando precio_botella + proveedor (todos los vinos)...')

  const { data: vinos, error: vinosErr } = await supabase
    .from('vinos')
    .select('id, nombre, coste_compra, coste_medio_pmp, precio_botella, catalogo_vino_id')
    .eq('restaurante_id', DEMO_ID)
  if (vinosErr) throw new Error(`S1 vinos: ${vinosErr.message}`)

  // Resolver cadena catálogo → proveedor
  const catalogIds = [...new Set((vinos || []).map(v => v.catalogo_vino_id).filter(Boolean))]
  const { data: catRows } = catalogIds.length
    ? await supabase.from('proveedor_catalogo_vinos').select('id, proveedor_id, referencia').in('id', catalogIds)
    : { data: [] }

  const provIds = [...new Set((catRows || []).map(r => r.proveedor_id).filter(Boolean))]
  const { data: provRows } = provIds.length
    ? await supabase.from('proveedores_vino').select('id, nombre').in('id', provIds)
    : { data: [] }

  const catMap  = Object.fromEntries((catRows  || []).map(r => [r.id, r]))
  const provMap = Object.fromEntries((provRows || []).map(r => [r.id, r.nombre]))

  const vinoProveedorById = {}  // vino_id → proveedor string (usado en S5)

  const vinoTable     = []
  const vinoUpdates   = []
  const margWarnings  = []
  const soloCopaNew   = []  // wines that had no precio_botella but now get one (B6)

  for (const v of vinos || []) {
    const coste  = Number(v.coste_medio_pmp) || Number(v.coste_compra) || 0
    const cat    = v.catalogo_vino_id ? catMap[v.catalogo_vino_id] : null
    const prov   = cat ? (provMap[cat.proveedor_id] ?? null) : null
    const ref    = cat?.referencia ?? null

    vinoProveedorById[v.id] = prov

    // Precio botella: todos los vinos con coste conocido (incluye antes solo-copa sin PVP)
    const newPvp = coste > 0 ? calcPvpBotella(coste) : null
    const marg   = margenBotella(coste, newPvp)

    // Registrar vinos que antes no tenían precio_botella y ahora lo reciben (B6)
    if (newPvp !== null && v.precio_botella == null) {
      soloCopaNew.push({ nombre: v.nombre, coste, pvp: newPvp, margen: marg })
    }

    if (marg !== null && marg < 55) {
      margWarnings.push({ nombre: v.nombre, coste, pvp: newPvp, margen: marg })
    }

    vinoTable.push({ nombre: v.nombre, coste, pvp_bot: newPvp, margen: marg, proveedor: prov })

    const upd = { id: v.id }
    if (newPvp !== null)  upd.precio_botella       = newPvp
    if (prov)             upd.proveedor             = prov
    if (ref)              upd.referencia_proveedor  = ref
    if (/flor.*xar[eé]l|xar[eé]l.*flor/i.test(v.nombre || '')) upd.stock_minimo = 0
    if (Object.keys(upd).length > 1) vinoUpdates.push(upd)
  }

  printVinosTable(vinoTable, margWarnings)

  if (soloCopaNew.length > 0) {
    console.log(`\n  Vinos sin precio_botella previo que reciben PVP ahora (${soloCopaNew.length}):`)
    console.log('  ' + 'nombre'.padEnd(38) + 'coste'.padStart(7) + 'pvp_bot'.padStart(9) + 'margen'.padStart(8))
    console.log('  ' + '─'.repeat(62))
    for (const w of soloCopaNew) {
      const costeStr = w.coste.toFixed(2)
      const pvpStr   = `${w.pvp}€`
      const margStr  = w.margen !== null ? `${w.margen}%` : 'N/A'
      console.log('  ' + (w.nombre || '').slice(0, 37).padEnd(38) + costeStr.padStart(7) + pvpStr.padStart(9) + margStr.padStart(8))
    }
  }

  if (!DRY_RUN) {
    for (const u of vinoUpdates) {
      const { id, ...fields } = u
      const { error } = await supabase.from('vinos').update(fields).eq('id', id).eq('restaurante_id', DEMO_ID)
      if (error) throw new Error(`S1 vino ${id}: ${error.message}`)
    }
    console.log(`\n   ✓ ${vinoUpdates.length} vinos actualizados`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S2: cierres_mensuales_bodega
  // En confirm: S0 ya actualizó gastos → calcularMesBodega lee los nuevos valores.
  // En dry-run: parcheamos gastos_total/resultado en el snapshot para proyección fiel.
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S2] Calculando 12 cierres mensuales...')
  const { calcularMesBodega } = await import('../app/lib/agregarPeriodoBodega.js')

  const cierresPorMes = {}
  for (let i = 0; i < MESES_SIM.length; i++) {
    const mes  = MESES_SIM[i]
    process.stdout.write('.')
    const snap = await calcularMesBodega({ restaurante_id: DEMO_ID, mes, supabase })

    if (DRY_RUN) {
      // Proyectar con los nuevos gastos bodega sin escribir en la BD
      const newGTotal = PERSONAL_BODEGA[i] + SUMINISTROS_BODEGA[i] + ALQUILER_BODEGA
      snap.gastos_total = newGTotal
      snap.resultado    = Math.round((
        snap.ventas_neto
        - snap.coste_ventas_teorico
        - (snap.salidas_no_venta || 0)
        - (snap.merma_copa_eur   || 0)
        + (snap.diferencias_inventario ?? 0)
        - newGTotal
      ) * 100) / 100
    }

    cierresPorMes[mes] = snap
  }
  console.log('')

  const cierresRows = MESES_SIM.map(mes => ({
    restaurante_id: DEMO_ID,
    mes,
    snapshot:   cierresPorMes[mes],
    cerrado_en: new Date().toISOString(),
  }))

  // Resumen de cierres: ventas, CoGS, gastos, resultado, margen %
  console.log('\n  mes       ventas_neto  CoGS   gastos  resultado  margen%')
  console.log('  ──────────────────────────────────────────────────────────')
  let anualVentas = 0, anualResultado = 0
  for (const mes of MESES_SIM) {
    const s = cierresPorMes[mes]
    const marg = s.ventas_neto > 0
      ? Math.round(s.resultado / s.ventas_neto * 100)
      : 0
    console.log(
      `  ${mes}   ${String(Math.round(s.ventas_neto)).padStart(8)}  ${String(Math.round(s.coste_ventas_teorico)).padStart(6)}  ${String(Math.round(s.gastos_total)).padStart(6)}  ${String(Math.round(s.resultado)).padStart(9)}  ${String(marg).padStart(7)}%`
    )
    anualVentas    += s.ventas_neto
    anualResultado += s.resultado
  }
  const margAnual = anualVentas > 0 ? Math.round(anualResultado / anualVentas * 100) : 0
  console.log(`  ${'─'.repeat(58)}`)
  console.log(`  ${'ANUAL'.padEnd(12)}  ${String(Math.round(anualVentas)).padStart(8)}                    ${String(Math.round(anualResultado)).padStart(9)}  ${String(margAnual).padStart(7)}%`)

  if (!DRY_RUN) {
    for (const row of cierresRows) {
      const { error } = await supabase.from('cierres_mensuales_bodega')
        .upsert(row, { onConflict: 'restaurante_id,mes' })
      if (error) throw new Error(`S2 cierre ${row.mes}: ${error.message}`)
    }
    console.log('\n   ✓ 12 cierres guardados')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S3: parametros_explotacion (12 meses)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S3] parametros_explotacion...')

  const paramRows = MESES_SIM.map((mes, i) => {
    const snap       = cierresPorMes[mes]
    const P          = PERSONAL_BODEGA[i]
    const nominas_brutas   = Math.round(P * 0.65)
    const ss_empresa       = Math.round(P * 0.27)
    const retenciones_irpf = Math.round(P * 0.05)
    const extras_personal  = P - nominas_brutas - ss_empresa - retenciones_irpf

    // B2: bancarios calculados sobre ventas neta real
    const comisiones_datafono    = Math.round(snap.ventas_neto * 0.007)
    const mantenimiento_datafono = 13
    const resto_comisiones       = 10

    // B1: canales en neto (÷ IVA) reconciliados a facturación_total exacta
    const canal      = snap.informe?.por_canal ?? {}
    const ivaDivisor = 1 + (snap.iva_pct || 10) / 100
    const botella_neto  = Math.round(Number(canal.botella?.ingresos || 0) / ivaDivisor)
    const grupos_neto   = Math.round(Number(canal.evento?.valor     || 0) / ivaDivisor)
    const ventas_neta   = Math.round(snap.ventas_neto)
    const copa_neto     = Math.max(0, ventas_neta - botella_neto - grupos_neto)

    return {
      restaurante_id: DEMO_ID,
      periodo: mes,
      facturacion_total: snap.ventas_neto,
      consumo_mp:        snap.coste_ventas_teorico,
      nominas_brutas,
      ss_empresa,
      retenciones_irpf,
      extras_personal,
      partidas_gastos:   [{ id: `demo-sum-${mes}`, categoria: 'Suministros', importe: SUMINISTROS_BODEGA[i] }],
      partidas_alquiler: [{ id: `demo-alq-${mes}`, concepto: 'Alquiler local', importe: ALQUILER_BODEGA }],
      comisiones_datafono,
      mantenimiento_datafono,
      resto_comisiones,
      canales_negocio: {
        copa_barra:     copa_neto,
        botella_mesa:   botella_neto,
        grupos_eventos: grupos_neto,
        take_away:      0,
      },
      // ventas_previstas es NETO (sin IVA) — el SimuladorMultiplicador opera sobre márgenes netos.
      // ×1.10 es crecimiento YoY del 10 %, no conversión de IVA.
      ventas_previstas:   Math.round(snap.ventas_neto * 1.10),
      beneficio_objetivo: Math.round(snap.ventas_neto * 1.10 * 0.25),
      updated_at: new Date().toISOString(),
    }
  })

  showTable('parametros_explotacion', paramRows.map(r => ({
    periodo: r.periodo, facturacion_total: r.facturacion_total,
    nominas_brutas: r.nominas_brutas, ss_empresa: r.ss_empresa,
    partidas_alquiler_0: r.partidas_alquiler[0].importe,
    partidas_gastos_0:   r.partidas_gastos[0].importe,
  })))

  // B6: canales reconciliación vs ventas neta
  console.log('\n  canales (neto) vs ventas_neta:')
  console.log('  mes         copa_barra  botella  grupos  total_can  ventas_neta  diff')
  console.log('  ─────────────────────────────────────────────────────────────────────')
  for (const r of paramRows) {
    const c  = r.canales_negocio
    const tot = c.copa_barra + c.botella_mesa + c.grupos_eventos + c.take_away
    const vn  = Math.round(r.facturacion_total)
    console.log(
      `  ${r.periodo}   ${String(c.copa_barra).padStart(9)}  ${String(c.botella_mesa).padStart(7)}  ${String(c.grupos_eventos).padStart(6)}  ${String(tot).padStart(9)}  ${String(vn).padStart(11)}  ${String(tot - vn).padStart(5)}`
    )
  }

  // B6: bancarios/mes
  console.log('\n  bancarios/mes:')
  console.log('  mes         comisiones  mantenimiento  resto  total_ban')
  console.log('  ─────────────────────────────────────────────────────────')
  let totalBanAnual = 0
  for (const r of paramRows) {
    const tot = r.comisiones_datafono + r.mantenimiento_datafono + r.resto_comisiones
    totalBanAnual += tot
    console.log(
      `  ${r.periodo}   ${String(r.comisiones_datafono).padStart(9)}  ${String(r.mantenimiento_datafono).padStart(12)}  ${String(r.resto_comisiones).padStart(5)}  ${String(tot).padStart(9)}`
    )
  }
  console.log(`  ${'─'.repeat(57)}`)
  console.log(`  ${'ANUAL'.padEnd(13)}${String(totalBanAnual).padStart(43)}`)

  if (!DRY_RUN) {
    for (const row of paramRows) {
      const { error } = await supabase.from('parametros_explotacion')
        .upsert(row, { onConflict: 'restaurante_id,periodo' })
      if (error) throw new Error(`S3 param ${row.periodo}: ${error.message}`)
    }
    console.log('   ✓ 12 parametros_explotacion guardados')
  }

  // B3: parametros_explotacion 2026-10 (mes en curso — sin cierre ni histórico)
  // Gastos fijos copiados de 2026-09 (último mes); facturación/consumo/canales = 0.
  // ventas_previstas = 2025-10 × 1.10 (proyección YoY).
  {
    const last_i  = MESES_SIM.length - 1  // 11 → Sep 2026
    const P_oct   = PERSONAL_BODEGA[last_i]
    const oct_nominas_brutas   = Math.round(P_oct * 0.65)
    const oct_ss_empresa       = Math.round(P_oct * 0.27)
    const oct_retenciones_irpf = Math.round(P_oct * 0.05)
    const oct_extras_personal  = P_oct - oct_nominas_brutas - oct_ss_empresa - oct_retenciones_irpf
    // ventas_previstas NETO; ×1.10 = crecimiento YoY, no IVA (igual que paramRows)
    const oct_ventas_previstas = Math.round(cierresPorMes['2025-10'].ventas_neto * 1.10)
    const oct_benef_obj        = Math.round(oct_ventas_previstas * 0.25)

    const oct2026Row = {
      restaurante_id: DEMO_ID,
      periodo: '2026-10',
      facturacion_total: 0,
      consumo_mp:        0,
      nominas_brutas:    oct_nominas_brutas,
      ss_empresa:        oct_ss_empresa,
      retenciones_irpf:  oct_retenciones_irpf,
      extras_personal:   oct_extras_personal,
      partidas_gastos:   [{ id: 'demo-sum-2026-10', categoria: 'Suministros', importe: SUMINISTROS_BODEGA[last_i] }],
      partidas_alquiler: [{ id: 'demo-alq-2026-10', concepto: 'Alquiler local', importe: ALQUILER_BODEGA }],
      comisiones_datafono:    0,
      mantenimiento_datafono: 0,
      resto_comisiones:       0,
      canales_negocio: { copa_barra: 0, botella_mesa: 0, grupos_eventos: 0, take_away: 0 },
      beneficio_objetivo: oct_benef_obj,
      ventas_previstas:   oct_ventas_previstas,
      updated_at: new Date().toISOString(),
    }

    // Multiplicador mínimo simulado para 2026-10
    // Fórmula idéntica a SimuladorMultiplicador: multiplicador = 1 / (1 − margenNecesario)
    // personal_bodega en el simulador = calcularTotalPersonal().total = P_oct (incluye SS, IRPF, extras)
    const oct_gastos_total = P_oct + ALQUILER_BODEGA + SUMINISTROS_BODEGA[last_i]
    const oct_marg_nec     = (oct_gastos_total + oct_benef_obj) / oct_ventas_previstas
    // redondear(x, 3) = Math.round(x * 1000) / 1000 — misma fórmula que SimuladorMultiplicador
    const oct_mult         = oct_marg_nec < 1 ? Math.round((1 / (1 - oct_marg_nec)) * 1000) / 1000 : 'n/a'

    console.log(`\n  [B3] 2026-10: personal=${P_oct}€ alquiler=${ALQUILER_BODEGA}€ sumin=${SUMINISTROS_BODEGA[last_i]}€ → gastos=${oct_gastos_total}€`)
    console.log(`       ventas_prev=${oct_ventas_previstas}€ benef_obj=${oct_benef_obj}€ → multiplicador_mínimo=×${oct_mult}`)

    if (!DRY_RUN) {
      const { error } = await supabase.from('parametros_explotacion')
        .upsert(oct2026Row, { onConflict: 'restaurante_id,periodo' })
      if (error) throw new Error(`B3 param 2026-10: ${error.message}`)
      console.log('   ✓ parametros_explotacion 2026-10 guardado')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S4: historico_mensual (margen_explotacion es GENERATED, no incluir)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S4] historico_mensual...')

  const histRows = MESES_SIM.map((mes, i) => {
    const snap    = cierresPorMes[mes]
    const pr      = paramRows[i]
    const [y, m]  = mes.split('-').map(Number)
    const bancarios = pr.comisiones_datafono + pr.mantenimiento_datafono + pr.resto_comisiones
    return {
      restaurante_id: DEMO_ID,
      anio: y,
      mes:  m,
      ingresos:     snap.ventas_neto,
      consumo_mp:   snap.coste_ventas_teorico,
      gastos_fijos: PERSONAL_BODEGA[i] + SUMINISTROS_BODEGA[i] + ALQUILER_BODEGA + bancarios,
    }
  })

  showTable('historico_mensual', histRows.map(r => ({
    anio: r.anio, mes: r.mes,
    ingresos: r.ingresos, consumo_mp: r.consumo_mp, gastos_fijos: r.gastos_fijos,
  })))

  if (!DRY_RUN) {
    for (const row of histRows) {
      const { error } = await supabase.from('historico_mensual')
        .upsert(row, { onConflict: 'restaurante_id,anio,mes' })
      if (error) throw new Error(`S4 historico ${row.anio}-${row.mes}: ${error.message}`)
    }
    console.log('   ✓ 12 historico_mensual guardados')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S5: libro_compras — facturas desde lineas_compra agrupadas por proveedor real
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S5] libro_compras...')

  const { data: cabeceras } = await supabase
    .from('cabecera_compras')
    .select('id, fecha')
    .eq('restaurante_id', DEMO_ID)
    .eq('estado', 'aplicada')

  const cabIds = (cabeceras || []).map(c => c.id)
  let libroRows = []

  if (cabIds.length > 0) {
    const { data: lineas } = await supabase
      .from('lineas_compra')
      .select('cabecera_id, vino_id, importe_neto')
      .in('cabecera_id', cabIds)

    const cabMap = Object.fromEntries((cabeceras || []).map(c => [c.id, c]))

    const grupos = {}
    for (const l of lineas || []) {
      const cab      = cabMap[l.cabecera_id]
      if (!cab) continue
      const periodo  = cab.fecha.slice(0, 7)
      const proveedor = vinoProveedorById[l.vino_id] ?? 'Sin proveedor asignado'
      const key      = `${periodo}::${proveedor}`

      if (!grupos[key]) grupos[key] = { periodo, proveedor, factMap: {} }
      if (!grupos[key].factMap[l.cabecera_id]) {
        grupos[key].factMap[l.cabecera_id] = {
          fecha:    cab.fecha,
          importe:  0,
          albaran:  `DEMO-${periodo.replace('-', '')}-${l.cabecera_id.slice(-4).toUpperCase()}`,
          concepto: 'Compra vinos',
        }
      }
      grupos[key].factMap[l.cabecera_id].importe += Number(l.importe_neto) || 0
    }

    for (const g of Object.values(grupos)) {
      const facturas = Object.values(g.factMap).map(f => ({
        ...f,
        importe: Math.round(f.importe * 1.21 * 100) / 100,
      }))
      libroRows.push({
        restaurante_id: DEMO_ID,
        periodo:    g.periodo,
        proveedor:  g.proveedor,
        facturas,
        updated_at: new Date().toISOString(),
      })
    }
  }

  showTable('libro_compras', libroRows.map(r => ({
    periodo:   r.periodo,
    proveedor: r.proveedor,
    facturas:  r.facturas.length,
    total_iva: r.facturas.reduce((s, f) => s + f.importe, 0).toFixed(2),
  })))

  if (!DRY_RUN) {
    for (const row of libroRows) {
      const { error } = await supabase.from('libro_compras')
        .upsert(row, { onConflict: 'restaurante_id,periodo,proveedor' })
      if (error) throw new Error(`S5 libro ${row.periodo}/${row.proveedor}: ${error.message}`)
    }
    console.log(`   ✓ ${libroRows.length} filas libro_compras guardadas`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S6: configuracion_pricing
  // pvp_minimo_copa = 2.00 (mínimo real de la carta, no teórico)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S6] configuracion_pricing...')

  const pricingRow = {
    restaurante_id:  DEMO_ID,
    metodo_pvp:      'multiplicador',
    descorche_fijo:  9.00,
    pvp_minimo_copa: 2.00,
    updated_at:      new Date().toISOString(),
  }

  showTable('configuracion_pricing', [pricingRow])

  if (!DRY_RUN) {
    const { error } = await supabase.from('configuracion_pricing')
      .upsert(pricingRow, { onConflict: 'restaurante_id' })
    if (error) throw new Error(`S6: ${error.message}`)
    console.log('   ✓')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S7: tramos_multiplicador — factor = 1.10 / (1 − m)
  // m=0.68→3.438 | m=0.65→3.143 | m=0.62→2.895 | m=0.60→2.750
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S7] tramos_multiplicador...')

  const tramosRows = [
    { restaurante_id: DEMO_ID, coste_min:  0, coste_max:    5, factor: 3.438, pvp_minimo_carta: null, orden: 1 },
    { restaurante_id: DEMO_ID, coste_min:  5, coste_max:   12, factor: 3.143, pvp_minimo_carta:   12, orden: 2 },
    { restaurante_id: DEMO_ID, coste_min: 12, coste_max:   25, factor: 2.895, pvp_minimo_carta:   28, orden: 3 },
    { restaurante_id: DEMO_ID, coste_min: 25, coste_max: null, factor: 2.750, pvp_minimo_carta:   55, orden: 4 },
  ]

  showTable('tramos_multiplicador', tramosRows)

  if (!DRY_RUN) {
    const { error: delErr } = await supabase.from('tramos_multiplicador').delete().eq('restaurante_id', DEMO_ID)
    if (delErr) throw new Error(`S7 delete: ${delErr.message}`)
    const { error: insErr } = await supabase.from('tramos_multiplicador').insert(tramosRows)
    if (insErr) throw new Error(`S7 insert: ${insErr.message}`)
    console.log('   ✓ 4 tramos insertados')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S8: presupuesto_mensual (anio=2026, mes 1..12)
  // objetivo_margen_pct = margen BRUTO = 100 − objetivo_mp_pct (~58-62 %)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S8] presupuesto_mensual 2026...')

  // Índice mes-calendario → snap + i
  const cierresByCalMes = {}
  for (let i = 0; i < MESES_SIM.length; i++) {
    const mesNum = parseInt(MESES_SIM[i].split('-')[1])
    cierresByCalMes[mesNum] = { snap: cierresPorMes[MESES_SIM[i]], i }
  }

  const presupRows = []
  for (let mes = 1; mes <= 12; mes++) {
    const entry = cierresByCalMes[mes]
    const snap  = entry?.snap
    const objetivo_facturacion = snap ? Math.round(snap.ventas_neto * 1.10) : 0
    // Margen MP: ratio real ajustado −2 pp (objetivo de mejora)
    const ratio_mp = snap && snap.ventas_neto > 0
      ? snap.coste_ventas_teorico / snap.ventas_neto * 100
      : 40
    const objetivo_mp_pct     = Math.round(Math.max(32, ratio_mp - 2) * 10) / 10
    // Margen bruto objetivo: 100 − mp_pct (~58-62 %)
    const objetivo_margen_pct = Math.round((100 - objetivo_mp_pct) * 10) / 10

    presupRows.push({
      restaurante_id:         DEMO_ID,
      anio:                   2026,
      mes,
      objetivo_facturacion,
      objetivo_mp_pct,
      objetivo_margen_pct,
      anio_base:              entry ? parseInt(MESES_SIM[entry.i].slice(0, 4)) : 2025,
      factor_crecimiento_pct: 10,
    })
  }

  showTable('presupuesto_mensual', presupRows.map(r => ({
    mes: r.mes, objetivo_facturacion: r.objetivo_facturacion,
    objetivo_mp_pct: r.objetivo_mp_pct, objetivo_margen_pct: r.objetivo_margen_pct,
  })))

  if (!DRY_RUN) {
    for (const row of presupRows) {
      const { error } = await supabase.from('presupuesto_mensual')
        .upsert(row, { onConflict: 'restaurante_id,anio,mes' })
      if (error) throw new Error(`S8 presupuesto ${row.mes}: ${error.message}`)
    }
    console.log('   ✓ 12 presupuesto_mensual 2026 guardados')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // S9: configuracion_bonus (2025 + 2026)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n[S9] configuracion_bonus...')

  const bonusRows = [
    { restaurante_id: DEMO_ID, anio: 2025, umbral_crecimiento_pct: 10, bonus_pct: 5, activo: true },
    { restaurante_id: DEMO_ID, anio: 2026, umbral_crecimiento_pct: 10, bonus_pct: 5, activo: true },
  ]

  showTable('configuracion_bonus', bonusRows)

  if (!DRY_RUN) {
    for (const row of bonusRows) {
      const { error } = await supabase.from('configuracion_bonus')
        .upsert(row, { onConflict: 'restaurante_id,anio' })
      if (error) throw new Error(`S9 bonus ${row.anio}: ${error.message}`)
    }
    console.log('   ✓ 2 configuracion_bonus guardados')
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log('\n── Resumen ──────────────────────────────────────────────────────')
  const resumen = [
    ['restaurant_economic_settings',  1],
    ['vinos (actualizaciones)',        vinoUpdates.length],
    ['cierres_mensuales_bodega',       cierresRows.length],
    ['parametros_explotacion',         paramRows.length + 1],  // +1 = 2026-10 (B3)
    ['historico_mensual',              histRows.length],
    ['libro_compras',                  libroRows.length],
    ['configuracion_pricing',          1],
    ['tramos_multiplicador',           tramosRows.length],
    ['presupuesto_mensual',            presupRows.length],
    ['configuracion_bonus',            bonusRows.length],
  ]
  for (const [t, n] of resumen) console.log(`  ${t.padEnd(38)} ${n} fila(s)`)

  if (DRY_RUN) {
    console.log('\n⬡  Dry-run. Para aplicar:')
    console.log('   node --env-file=.env.local scripts/seed-demo-somm.mjs --confirm --nombre "Casa Marisma"')
  } else {
    console.log('\n✓  seed-demo-somm completado.')
  }
}

main().catch(err => { console.error(err.message ?? err); process.exit(1) })
