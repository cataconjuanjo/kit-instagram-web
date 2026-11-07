/**
 * margenBodega.js — helpers puros para la métrica "Margen tras merma"
 * del cierre mensual en el perfil Somm.
 *
 * Identidad del snapshot (ver app/lib/agregarPeriodoBodega.js:481-488):
 *
 *   resultado = ventas_neto
 *             − coste_ventas_teorico
 *             − salidas_no_venta
 *             − merma_copa_eur
 *             + (diferencias_inventario ?? 0)
 *             − gastos_total
 *
 * Como margen_bruto = ventas_neto − coste_ventas_teorico, la identidad
 * equivalente usada por Somm es:
 *
 *   margen_tras_merma = margen_bruto
 *                     − salidas_no_venta
 *                     − merma_copa_eur
 *                     + (diferencias_inventario ?? 0)
 *
 *   resultado = margen_tras_merma − gastos_total
 *
 * La vista de Cierre mensual Somm oculta "Gastos del mes" y la línea
 * "Resultado neto bodega" y sustituye esta última por "Margen tras
 * merma", porque el perfil solo gestiona vino: los gastos de personal,
 * alquiler y bancarios se llevan en Explotación (no en este cierre).
 *
 * Sin BD aquí: se trabaja sobre snapshots ya resueltos por
 * calcularMesBodega() o la fila guardada en cierres_mensuales_bodega.
 */

function toNum(v) {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function r2(n) {
  return Math.round(n * 100) / 100
}

/**
 * margenTrasMerma(snapshot) → number | null
 *
 * Devuelve el "margen tras merma" en euros.
 * - Null si `snapshot` es falsy o `margen_bruto` no es un número finito.
 * - salidas_no_venta y merma_copa_eur ausentes se tratan como 0.
 * - diferencias_inventario ausente también 0 (no es equivalente a
 *   "sin conteos" → simplemente no aporta ajuste).
 *
 * Nota: redondeo a 2 decimales para evitar ruido de coma flotante que
 * rompa la identidad con snapshot.resultado + gastos_total.
 */
export function margenTrasMerma(snapshot) {
  if (!snapshot) return null
  const mb = snapshot.margen_bruto
  if (mb == null || !Number.isFinite(Number(mb))) return null
  const margenBruto    = Number(mb)
  const merma          = toNum(snapshot.merma_copa_eur)
  const salidas        = toNum(snapshot.salidas_no_venta)
  const difInventario  = toNum(snapshot.diferencias_inventario)
  return r2(margenBruto - merma - salidas + difInventario)
}

/**
 * identidadResultado(snapshot) → { ok, margen_tras_merma, gastos_total, resultado, delta }
 *
 * Verifica, para un snapshot, que:
 *   resultado ≈ margen_tras_merma − gastos_total   (± 0.02 €)
 *
 * Útil para los tests de fixtures reales.
 */
export function identidadResultado(snapshot) {
  const mtm = margenTrasMerma(snapshot)
  const gt  = toNum(snapshot?.gastos_total)
  const res = snapshot?.resultado == null ? null : Number(snapshot.resultado)
  if (mtm == null || res == null) {
    return { ok: false, margen_tras_merma: mtm, gastos_total: gt, resultado: res, delta: null }
  }
  const esperado = r2(mtm - gt)
  const delta = r2(res - esperado)
  return { ok: Math.abs(delta) < 0.02, margen_tras_merma: mtm, gastos_total: gt, resultado: res, delta }
}
