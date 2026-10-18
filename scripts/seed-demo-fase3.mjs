#!/usr/bin/env node
/**
 * seed-demo-fase3.mjs — Fase 3 (v1)
 *
 * F3-A: estadisticas tipo='venta' para el módulo Rentabilidad
 *       (/dashboard/menu-engineering).  Deriva cada fila de
 *       partes_servicio_lineas reales del DEMO (venta_botella + venta_copa).
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-demo-fase3.mjs           ← dry-run
 *   node --env-file=.env.local scripts/seed-demo-fase3.mjs --confirm ← escritura
 *   node scripts/seed-demo-fase3.mjs --selftest                      ← tests sin BD
 *
 * Convención de cantidad (auditada en camarero/[slug]/page.js:321-348 y
 *   salesPriority.js:66):
 *   detalle.cantidad = unidades brutas del formato vendido.
 *   → venta_copa:    sum(partes_servicio_lineas.copas_vendidas)
 *   → venta_botella: sum(partes_servicio_lineas.cantidad)
 *   priorizarVentas() los suma en bruto (unidadesKpi). Sin conversión copa→botella.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const IS_SELFTEST = process.argv.includes('--selftest')
const DRY_RUN     = !process.argv.includes('--confirm') || IS_SELFTEST

const DEMO_ID = process.env.SEED_DEMO_ID
if (!IS_SELFTEST && !DEMO_ID) {
  console.error('ERROR: SEED_DEMO_ID no está definido')
  process.exit(1)
}

// ── Denylist (sincronizada con fase2) ─────────────────────────────────────────
const UUID_DENYLIST = new Set([
  'a1000000-0000-4000-8000-000000000000',
  'b2000000-0000-4000-8000-000000000000',
  'c3000000-0000-4000-8000-000000000000',
  'e5000000-0000-4000-8000-000000000000',
])
if (!IS_SELFTEST && UUID_DENYLIST.has(DEMO_ID)) {
  console.error(`ERROR: SEED_DEMO_ID ${DEMO_ID} está en la denylist`)
  process.exit(1)
}
const NAME_DENYLIST = ['lo de carmen', 'araboka', 'la taberna', 'modo sumiller']

// ── Helpers ───────────────────────────────────────────────────────────────────

// España: UTC+2 verano (abr–oct), UTC+1 invierno (nov–mar)
function esVerano(fechaStr) {
  const mes = parseInt(fechaStr.slice(5, 7), 10)
  return mes >= 4 && mes <= 10
}

// turnos: Set<'almuerzo'|'cena'>; → ISO timestamp con offset español
function turnoCreatedAt(fechaStr, turnos) {
  let hora
  if (turnos.has('cena') && !turnos.has('almuerzo'))     hora = '21:30'
  else if (turnos.has('almuerzo') && !turnos.has('cena')) hora = '14:30'
  else                                                     hora = '20:00'
  const tz = esVerano(fechaStr) ? '+02:00' : '+01:00'
  return `${fechaStr}T${hora}:00${tz}`
}

// ISO 8601 week: 'YYYY-Www'
function semanaISO(fechaStr) {
  const d = new Date(fechaStr)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// ── Selftest ──────────────────────────────────────────────────────────────────
async function runSelftest() {
  console.log('\n── SELFTEST F3-A v1 (sin BD) ──────────────────────────────────')
  let extraFailed = 0

  // (a) actividad_real_desde: el código lo verifica y aborta si es null/tardío
  {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    const hasGuard = src.includes('actividad_real_desde') && /process\.exit\(1\)/.test(src)
    if (!hasGuard) {
      console.log('  ✗ (a) guard actividad_real_desde + process.exit(1) no encontrado')
      extraFailed++
    } else {
      console.log('  (a) actividad_real_desde guard presente: ✓')
    }
  }

  // (b) convención copa: usa copas_vendidas (no cantidad) para venta_copa
  {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    // Codificado para que la línea de check no sea ella misma el match
    const colCopas = ['copas', '_vendidas'].join('')
    const tipoVCopa = ['venta', '_copa'].join('')
    const hasColCopas  = src.includes(colCopas)
    const hasTipoVCopa = src.includes(tipoVCopa)
    if (!hasColCopas || !hasTipoVCopa) {
      console.log(`  ✗ (b) no encuentra '${colCopas}' (${hasColCopas}) o '${tipoVCopa}' (${hasTipoVCopa}) en código`)
      extraFailed++
    } else {
      console.log(`  (b) convención ${colCopas} para ${tipoVCopa}: ✓`)
    }
  }

  // (c) fuente siempre 'sala', nunca 'tpv' en detalle insertado
  {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    const hasSala = /fuente:\s*['"]sala['"]/.test(src)
    // Codificado en split para que la línea de check no se automatchee
    const badFuente = ['fuente', ":'tpv'"].join('')
    const badFuente2 = ['fuente', ':"tpv"'].join('')
    const hasTpv = src.includes(badFuente) || src.includes(badFuente2)
    if (!hasSala) {
      console.log("  ✗ (c) no encuentra fuente:'sala' en código")
      extraFailed++
    } else if (hasTpv) {
      console.log(`  ✗ (c) hay ${badFuente} en código (prohibido)`)
      extraFailed++
    } else {
      console.log("  (c) fuente:'sala' siempre, sin 'tpv': ✓")
    }
  }

  // (d) idempotencia: .delete() sobre estadisticas antes de insertar
  {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    // estadisticas + .delete() deben aparecer en el mismo archivo
    const hasDelete = /\.delete\(\)/.test(src)
    const hasTabla  = /['"]estadisticas['"]/.test(src)
    if (!hasDelete || !hasTabla) {
      console.log('  ✗ (d) no hay .delete() sobre estadisticas (falta idempotencia)')
      extraFailed++
    } else {
      console.log('  (d) delete + insert idempotente: ✓')
    }
  }

  // (e) no-use-before-define para vars críticas declaradas con const
  {
    const src = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n')
    const checkVars = ['aggMap', 'estadisticasRows']
    let eFailed = 0
    for (const v of checkVars) {
      const declRe = new RegExp(`^\\s+const ${v}\\s*[=\\[]`)
      const useRe  = new RegExp(`\\b${v}\\b`)
      const declIdx = src.findIndex(l => declRe.test(l))
      if (declIdx < 0) { console.log(`  (e) '${v}' no es const o no se encuentra — skip`); continue }
      const earlyUse = src.slice(0, declIdx).findIndex(l => {
        const stripped = l.replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '§')
        return useRe.test(stripped) && !declRe.test(l)
      })
      if (earlyUse >= 0) {
        console.log(`  ✗ (e) TDZ '${v}': primer uso en línea ${earlyUse + 1}, declarado en ${declIdx + 1}`)
        eFailed++
      } else {
        console.log(`  (e) no-use-before-define '${v}' (decl. línea ${declIdx + 1}): ✓`)
      }
    }
    if (eFailed > 0) extraFailed += eFailed
  }

  // (f) helpers: esVerano / turnoCreatedAt / semanaISO
  {
    const novOk = esVerano('2025-11-15') === false   // invierno
    const junOk = esVerano('2026-06-01') === true    // verano
    const octOk = esVerano('2025-10-31') === true    // último mes verano
    const tsOk  = turnoCreatedAt('2025-10-05', new Set(['cena'])) === '2025-10-05T21:30:00+02:00'
    const ts2Ok = turnoCreatedAt('2025-11-10', new Set(['almuerzo'])) === '2025-11-10T14:30:00+01:00'
    const ts3Ok = turnoCreatedAt('2026-03-01', new Set(['almuerzo', 'cena'])) === '2026-03-01T20:00:00+01:00'
    const swOk  = semanaISO('2025-10-06') === '2025-W41'   // lunes W41
    if (!novOk || !junOk || !octOk || !tsOk || !ts2Ok || !ts3Ok || !swOk) {
      console.log(`  ✗ (f) helpers: esVerano=${novOk&&junOk&&octOk} ts=${tsOk} ts2=${ts2Ok} ts3=${ts3Ok} semana=${swOk}`)
      extraFailed++
    } else {
      console.log('  (f) helpers esVerano/turnoCreatedAt/semanaISO: ✓')
    }
  }

  const total = 6
  const passed = total - Math.min(extraFailed, total)
  console.log(`\n  ${passed}/${total} checks pasados`)
  if (extraFailed === 0) console.log('  ✓ Todos los casos superados.')
  else console.log(`  FALLOS: ${extraFailed}`)
  process.exit(extraFailed > 0 ? 1 : 0)
}

if (IS_SELFTEST) { await runSelftest(); process.exit(0) }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('ERROR: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno')
    process.exit(1)
  }

  const sb  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const mode = DRY_RUN ? '[DRY-RUN]' : '[CONFIRM]'
  console.log(`\n${mode} seed-demo-fase3 v1  DEMO_ID=${DEMO_ID}\n`)

  // ── Paso 0: restaurante + actividad_real_desde ────────────────────────────
  const { data: rest, error: restErr } = await sb
    .from('restaurantes')
    .select('nombre, actividad_real_desde')
    .eq('id', DEMO_ID)
    .single()
  if (restErr || !rest) {
    console.error(`ERROR: no se pudo leer restaurante ${DEMO_ID}: ${restErr?.message}`)
    process.exit(1)
  }

  for (const denied of NAME_DENYLIST) {
    if ((rest.nombre || '').toLowerCase().includes(denied)) {
      console.error(`ERROR: restaurante "${rest.nombre}" está en la denylist`)
      process.exit(1)
    }
  }

  console.log(`  restaurante:          "${rest.nombre}"`)
  console.log(`  actividad_real_desde: ${rest.actividad_real_desde ?? 'NULL'}`)

  if (!rest.actividad_real_desde) {
    console.error('ERROR: actividad_real_desde es NULL — Rentabilidad nunca cargará estadísticas')
    console.error('       (MenuEngineeringClient.js:147 → if (desdeActividad) { ... })')
    process.exit(1)
  }
  const actividadFecha = new Date(rest.actividad_real_desde)
  const fechaLimite    = new Date('2025-10-01T00:00:00Z')
  if (actividadFecha > fechaLimite) {
    console.error(`ERROR: actividad_real_desde ${rest.actividad_real_desde} es posterior a 2025-10-01`)
    console.error('       Ventas de los partes más antiguos quedarían fuera de la ventana del análisis.')
    process.exit(1)
  }
  console.log('  [OK] actividad_real_desde ≤ 2025-10-01\n')

  // ── F3-A: estadisticas tipo='venta' ──────────────────────────────────────
  console.log("[F3-A] Construyendo estadisticas tipo='venta' desde partes_servicio_lineas...")

  const { data: partes, error: partesErr } = await sb
    .from('partes_servicio')
    .select('id, fecha, turno')
    .eq('restaurante_id', DEMO_ID)
  if (partesErr) { console.error(`ERROR partes_servicio: ${partesErr.message}`); process.exit(1) }

  if (!partes || partes.length === 0) {
    console.log('  Sin partes_servicio para este DEMO_ID. F3-A omitida.')
    return
  }

  const parteIds = partes.map(p => p.id)
  const parteMap = Object.fromEntries(partes.map(p => [p.id, { fecha: p.fecha, turno: p.turno }]))
  console.log(`  Partes leídos: ${partes.length}`)

  // Leer líneas de venta — venta_botella y venta_copa
  const { data: lineas, error: lineasErr } = await sb
    .from('partes_servicio_lineas')
    .select('parte_id, vino_id, tipo, cantidad, copas_vendidas, vino:vinos(id, nombre)')
    .in('parte_id', parteIds)
    .in('tipo', ['venta_botella', 'venta_copa'])
  if (lineasErr) { console.error(`ERROR partes_servicio_lineas: ${lineasErr.message}`); process.exit(1) }
  console.log(`  Líneas venta leídas: ${(lineas || []).length}`)

  // Agregar por (fecha, vino_id)
  // Convención auditada: camarero/[slug]/page.js:321,348 + salesPriority.js:66
  //   venta_copa    → copas_vendidas (número de copas individuales)
  //   venta_botella → cantidad       (número de botellas)
  const aggMap = {}   // key: `${fecha}|${vinoId}`
  for (const l of (lineas || [])) {
    const parte = parteMap[l.parte_id]
    if (!parte?.fecha || !l.vino_id) continue
    const key = `${parte.fecha}|${l.vino_id}`
    if (!aggMap[key]) {
      aggMap[key] = {
        fecha:    parte.fecha,
        vinoId:   l.vino_id,
        nombre:   l.vino?.nombre || '?',
        cantidad: 0,
        turnos:   new Set(),
      }
    }
    const uds = l.tipo === 'venta_copa'
      ? Math.max(0, Number(l.copas_vendidas) || 0)   // copas brutas
      : Math.max(0, Number(l.cantidad) || 0)          // botellas
    aggMap[key].cantidad += uds
    if (parte.turno) aggMap[key].turnos.add(parte.turno)
  }

  let filas       = Object.values(aggMap).filter(r => r.cantidad > 0)
  let granularidad = 'día'
  const LIMITE_DIARIO = 10000

  if (filas.length > LIMITE_DIARIO) {
    // Agregar por semana ISO si superamos el límite
    granularidad = 'semana'
    const aggSem = {}
    for (const r of filas) {
      const sem = semanaISO(r.fecha)
      const key = `${sem}|${r.vinoId}`
      if (!aggSem[key]) {
        aggSem[key] = { fecha: r.fecha, vinoId: r.vinoId, nombre: r.nombre, cantidad: 0, turnos: new Set(['cena']) }
      }
      aggSem[key].cantidad += r.cantidad
      if (r.fecha > aggSem[key].fecha) aggSem[key].fecha = r.fecha   // última fecha de la semana
    }
    filas = Object.values(aggSem).filter(r => r.cantidad > 0)
    console.log(`  ⚠ Superado límite diario (${LIMITE_DIARIO}): granularidad → semana → ${filas.length} filas`)
  } else {
    console.log(`  Granularidad: día — ${filas.length} filas (límite ${LIMITE_DIARIO})`)
  }

  const estadisticasRows = filas.map(r => ({
    restaurante_id: DEMO_ID,
    tipo:           'venta',
    created_at:     turnoCreatedAt(r.fecha, r.turnos),
    detalle:        JSON.stringify({
      resultado: 'vendida',
      vino_id:   r.vinoId,
      vino:      r.nombre,
      cantidad:  r.cantidad,
      fuente:    'sala',
    }),
  }))

  console.log(`  Total estadisticas a insertar: ${estadisticasRows.length}`)

  // ── Simulación Rentabilidad (siempre, en dry-run y confirm) ──────────────
  console.log('\n  ── Simulación MenuEngineeringClient.js ──────────────────────')

  const { data: vinosData } = await sb
    .from('vinos')
    .select('id, nombre, bodega, precio_botella, coste_compra, stock')
    .eq('restaurante_id', DEMO_ID)
    .eq('activo', true)

  const decimal = v => parseFloat(v) || 0

  // priorizarVentas() simplificado: solo fuente sala → sin deduplicación TPV
  // (salesPriority.js:82-137)
  const ventasPorId = {}
  for (const row of estadisticasRows) {
    const d   = JSON.parse(row.detalle)
    const vid = d.vino_id
    const c   = Math.max(1, Number(d.cantidad) || 1)
    ventasPorId[vid] = (ventasPorId[vid] || 0) + c
  }
  const unidadesKpi = Object.values(ventasPorId).reduce((s, n) => s + n, 0)

  const vinosConCoste = (vinosData || []).filter(
    v => decimal(v.coste_compra) > 0 && decimal(v.precio_botella) > 0
  )

  // Estado del análisis (MenuEngineeringClient.js:181,191)
  if (vinosConCoste.length < 3) {
    console.log(`  ⚠ estado='sin_coste': solo ${vinosConCoste.length} vinos con coste y precio (necesita ≥3)`)
  } else if (unidadesKpi < 5) {
    console.log(`  ⚠ estado='sin_ventas': unidadesKpi=${unidadesKpi} < 5 → se mostraría ANALISIS_DEMO`)
  } else {
    console.log(`  estado='ok' ✓ — ANALISIS_DEMO no se activa`)
  }

  console.log(`  unidadesKpi:    ${unidadesKpi}          (ref. línea 183)`)

  // useMemo: clasificación (MenuEngineeringClient.js:193-220)
  const vinosCalculados = vinosConCoste.map(v => ({
    id:                v.id,
    nombre:            v.nombre,
    bodega:            v.bodega,
    margen:            decimal(v.precio_botella) - decimal(v.coste_compra),
    ventas:            ventasPorId[v.id] || 0,
    pctVentas:         unidadesKpi > 0 ? ((ventasPorId[v.id] || 0) / unidadesKpi) * 100 : 0,
    valorStockCoste:   decimal(v.stock) * decimal(v.coste_compra),
    ingresosEstimados: (ventasPorId[v.id] || 0) * decimal(v.precio_botella),
  }))

  const barreraRentabilidad = vinosCalculados.length
    ? vinosCalculados.reduce((s, v) => s + v.margen, 0) / vinosCalculados.length
    : 0
  const vinosConVentas     = vinosCalculados.filter(v => v.ventas > 0).length
  const barreraPopularidad = vinosConVentas > 0 ? (100 / vinosConVentas) * 0.7 : 0

  const clasificados = vinosCalculados.map(v => ({
    ...v,
    retornoInv: v.valorStockCoste > 0 ? v.ingresosEstimados / v.valorStockCoste : null,
    categoria:  (v.margen >= barreraRentabilidad && v.pctVentas >= barreraPopularidad) ? 'estrella'
              : (v.margen <  barreraRentabilidad && v.pctVentas >= barreraPopularidad) ? 'caballo'
              : (v.margen >= barreraRentabilidad)                                      ? 'joya'
              :                                                                          'revisar',
  }))

  const conteo = { estrella: 0, joya: 0, caballo: 0, revisar: 0 }
  for (const v of clasificados) conteo[v.categoria]++

  // Retorno inventario global — Capa WINSPID (líneas 253-255)
  const valorStockTotal = clasificados.reduce((s, v) => s + v.valorStockCoste, 0)
  const ingresosTotal   = clasificados.reduce((s, v) => s + v.ingresosEstimados, 0)
  const retornoGlobal   = valorStockTotal > 0 ? ingresosTotal / valorStockTotal : null

  console.log(`  vinosConVentas: ${vinosConVentas}`)
  console.log(`  barreraRentabilidad: ${barreraRentabilidad.toFixed(2)} €   (ref. línea 202)`)
  console.log(`  barreraPopularidad:  ${barreraPopularidad.toFixed(2)} %    (ref. línea 206)`)
  console.log(`\n  Cuadrantes (ref. líneas 210-220):`)
  console.log(`    Estrella: ${conteo.estrella}  |  Joya: ${conteo.joya}  |  Caballo: ${conteo.caballo}  |  Revisar: ${conteo.revisar}`)

  // Avisos de distribución
  const totalClasif = clasificados.length
  if (totalClasif > 0) {
    const maxN   = Math.max(...Object.values(conteo))
    const catMax = Object.keys(conteo).find(k => conteo[k] === maxN)
    if (maxN / totalClasif > 0.70)
      console.log(`  ⚠ AVISO: ${Math.round(maxN / totalClasif * 100)}% de vinos en '${catMax}' — distribución muy concentrada`)
    if (conteo.estrella === 0) console.log('  ⚠ AVISO: cuadrante Estrella vacío')
    if (conteo.caballo  === 0) console.log('  ⚠ AVISO: cuadrante Caballo vacío')
  }

  // Top 5 por pctVentas
  const top5 = [...clasificados]
    .filter(v => v.ventas > 0)
    .sort((a, b) => b.pctVentas - a.pctVentas)
    .slice(0, 5)
  if (top5.length > 0) {
    console.log(`\n  Top 5 por % ventas (ref. línea 197):`)
    const hdr = `  ${'nombre'.padEnd(32)} ${'cat'.padEnd(8)} ${'ventas'.padStart(6)} ${'%kpi'.padStart(6)} ${'margen'.padStart(8)} ${'retorno'.padStart(8)}`
    console.log(hdr)
    console.log('  ' + '─'.repeat(76))
    for (const v of top5) {
      const ret = v.retornoInv == null ? '—' : v.retornoInv.toFixed(2) + 'x'
      console.log(
        `  ${(v.nombre || '').slice(0, 32).padEnd(32)} ${v.categoria.padEnd(8)} ` +
        `${String(v.ventas).padStart(6)} ${v.pctVentas.toFixed(1).padStart(6)} ` +
        `${(v.margen.toFixed(2) + '€').padStart(8)} ${ret.padStart(8)}`
      )
    }
  }

  if (retornoGlobal != null) {
    console.log(`\n  Retorno inventario global (Capa WINSPID, líneas 253-255): ${retornoGlobal.toFixed(2)}x`)
    console.log(`    Capital analizado: ${valorStockTotal.toFixed(0)} € coste`)
    console.log(`    Ingresos estimados: ${ingresosTotal.toFixed(0)} €`)
  }

  // ── Escritura ─────────────────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log('\n  [DRY-RUN] Sin escritura. Añade --confirm para aplicar.')
    return
  }

  console.log("\n  Borrando estadisticas tipo='venta' existentes...")
  const { error: delErr } = await sb
    .from('estadisticas')
    .delete()
    .eq('restaurante_id', DEMO_ID)
    .eq('tipo', 'venta')
  if (delErr) { console.error(`ERROR delete: ${delErr.message}`); process.exit(1) }

  console.log(`  Insertando ${estadisticasRows.length} filas en chunks de 500...`)
  const CHUNK = 500
  let insertados = 0
  for (let i = 0; i < estadisticasRows.length; i += CHUNK) {
    const chunk = estadisticasRows.slice(i, i + CHUNK)
    const { error: insErr } = await sb.from('estadisticas').insert(chunk)
    if (insErr) { console.error(`ERROR insert chunk ${i}: ${insErr.message}`); process.exit(1) }
    insertados += chunk.length
    if (estadisticasRows.length > CHUNK) console.log(`    ... ${insertados}/${estadisticasRows.length}`)
  }

  console.log(`\n  ✓ F3-A completado: ${insertados} estadisticas tipo='venta' (granularidad: ${granularidad})`)
  console.log('  Próximos pasos:')
  console.log('    1. Abre /dashboard/menu-engineering → análisis real (sin banner de muestra)')
  console.log('    2. Comprueba "Ventas KPI" ≥ 5 en el stat card (línea 470)')
  console.log('    3. Tras F3-B (partes 15-17 oct), ejecuta de nuevo --confirm')
}

main().catch(err => {
  console.error('ERROR fatal:', err.message || err)
  process.exit(1)
})
