/**
 * Seed del Motor de Precios de la demo Casa Marisma (Bloque 3).
 *
 *   - Rellena beneficio_objetivo y ventas_previstas en parametros_explotacion
 *     (periodo = mes en curso) coherentes con el histórico (Bloque 2).
 *   - Define 4 tramos de multiplicador por rango de coste.
 *   - Fija configuracion_pricing (metodo_pvp=multiplicador, descorche_fijo
 *     de respaldo, pvp_minimo_copa).
 *
 * Idempotente: upsert en parametros_explotacion y configuracion_pricing;
 * los tramos se borran y vuelven a insertar SOLO para el restaurante demo.
 * Blindado al UUID de Casa Marisma.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-casa-marisma-motor-precios.mjs             # dry-run
 *   node --env-file=.env.local scripts/seed-casa-marisma-motor-precios.mjs --apply     # escribe
 */
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')

const TARGET_ID      = '65d26545-7c7e-424c-9c29-33bfe8bbaafa'
const TARGET_NAME_LC = 'casa marisma'
const UUID_DENYLIST = new Set([
  'db3af496-00f1-4295-82b6-35427b9b6286',
  '7af94e33-48cd-43b8-b939-4796ba58e4d8',
  'a4346301-4dc5-4cb5-a2f5-3ca6469acd66',
  '6b528438-3d24-432d-9728-dc2ff868baf6',
])
if (UUID_DENYLIST.has(TARGET_ID)) { console.error('ERROR denylist'); process.exit(1) }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes.')
  console.error('Lanza con: node --env-file=.env.local scripts/seed-casa-marisma-motor-precios.mjs')
  process.exit(1)
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY)

const { data: rest } = await supa.from('restaurantes').select('id, nombre').eq('id', TARGET_ID).maybeSingle()
if (!rest || String(rest.nombre || '').toLowerCase() !== TARGET_NAME_LC) {
  console.error(`ERROR: restaurante destino inválido (${rest?.nombre || 'no encontrado'})`); process.exit(1)
}

const r2 = n => Math.round(Number(n) * 100) / 100

// ── 1. Agrega histórico para fijar ventas previstas ──────────────────────────
const { data: hist } = await supa
  .from('historico_mensual')
  .select('ingresos, consumo_mp, gastos_fijos, anio, mes')
  .eq('restaurante_id', TARGET_ID)
  .order('anio', { ascending: false })
  .order('mes', { ascending: false })

const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit' })
  .formatToParts(new Date())
const hoyY = Number(hoy.find(p => p.type === 'year').value)
const hoyM = Number(hoy.find(p => p.type === 'month').value)
const periodoActual = `${hoyY}-${String(hoyM).padStart(2,'0')}`

// Ventas previstas = media mensual sin IVA de los últimos 12 meses completos
// (excluye mes en curso para no mezclar parcial). sin IVA ≈ /1.10 (vino).
const mesesCompletos = (hist || []).filter(r => !(r.anio === hoyY && r.mes === hoyM)).slice(0, 12)
const avgIngresos = mesesCompletos.length
  ? mesesCompletos.reduce((s, r) => s + Number(r.ingresos), 0) / mesesCompletos.length
  : 9700  // fallback a escala de vino de la demo (coherente con Bloque 6)
const ventasPrevistasSinIVA = r2(avgIngresos / 1.10)

// Beneficio objetivo realista: 8% sobre ventas previstas anuales.
const beneficioObjetivo = r2(ventasPrevistasSinIVA * 12 * 0.08)

// ── 2. Upsert en parametros_explotacion para el periodo actual ──────────────
// Solo toca estas 2 columnas; el resto lo rellenó el Bloque 2.
const payloadMotor = {
  restaurante_id: TARGET_ID,
  periodo: periodoActual,
  beneficio_objetivo: beneficioObjetivo,
  ventas_previstas: ventasPrevistasSinIVA,
}

// ── 3. Tramos de multiplicador ──────────────────────────────────────────────
// Coherentes con margen medio ~64% sobre venta. Multiplicador medio ~2.8
// (margen = 1 - 1/mult). Se usan factores escalonados por rango de coste.
const tramosDemo = [
  { coste_min:  0.00, coste_max:   8.00, factor: 3.200, pvp_minimo_carta: 18.00, orden: 1 },
  { coste_min:  8.01, coste_max:  15.00, factor: 2.900, pvp_minimo_carta: 25.00, orden: 2 },
  { coste_min: 15.01, coste_max:  25.00, factor: 2.700, pvp_minimo_carta: 42.00, orden: 3 },
  { coste_min: 25.01, coste_max:  50.00, factor: 2.500, pvp_minimo_carta: 68.00, orden: 4 },
  { coste_min: 50.01, coste_max:   null, factor: 2.300, pvp_minimo_carta: 125.0, orden: 5 },
].map(t => ({ ...t, restaurante_id: TARGET_ID }))

// ── 4. Config de pricing ────────────────────────────────────────────────────
const configPricing = {
  restaurante_id: TARGET_ID,
  metodo_pvp: 'multiplicador',   // método elegido; what-if se calcula sobre este
  descorche_fijo: 12.00,         // respaldo
  pvp_minimo_copa: 5.00,
}

// ── 5. Resumen ───────────────────────────────────────────────────────────────
console.log(`\n[seed Motor de Precios Casa Marisma] destino: ${rest.nombre} (${TARGET_ID})`)
console.log(`Modo: ${APPLY ? 'APPLY (escribe)' : 'DRY-RUN (no escribe)'}`)
console.log(`Base: ${mesesCompletos.length} meses de histórico leídos (media mensual = ${r2(avgIngresos)} €)`)
console.log(`\nparametros_explotacion @ ${periodoActual} (merge parcial):`)
console.log(`  ventas_previstas:   ${ventasPrevistasSinIVA} € (sin IVA, media mensual del histórico)`)
console.log(`  beneficio_objetivo: ${beneficioObjetivo} € (8% sobre ventas anuales)`)
console.log(`\ntramos_multiplicador: ${tramosDemo.length} tramos a reinsertar`)
for (const t of tramosDemo) {
  console.log(`  [${t.orden}] ${t.coste_min.toFixed(2)}–${t.coste_max === null ? '∞' : t.coste_max.toFixed(2)} €  ×${t.factor.toFixed(3)}  PVP mín ${t.pvp_minimo_carta} €`)
}
console.log(`\nconfiguracion_pricing: metodo=${configPricing.metodo_pvp}, descorche_fijo=${configPricing.descorche_fijo}, pvp_minimo_copa=${configPricing.pvp_minimo_copa}`)

const margenMedioAprox = r2((1 - 1 / 2.8) * 100)
console.log(`\nMultiplicador medio esperado ≈ 2.8  (margen sobre venta ≈ ${margenMedioAprox} %)`)

if (!APPLY) {
  console.log('\nDry-run: no se escribe nada. Añade --apply para ejecutar.')
  process.exit(0)
}

// ── 6. Aplica ────────────────────────────────────────────────────────────────
// parametros_explotacion: upsert selectivo (no sobreescribe el resto porque
// usamos .update si la fila existe; si no, insert mínimo).
const { data: paramExist } = await supa
  .from('parametros_explotacion')
  .select('id')
  .eq('restaurante_id', TARGET_ID)
  .eq('periodo', periodoActual)
  .maybeSingle()

if (paramExist) {
  const { error } = await supa
    .from('parametros_explotacion')
    .update({ beneficio_objetivo: beneficioObjetivo, ventas_previstas: ventasPrevistasSinIVA })
    .eq('restaurante_id', TARGET_ID)
    .eq('periodo', periodoActual)
  if (error) { console.error('ERROR update parametros_explotacion:', error.message); process.exit(1) }
  console.log('✓ parametros_explotacion: actualizadas beneficio_objetivo y ventas_previstas.')
} else {
  const { error } = await supa.from('parametros_explotacion').insert(payloadMotor)
  if (error) { console.error('ERROR insert parametros_explotacion:', error.message); process.exit(1) }
  console.log('✓ parametros_explotacion: fila creada con los dos campos.')
}

// Tramos: borra los existentes de ESTE restaurante e inserta los nuevos.
const { error: errDel } = await supa.from('tramos_multiplicador').delete().eq('restaurante_id', TARGET_ID)
if (errDel) { console.error('ERROR delete tramos_multiplicador:', errDel.message); process.exit(1) }
const { error: errIns } = await supa.from('tramos_multiplicador').insert(tramosDemo)
if (errIns) { console.error('ERROR insert tramos_multiplicador:', errIns.message); process.exit(1) }
console.log(`✓ tramos_multiplicador: ${tramosDemo.length} filas reinsertadas.`)

const { error: errPr } = await supa
  .from('configuracion_pricing')
  .upsert(configPricing, { onConflict: 'restaurante_id' })
if (errPr) { console.error('ERROR upsert configuracion_pricing:', errPr.message); process.exit(1) }
console.log('✓ configuracion_pricing: upsert ok.')

console.log('\n[seed Motor de Precios Casa Marisma] completado.')
