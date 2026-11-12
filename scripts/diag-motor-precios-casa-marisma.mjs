/**
 * Diagnóstico SOLO LECTURA de Economía > Motor de Precios para Casa Marisma.
 * No escribe. Comprueba:
 *   - Qué vinos ve la query con filtro inclusivo (activo=true OR activo IS NULL)
 *     frente al filtro estricto anterior (activo=true).
 *   - Qué vinos tienen coste_compra y precio_botella (los que exige el What-If).
 *   - Qué PVP propondrían los tramos actuales y cuántos vinos tendrían
 *     cambio con un umbral de 0,5 € (el que usa la Previsualización).
 *   - Prueba del What-If: toma hasta 3 vinos y calcula impacto anual con
 *     +2 € y 100 uds/año. Sin divisiones por cero ni NaN.
 *   - Si los cambios reales son < 8, propone un ajuste SUAVE de los tramos
 *     (sin aplicarlo) que sitúa 8–12 vinos con cambio.
 *
 * Uso:
 *   node --env-file=.env.local scripts/diag-motor-precios-casa-marisma.mjs
 */
import { createClient } from '@supabase/supabase-js'

const TARGET_ID      = '65d26545-7c7e-424c-9c29-33bfe8bbaafa'
const TARGET_NAME_LC = 'casa marisma'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.')
  console.error('Lanza con: node --env-file=.env.local scripts/diag-motor-precios-casa-marisma.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

const r2 = n => Math.round(Number(n) * 100) / 100
const num = v => Number(v) || 0
const anadirIva = (n, pct = 10) => n * (1 + pct / 100)

// ── 1) Columnas presentes y conteos clave ──────────────────────────────────
console.log(`\n[diag motor-precios] destino: ${rest.nombre} (${TARGET_ID})`)

async function contar(q) { const { count } = await q.select('*', { count: 'exact', head: true }); return count || 0 }

const totalVinos = await contar(supa.from('vinos').eq('restaurante_id', TARGET_ID))
const vinosActivosEstricto = await contar(supa.from('vinos').eq('restaurante_id', TARGET_ID).eq('activo', true))
const vinosActivoFalse = await contar(supa.from('vinos').eq('restaurante_id', TARGET_ID).eq('activo', false))
const vinosActivoNull = await contar(supa.from('vinos').eq('restaurante_id', TARGET_ID).is('activo', null))

const { data: todosVinos } = await supa
  .from('vinos')
  .select('id, nombre, bodega, activo, coste_compra, precio_botella, precio_copa, stock, stock_minimo')
  .eq('restaurante_id', TARGET_ID)
  .order('nombre', { ascending: true })

const conCoste    = (todosVinos || []).filter(v => Number(v.coste_compra) > 0).length
const conPvp      = (todosVinos || []).filter(v => Number(v.precio_botella) > 0).length
const conPvpCopa  = (todosVinos || []).filter(v => Number(v.precio_copa) > 0).length

console.log(`\n── (1) Conteos de vinos ──────────────────────────────────────────`)
console.log(`  total vinos del restaurante:     ${totalVinos}`)
console.log(`  activo = true (filtro ESTRICTO): ${vinosActivosEstricto}`)
console.log(`  activo = false:                  ${vinosActivoFalse}`)
console.log(`  activo IS NULL:                  ${vinosActivoNull}`)
console.log(`  (filtro inclusivo = true o NULL): ${vinosActivosEstricto + vinosActivoNull}`)
console.log(`  con coste_compra > 0:            ${conCoste}`)
console.log(`  con precio_botella > 0:          ${conPvp}`)
console.log(`  con precio_copa > 0:             ${conPvpCopa}`)

if (vinosActivoNull > 0) {
  console.log(`\n  CAUSA probable del bug: ${vinosActivoNull} vinos tienen activo = NULL.`)
  console.log(`  La query de Motor de Precios filtraba .eq('activo', true) ESTRICTO y los excluía.`)
  console.log(`  El fix de este PR usa .or('activo.eq.true,activo.is.null') (como Bodega).`)
}

// ── 2) Tramos y configuración actuales ────────────────────────────────────
const { data: tramos }   = await supa.from('tramos_multiplicador').select('*').eq('restaurante_id', TARGET_ID).order('orden')
const { data: cfg }      = await supa.from('configuracion_pricing').select('*').eq('restaurante_id', TARGET_ID).maybeSingle()

console.log(`\n── (2) Tramos y configuración ────────────────────────────────────`)
console.log(`  tramos_multiplicador: ${tramos?.length || 0} filas`)
for (const t of (tramos || [])) {
  console.log(`    [${t.orden}] ${num(t.coste_min).toFixed(2)}–${t.coste_max == null ? '∞' : num(t.coste_max).toFixed(2)} €  ×${num(t.factor).toFixed(3)}  PVP mín ${t.pvp_minimo_carta ?? '—'}`)
}
console.log(`  configuracion_pricing: metodo_pvp=${cfg?.metodo_pvp ?? '—'}, descorche_fijo=${cfg?.descorche_fijo ?? '—'}, pvp_minimo_copa=${cfg?.pvp_minimo_copa ?? '—'}`)

// ── 3) Simulación de la Previsualización con los tramos actuales ───────────
// Lógica equivalente a app/lib/sommPricing.js:calcularPvpConTramos.
function pvpConTramos(costeNeto, tramosArr) {
  const coste = num(costeNeto)
  if (!coste || !(tramosArr || []).length) return { pvpNeto: 0, factor: 0 }
  const t = tramosArr.find(t => {
    const min = num(t.coste_min), max = t.coste_max != null ? num(t.coste_max) : Infinity
    return coste >= min && coste <= max
  })
  if (!t) return { pvpNeto: 0, factor: 0 }
  const f = num(t.factor)
  const pvpMin = num(t.pvp_minimo_carta)
  const bruto = coste * f
  const final = pvpMin ? Math.max(bruto, pvpMin) : bruto
  return { pvpNeto: final, factor: f }
}

const IVA = 10
function simular(vinoList, tramosArr) {
  const efectivos = vinoList.filter(v => num(v.coste_compra) > 0 && num(v.precio_botella) > 0)
  let conCambio = 0
  let sinCambio = 0
  const detalles = []
  for (const v of efectivos) {
    const { pvpNeto } = pvpConTramos(v.coste_compra, tramosArr)
    const pvpPropuestoBruto = Math.round(anadirIva(pvpNeto, IVA))
    const cambio = pvpPropuestoBruto - num(v.precio_botella)
    detalles.push({ nombre: v.nombre, coste: num(v.coste_compra), pvp_actual: num(v.precio_botella), pvp_propuesto: pvpPropuestoBruto, cambio: r2(cambio) })
    if (Math.abs(cambio) >= 0.5) conCambio += 1; else sinCambio += 1
  }
  return { efectivos: efectivos.length, conCambio, sinCambio, detalles }
}

const vinosEstadoApp = (todosVinos || []).filter(v => v.activo !== false)
const sim = simular(vinosEstadoApp, tramos || [])
console.log(`\n── (3) Simulación Previsualización (tramos actuales) ────────────`)
console.log(`  vinos con coste y PVP (los que cuentan): ${sim.efectivos}`)
console.log(`  con cambio |≥ 0,5 €|:                     ${sim.conCambio}`)
console.log(`  sin cambio significativo:                 ${sim.sinCambio}`)
if (sim.efectivos > 0) {
  const sample = sim.detalles.slice(0, 10)
  console.log(`  primeros 10 vinos y su propuesta:`)
  for (const d of sample) {
    console.log(`    ${String(d.nombre).slice(0, 40).padEnd(40)} coste=${d.coste.toFixed(2)}  PVPact=${d.pvp_actual}  prop=${d.pvp_propuesto}  Δ=${d.cambio.toFixed(2)}`)
  }
}

// ── 4) Prueba del What-If (sin NaN, sin dividir por 0) ────────────────────
console.log(`\n── (4) Prueba What-If con 3 vinos ─────────────────────────────────`)
const candidatos = (todosVinos || [])
  .filter(v => num(v.coste_compra) > 0 && num(v.precio_botella) > 0)
  .slice(0, 3)
if (!candidatos.length) {
  console.log('  no hay 3 vinos con coste y PVP para probar.')
} else {
  const subida = 2
  const uds    = 100
  let impactoTotal = 0
  for (const v of candidatos) {
    const nuevo = num(v.precio_botella) + subida
    // Precio neto = pvp / (1 + IVA). Impacto = (nuevo_neto - actual_neto) * uds.
    const actualNeto = num(v.precio_botella) / (1 + IVA / 100)
    const nuevoNeto  = nuevo / (1 + IVA / 100)
    const delta      = (nuevoNeto - actualNeto) * uds
    const nan        = Number.isNaN(delta) || !Number.isFinite(delta)
    impactoTotal += delta
    console.log(`  · ${String(v.nombre).slice(0, 36).padEnd(36)}  PVPact=${v.precio_botella}  nuevo=${nuevo}  uds=${uds}  Δanual=${r2(delta)}€  NaN=${nan}`)
  }
  console.log(`  impacto anual bruto total:   ${r2(impactoTotal)} €`)
}

// ── 5) Propuesta de tramos si los cambios reales son pocos ────────────────
console.log(`\n── (5) Propuesta de ajuste de tramos (si cambios < 8) ────────────`)
if (sim.conCambio >= 8 && sim.conCambio <= 12) {
  console.log(`  cambios actuales = ${sim.conCambio} → en el rango 8–12 esperado. No hace falta ajustar tramos.`)
} else {
  // Partimos de los tramos actuales y vamos subiendo o bajando los factores
  // en pequeñas unidades hasta que 8–12 vinos tengan cambio ≥ 0,5 €.
  const base = (tramos || []).map(t => ({ ...t, factor: num(t.factor) }))
  // Dirección: si hay 0 cambios y PVP actuales > propuestos, subimos factor;
  // si al revés, bajamos. Usamos la mediana de los deltas para decidir.
  const deltas = sim.detalles.map(d => d.pvp_propuesto - d.pvp_actual).sort((a, b) => a - b)
  const mediana = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 0
  const dir = mediana < 0 ? +0.05 : -0.05
  let mejor = null
  for (let delta = 0.05; delta <= 0.6; delta += 0.05) {
    const tramosAjust = base.map(t => ({ ...t, factor: r2(t.factor + dir * (delta / 0.05)) }))
    const s = simular(vinosEstadoApp, tramosAjust)
    if (s.conCambio >= 8 && s.conCambio <= 12) {
      mejor = { delta, tramos: tramosAjust, conCambio: s.conCambio }
      break
    }
  }
  if (!mejor) {
    console.log(`  no se encontró ajuste suave uniforme en ±0,05..±0,60. Prueba a mover tramos individuales.`)
  } else {
    console.log(`  propuesta (NO aplica, solo muestra): mover TODOS los factores ${dir > 0 ? '+' : '−'}${Math.abs(mejor.delta).toFixed(2)} respecto a los actuales.`)
    console.log(`  tramos propuestos:`)
    for (const t of mejor.tramos) {
      console.log(`    [${t.orden}] ${num(t.coste_min).toFixed(2)}–${t.coste_max == null ? '∞' : num(t.coste_max).toFixed(2)} €  ×${t.factor.toFixed(3)}`)
    }
    console.log(`  → vinos con cambio ≥ 0,5 € con esta propuesta: ${mejor.conCambio}`)
    console.log(`  Aplícalo tú mismo desde la UI de "Tramos de precio" o dime y hago un seed aparte.`)
  }
}

console.log(`\n[diag motor-precios] completado.`)
