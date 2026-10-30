/**
 * diag-libro-consumo.mjs — Verifica que consumo_mp del libro cuadra con los cierres.
 *
 * Para cada mes cerrado imprime:
 *   - Σ consumo_libro  (fórmula contable: BI_valor + compras − EI_valor)
 *   - cierre.coste_ventas_teorico
 *   - diferencia
 *   - Σ compras_libro vs cierre.compras_netas
 *   - Σ ventas_neto_libro vs cierre.ventas_neto
 *
 * Sale con código 1 si algún mes cerrado difiere más de 1€ en consumo_mp.
 *
 * Uso: node --env-file=.env.local scripts/diag-libro-consumo.mjs [restaurante_id]
 */

import { createClient } from '@supabase/supabase-js'
import { indexarCompras, indexarPartes } from '../app/lib/libroBodega.js'

const RESTAURANTE_ID = process.argv[2] || process.env.NEXT_PUBLIC_DEMO_RESTAURANTE_ID
if (!RESTAURANTE_ID) {
  console.error('Falta restaurante_id. Pásalo como argumento o NEXT_PUBLIC_DEMO_RESTAURANTE_ID.')
  process.exit(1)
}

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const PAGE   = 1000
const IN_MAX = 100
const r2 = n => Math.round((Number(n) || 0) * 100) / 100

async function fetchAll(builder) {
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await builder(from, from + PAGE - 1)
    if (error) { if (error.code === 'PGRST103') break; throw new Error(error.message) }
    rows.push(...(data || []))
    if ((data || []).length < PAGE) break
    from += PAGE
  }
  return rows
}

async function fetchByIds(table, select, idCol, ids) {
  const rows = []
  for (let i = 0; i < ids.length; i += IN_MAX) {
    const chunk = ids.slice(i, i + IN_MAX)
    let from = 0
    while (true) {
      const { data, error } = await s.from(table).select(select).in(idCol, chunk).range(from, from + PAGE - 1)
      if (error) { if (error.code === 'PGRST103') break; throw new Error(`${table}: ${error.message}`) }
      rows.push(...(data || []))
      if ((data || []).length < PAGE) break
      from += PAGE
    }
  }
  return rows
}

// ── Datos ────────────────────────────────────────────────────────────────────

const { data: cierresRaw } = await s.from('cierres_mensuales_bodega')
  .select('mes,snapshot')
  .eq('restaurante_id', RESTAURANTE_ID)
  .order('mes')

if (!cierresRaw || cierresRaw.length === 0) {
  console.log('Sin cierres para este restaurante.')
  process.exit(0)
}

const years = [...new Set(cierresRaw.map(c => c.mes.slice(0, 4)))]

// SMB: año anterior dic de cada año presente + todos los meses
const smbRaw = await fetchAll((f, t) =>
  s.from('stock_mensual_bodega')
    .select('mes,vino_id,stock_final_real,coste_medio')
    .eq('restaurante_id', RESTAURANTE_ID)
    .range(f, t)
)
const smbMap = {}
for (const r of smbRaw) {
  if (!smbMap[r.mes]) smbMap[r.mes] = {}
  smbMap[r.mes][r.vino_id] = r
}

// Compras
const { data: cabeceras } = await s.from('cabecera_compras').select('id,fecha')
  .eq('restaurante_id', RESTAURANTE_ID)
const cabIds      = (cabeceras || []).map(c => c.id)
const cabFechaMap = Object.fromEntries((cabeceras || []).map(c => [c.id, c.fecha]))
const lineasCompra = cabIds.length > 0
  ? await fetchByIds('lineas_compra', 'cabecera_id,vino_id,importe_neto', 'cabecera_id', cabIds)
  : []

// Partes
const partesRaw = await fetchAll((f, t) =>
  s.from('partes_servicio')
    .select('id,fecha')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('estado', 'cerrado')
    .range(f, t)
)
const parteIds      = partesRaw.map(p => p.id)
const parteFechaMap = Object.fromEntries(partesRaw.map(p => [p.id, p.fecha]))
const lineasPartes  = parteIds.length > 0
  ? await fetchByIds('partes_servicio_lineas', 'parte_id,vino_id,tipo,cantidad,copas_vendidas,precio_unitario', 'parte_id', parteIds)
  : []

const comprasIdx = indexarCompras(lineasCompra, cabFechaMap)
const partesIdx  = indexarPartes(lineasPartes, parteFechaMap)

// ── Tabla ────────────────────────────────────────────────────────────────────

const PAD = (s, n) => String(s ?? '').padStart(n)
const PADR = (s, n) => String(s ?? '').padEnd(n)
const FMT  = n => r2(n).toFixed(2).padStart(9)

console.log('\n' + PADR('Mes', 8) + PAD('consumo_libro', 14) + PAD('cierre_teorico', 15) + PAD('diff_consumo', 13) + PAD('compras_lib', 12) + PAD('cierre_compras', 15) + PAD('diff_compras', 13) + PAD('ventas_neto', 12) + PAD('cierre_ventas', 14) + PAD('diff_ventas', 12))
console.log('─'.repeat(118))

let fallos = 0

for (const cierre of cierresRaw) {
  const mesK    = cierre.mes
  const snap    = cierre.snapshot || {}
  const anio    = parseInt(mesK.slice(0, 4))
  const m       = parseInt(mesK.slice(5, 7))
  const prevMes = m === 1 ? `${anio - 1}-12` : `${anio}-${String(m - 1).padStart(2, '0')}`

  const smbPrev = smbMap[prevMes] || {}
  const smbCurr = smbMap[mesK]   || {}

  // Σ consumo_libro = Σ (ini_valor + compras_eur − fin_valor) por vino
  const allVinos = new Set([...Object.keys(smbPrev), ...Object.keys(smbCurr)])
  let consumoLibro = 0
  for (const vid of allVinos) {
    const ini  = smbPrev[vid]?.stock_final_real ?? 0
    const cIni = smbPrev[vid]?.coste_medio      ?? 0
    const fin  = smbCurr[vid]?.stock_final_real ?? 0
    const cFin = smbCurr[vid]?.coste_medio      ?? cIni
    const comp = comprasIdx[mesK]?.[vid]?.eur    ?? 0
    consumoLibro += (ini * cIni) + comp - (fin * cFin)
  }
  consumoLibro = r2(consumoLibro)

  // Σ compras_libro
  const comprasLibro = r2(
    Object.values(comprasIdx[mesK] || {}).reduce((s, v) => s + v.eur, 0)
  )

  // Σ ventas_neto_libro (partes)
  const iva = 1 + (Number(snap.iva_pct) || 10) / 100
  let ventasBruto = 0
  for (const entry of Object.values(partesIdx[mesK] || {})) {
    ventasBruto += (entry.bot_eur_bruto || 0) + (entry.copa_eur_bruto || 0)
  }
  const ventasNeto = r2(ventasBruto / iva)

  const cierreTeorico  = r2(snap.coste_ventas_teorico ?? (snap.ventas_neto - snap.margen_bruto) ?? 0)
  const cierreCompras  = r2(snap.compras_netas ?? snap.compras_bruto ?? 0)
  const cierreVentas   = r2(snap.ventas_neto ?? 0)

  const diffConsumo = r2(consumoLibro - cierreTeorico)
  const diffCompras = r2(comprasLibro - cierreCompras)
  const diffVentas  = r2(ventasNeto   - cierreVentas)

  const marcaConsumo = Math.abs(diffConsumo) > 1 ? ' ← FALLO' : ''
  if (Math.abs(diffConsumo) > 1) fallos++

  console.log(
    PADR(mesK, 8) +
    FMT(consumoLibro) + '     ' +
    FMT(cierreTeorico) + '     ' +
    FMT(diffConsumo) + marcaConsumo.padEnd(9) +
    FMT(comprasLibro) + '   ' +
    FMT(cierreCompras) + '     ' +
    FMT(diffCompras) + '   ' +
    FMT(ventasNeto) + '  ' +
    FMT(cierreVentas) + '     ' +
    FMT(diffVentas)
  )
}

console.log('─'.repeat(118))
console.log(`\n${cierresRaw.length} meses cerrados. Fallos consumo (>1€): ${fallos}`)

if (fallos > 0) {
  console.error('\n⚠ FALLO: hay meses cerrados con consumo_mp que difiere >1€ del cierre.')
  process.exit(1)
}
console.log('✓ Todos los meses cerrados cuadran (diff ≤ 1€).')
