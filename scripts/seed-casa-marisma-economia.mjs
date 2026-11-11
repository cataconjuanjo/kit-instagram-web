/**
 * Seed de Economía de la demo Casa Marisma (Bloque 2).
 *
 *   - Rellena parametros_explotacion para todos los meses que ya aparecen en
 *     historico_mensual + el mes en curso (parcial hasta ayer).
 *   - Rellena libro_compras con facturas por proveedor para los últimos 6 meses.
 *
 * Idempotente: usa UPSERT por (restaurante_id, periodo [, proveedor]).
 * Blindado al UUID de Casa Marisma demo. Aborta ante cualquier otro.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-casa-marisma-economia.mjs              # dry-run
 *   node --env-file=.env.local scripts/seed-casa-marisma-economia.mjs --apply      # escribe
 */
import { createClient } from '@supabase/supabase-js'

// ── Guardias ──────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply')

const TARGET_ID   = '65d26545-7c7e-424c-9c29-33bfe8bbaafa'
const TARGET_NAME_LC = 'casa marisma'
const UUID_DENYLIST = new Set([
  'db3af496-00f1-4295-82b6-35427b9b6286', // Lo de Carmen
  '7af94e33-48cd-43b8-b939-4796ba58e4d8', // Araboka
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66', // La Taberna del Puerto
  '6b528438-3d24-432d-9728-dc2ff868baf6', // Modo Sumiller
])
if (UUID_DENYLIST.has(TARGET_ID)) {
  console.error('ERROR: target UUID está en la denylist. Aborto.'); process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.')
  console.error('       Lanza con: node --env-file=.env.local scripts/seed-casa-marisma-economia.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Verificación del destino ──────────────────────────────────────────────────
const { data: rest, error: errRest } = await supa
  .from('restaurantes')
  .select('id, nombre, slug')
  .eq('id', TARGET_ID)
  .maybeSingle()
if (errRest || !rest) {
  console.error('ERROR: restaurante destino no encontrado.', errRest?.message || '')
  process.exit(1)
}
if (String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: el restaurante ${TARGET_ID} se llama "${rest.nombre}". Aborto.`)
  process.exit(1)
}

// ── Utilidades ────────────────────────────────────────────────────────────────
const MADRID_TZ = 'Europe/Madrid'
function hoyMadrid() {
  // "YYYY-MM-DD" en Europe/Madrid, usando Intl para no depender de la TZ del host.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year').value
  const m = parts.find(p => p.type === 'month').value
  const d = parts.find(p => p.type === 'day').value
  return `${y}-${m}-${d}`
}
function ayerMadrid() {
  const [y, m, d] = hoyMadrid().split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0))
  const yy = dt.getUTCFullYear(), mm = String(dt.getUTCMonth() + 1).padStart(2, '0'), dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
const periodoDe = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}`
const r2 = n => Math.round(Number(n) * 100) / 100

// ── 1. Lee histórico existente ────────────────────────────────────────────────
const { data: historico, error: errHist } = await supa
  .from('historico_mensual')
  .select('anio, mes, ingresos, consumo_mp, gastos_fijos, margen_explotacion')
  .eq('restaurante_id', TARGET_ID)
  .order('anio', { ascending: true })
  .order('mes', { ascending: true })
if (errHist) { console.error('ERROR leyendo historico_mensual:', errHist.message); process.exit(1) }

const hoy = hoyMadrid()
const [hoyY, hoyM] = hoy.split('-').map(Number)
const periodoActual = periodoDe(hoyY, hoyM)

const mesesHist = (historico || []).map(r => ({ anio: r.anio, mes: r.mes, ingresos: Number(r.ingresos), consumo_mp: Number(r.consumo_mp), gastos_fijos: Number(r.gastos_fijos) }))
const yaEstaActual = mesesHist.some(r => r.anio === hoyY && r.mes === hoyM)

// Si no hay histórico, el Bloque 6 lo generará. Aquí solo rellenamos sobre lo
// que exista, para quedar coherente con Analítica.
if (mesesHist.length === 0) {
  console.warn('AVISO: historico_mensual vacío para la demo. Ejecuta primero el seed del Bloque 6 (analitica/bonus) para tener base histórica.')
}

// Mes en curso parcial: extrapolación proporcional al día del mes.
// Si el histórico ya contiene el mes en curso lo respetamos tal cual.
function filaMesActualParcial() {
  const diaHoy = Number(hoy.split('-')[2])
  const diasMes = new Date(Date.UTC(hoyY, hoyM, 0)).getUTCDate()
  const factor = Math.max(1, diaHoy - 1) / diasMes // "hasta ayer"
  // Usa la media de los últimos 3 meses previos si existen; si no, valores razonables.
  const prev = mesesHist.filter(r => !(r.anio === hoyY && r.mes === hoyM)).slice(-3)
  const base = prev.length
    ? { ingresos: prev.reduce((s, r) => s + r.ingresos, 0) / prev.length,
        consumo_mp: prev.reduce((s, r) => s + r.consumo_mp, 0) / prev.length,
        gastos_fijos: prev.reduce((s, r) => s + r.gastos_fijos, 0) / prev.length }
    : { ingresos: 46000, consumo_mp: 14500, gastos_fijos: 23000 }
  return { anio: hoyY, mes: hoyM, ingresos: r2(base.ingresos * factor), consumo_mp: r2(base.consumo_mp * factor), gastos_fijos: r2(base.gastos_fijos * factor) }
}

const mesesDestino = [...mesesHist]
if (!yaEstaActual) mesesDestino.push(filaMesActualParcial())

// ── 2. Construye filas de parametros_explotacion ─────────────────────────────
function desglosarParametros(fila) {
  // Reparto típico de un restaurante con bodega:
  //   personal 55% de gastos_fijos (nóminas 70% / SS 20% / IRPF 10%)
  //   alquiler 18%  → partidas_alquiler (local + almacén)
  //   bancarios 4%  → datáfono + mantenimiento + resto
  //   operativos 23% → partidas_gastos (suministros, limpieza, marketing)
  const g = fila.gastos_fijos
  const personal = g * 0.55
  const nominas  = r2(personal * 0.70)
  const ssEmp    = r2(personal * 0.20)
  const irpf     = r2(personal * 0.08)
  const extras   = r2(personal - nominas - ssEmp - irpf)
  const alquiler = g * 0.18
  const alqLocal = r2(alquiler * 0.78)
  const alqAlm   = r2(alquiler - alqLocal)
  const bancarios = g * 0.04
  const datCom   = r2(bancarios * 0.45)
  const datMan   = r2(bancarios * 0.20)
  const resCom   = r2(bancarios - datCom - datMan)
  const operativos = r2(g * 0.23)
  // partidas_gastos JSONB array con amortización repartida
  const partidas_gastos = [
    { categoria: 'Suministros (luz, agua, gas)', importe: r2(operativos * 0.40), amortizacion: 0 },
    { categoria: 'Limpieza y menaje',             importe: r2(operativos * 0.20), amortizacion: 0 },
    { categoria: 'Marketing y comunicación',      importe: r2(operativos * 0.18), amortizacion: 0 },
    { categoria: 'Gestoría y seguros',            importe: r2(operativos * 0.14), amortizacion: 0 },
    { categoria: 'Mantenimiento maquinaria',      importe: r2(operativos * 0.08), amortizacion: 0 },
  ]
  const partidas_alquiler = [
    { categoria: 'Local (sala y cocina)', importe: alqLocal },
    { categoria: 'Almacén / bodega',      importe: alqAlm },
  ]
  // Mix de canales — "copa/barra", "botella/mesa", "grupos/eventos", "para llevar".
  const canales_negocio = {
    copa_barra:      r2(fila.ingresos * 0.22),
    botella_mesa:    r2(fila.ingresos * 0.58),
    grupos_eventos:  r2(fila.ingresos * 0.15),
    take_away:       r2(fila.ingresos - r2(fila.ingresos * 0.22) - r2(fila.ingresos * 0.58) - r2(fila.ingresos * 0.15)),
  }
  return {
    restaurante_id: TARGET_ID,
    periodo: periodoDe(fila.anio, fila.mes),
    facturacion_total: r2(fila.ingresos),
    consumo_mp: r2(fila.consumo_mp),
    nominas_brutas: nominas,
    ss_empresa: ssEmp,
    retenciones_irpf: irpf,
    extras_personal: extras,
    partidas_gastos,
    partidas_alquiler,
    comisiones_datafono: datCom,
    mantenimiento_datafono: datMan,
    resto_comisiones: resCom,
    canales_negocio,
    beneficio_objetivo: 0,  // lo rellena el Bloque 3 (Motor de Precios)
    ventas_previstas: 0,    // lo rellena el Bloque 3
  }
}

const filasParametros = mesesDestino.map(desglosarParametros)

// ── 3. Libro de compras: 6 meses, 4 proveedores ──────────────────────────────
const PROVEEDORES_DEMO = ['Bodegas Mar Málaga', 'Exclusivas Soto', 'Sommeliervinos', 'Vins Des Dieux']

function mesesUltimos(n) {
  // Devuelve [{anio, mes}] de los últimos n meses incluyendo el actual.
  const res = []
  let y = hoyY, m = hoyM
  for (let i = 0; i < n; i++) {
    res.unshift({ anio: y, mes: m })
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return res
}

function facturasProveedorMes(prov, mes) {
  // Dos a tres facturas por mes/proveedor con importes verosímiles.
  // Semilla por (prov+periodo) para que el dry-run sea estable entre ejecuciones.
  const seed = (prov + ' ' + periodoDe(mes.anio, mes.mes)).split('').reduce((s, c) => s + c.charCodeAt(0), 0)
  function psr() { // pseudo random 0..1
    const x = Math.sin(seedN++) * 10000
    return x - Math.floor(x)
  }
  let seedN = seed
  const diasMes = new Date(Date.UTC(mes.anio, mes.mes, 0)).getUTCDate()
  const n = 2 + Math.floor(psr() * 2) // 2 o 3
  const facturas = []
  const baseImporte = {
    'Bodegas Mar Málaga': 1600,
    'Exclusivas Soto':    1200,
    'Sommeliervinos':      950,
    'Vins Des Dieux':      780,
  }[prov] || 900
  for (let i = 0; i < n; i++) {
    const dia = Math.min(diasMes, 2 + Math.floor(psr() * (diasMes - 3)))
    const imp = r2(baseImporte * (0.65 + psr() * 0.75))
    facturas.push({
      fecha: `${mes.anio}-${String(mes.mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
      importe: imp,
      albaran: `${prov.slice(0, 3).toUpperCase()}-${mes.anio}${String(mes.mes).padStart(2, '0')}-${1000 + i}`,
    })
  }
  return facturas.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

const filasCompras = []
for (const mes of mesesUltimos(6)) {
  for (const prov of PROVEEDORES_DEMO) {
    filasCompras.push({
      restaurante_id: TARGET_ID,
      periodo: periodoDe(mes.anio, mes.mes),
      proveedor: prov,
      facturas: facturasProveedorMes(prov, mes),
    })
  }
}

// ── 4. Resumen ────────────────────────────────────────────────────────────────
console.log(`\n[seed Economía Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`Hoy (Madrid): ${hoy}  |  Ayer: ${ayerMadrid()}`)
console.log(`Meses histórico leídos: ${mesesHist.length}  |  Mes en curso incluido: ${yaEstaActual ? 'sí (tomado de histórico)' : 'sí (parcial calculado)'}`)
console.log(`parametros_explotacion: ${filasParametros.length} filas a upsert`)
console.log(`libro_compras:          ${filasCompras.length} filas a upsert (${PROVEEDORES_DEMO.length} proveedores × 6 meses)`)

if (filasParametros.length > 0) {
  const primero = filasParametros[0], ultimo = filasParametros[filasParametros.length - 1]
  console.log(`  parametros: ${primero.periodo}..${ultimo.periodo}`)
  console.log(`  ejemplo mes actual:`, JSON.stringify(filasParametros.find(r => r.periodo === periodoActual) || ultimo, null, 2))
}
if (filasCompras.length > 0) {
  const total6m = filasCompras.reduce((s, r) => s + r.facturas.reduce((a, f) => a + f.importe, 0), 0)
  console.log(`  total compras últimos 6 meses: ${r2(total6m)} €`)
}

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── 5. Aplica (una pasada por tabla) ──────────────────────────────────────────
const { error: errUP1 } = await supa
  .from('parametros_explotacion')
  .upsert(filasParametros, { onConflict: 'restaurante_id,periodo' })
if (errUP1) { console.error('ERROR upsert parametros_explotacion:', errUP1.message); process.exit(1) }
console.log(`✓ parametros_explotacion: ${filasParametros.length} filas upserted.`)

const { error: errUP2 } = await supa
  .from('libro_compras')
  .upsert(filasCompras, { onConflict: 'restaurante_id,periodo,proveedor' })
if (errUP2) { console.error('ERROR upsert libro_compras:', errUP2.message); process.exit(1) }
console.log(`✓ libro_compras: ${filasCompras.length} filas upserted.`)

console.log('\n[seed Economía Casa Marisma] completado.')
