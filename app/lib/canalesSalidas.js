/**
 * canalesSalidas.js — Lógica pura de la Fase 3 (canales de venta,
 * salidas no-venta y consumo derivado).
 *
 * No depende de Supabase ni del DOM. Todas las funciones son
 * idempotentes, null-safe y testables desde node --test.
 *
 * DOMINIO
 *   Botella estándar (750 ml) = 6 copas de 125 ml.
 *   Fortificado 750 ml       = 8 copas de 90 ml. Puede configurarse
 *   por vino cuando el formato cambia (p. ej. media botella 375 ml
 *   = 3 copas de 125 ml).
 *
 *   CONSUMO (método inventario)
 *     consumo = stock_inicial + compras_netas − stock_final_real
 *   STOCK FINAL TEÓRICO
 *     teorico = stock_inicial + compras_netas − salidas_totales
 *     salidas_totales = ventas_botella + copa_en_uds_botella + salidas_no_venta
 *   DIFERENCIA DE INVENTARIO
 *     diferencia = stock_final_real − stock_final_teorico
 *
 *   Todos los importes en euros a 4 decimales de precisión interna;
 *   el formato (es-ES, 1 decimal, etc.) se delega al consumer.
 */

// ── Constantes del dominio ────────────────────────────────────────────

/** ml por botella estándar. */
export const ML_BOTELLA_ESTANDAR = 750
/** ml por copa estándar. */
export const ML_COPA_ESTANDAR = 125
/** ml por copa de fortificado/licoroso. */
export const ML_COPA_FORTIFICADO = 90

// ── Helpers internos ──────────────────────────────────────────────────

function finito(n) {
  return typeof n === 'number' && Number.isFinite(n)
}
function toNum(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return finito(n) ? n : null
}
function r4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000
}

// ── Conversión copa ↔ botella ─────────────────────────────────────────

/**
 * Número de copas servibles por botella dado (ml_botella, ml_copa).
 * Devuelve siempre un entero ≥ 1 (una copa entera como mínimo cuando
 * la botella tenga capacidad). null si los parámetros son inválidos.
 */
export function copasPorBotella({ ml_botella = ML_BOTELLA_ESTANDAR, ml_copa = ML_COPA_ESTANDAR } = {}) {
  const b = toNum(ml_botella)
  const c = toNum(ml_copa)
  if (b == null || c == null || b <= 0 || c <= 0 || c > b) return null
  return Math.max(1, Math.floor(b / c))
}

/**
 * Convierte un número de COPAS servidas a UDS fraccionarias de
 * botella, usando la proporción (ml_copa / ml_botella).
 *
 *   copasAUdsBotella(6)                    → 1       (750/125)
 *   copasAUdsBotella(8,  { ml_copa: 90 })  → 0.96    (8*90/750)
 *   copasAUdsBotella(3)                    → 0.5
 *
 * Nota: usar `copasAUdsBotella` sólo cuando el consumo de copas se
 * vaya a sumar con unidades enteras de botella (p. ej. stock_final
 * teórico). Si ya tienes "botellas abiertas para copas" como entero,
 * no mezcles.
 */
export function copasAUdsBotella(copas, { ml_botella = ML_BOTELLA_ESTANDAR, ml_copa = ML_COPA_ESTANDAR } = {}) {
  const n = toNum(copas)
  const b = toNum(ml_botella)
  const c = toNum(ml_copa)
  if (n == null || b == null || c == null || b <= 0 || c <= 0) return null
  if (n <= 0) return 0
  return r4((n * c) / b)
}

/**
 * Inversa: cuántas copas sacas de N uds de botella.
 *   udsBotellaACopas(1)                     → 6
 *   udsBotellaACopas(1, { ml_copa: 90 })    → 8 (al redondear hacia abajo con 750/90=8.33)
 */
export function udsBotellaACopas(uds, { ml_botella = ML_BOTELLA_ESTANDAR, ml_copa = ML_COPA_ESTANDAR } = {}) {
  const n = toNum(uds)
  const copas = copasPorBotella({ ml_botella, ml_copa })
  if (n == null || copas == null || n < 0) return null
  return Math.floor(n * copas)
}

// ── Agregación de canales ─────────────────────────────────────────────

/**
 * Canales que forman las "ventas netas" (suman al facturado).
 * Vienen del snapshot `informe.por_canal` producido por
 * app/lib/agregarPeriodoBodega.js y de las cabeceras opcionales
 * (eventos_bodega) cuando las tablas estén aplicadas.
 */
export const CANALES_VENTA = Object.freeze(['botella', 'copa', 'maridaje', 'evento'])

/**
 * Canales de SALIDA NO-VENTA (no suman facturado; sí descuentan stock).
 * Coincide con app/lib/cierreDesglose.js → CATEGORIAS_SALIDA_SIN_VENTA.
 */
export const CANALES_SALIDA_SIN_VENTA = Object.freeze([
  'invitacion_botella', 'invitacion_copa',
  'cocina', 'grupo_evento', 'maridaje', 'rotura', 'cata',
])

/**
 * Normaliza el bloque `por_canal` del snapshot en una lista
 * homogénea `[{ canal, uds, ingresos_bruto, coste, beneficio }]`
 * sólo para los canales de VENTA. Añade `beneficio = ingresos − coste`.
 *
 * Si un canal no está en el snapshot se omite de la lista (en lugar
 * de inventar una fila en 0). El caller decide si pinta "Sin dato".
 */
export function listarCanalesVenta(porCanal = {}) {
  const out = []
  for (const canal of CANALES_VENTA) {
    const c = porCanal?.[canal]
    if (!c) continue
    const uds = toNum(c.uds) ?? 0
    const ingresos = toNum(c.ingresos) ?? toNum(c.valor) ?? 0
    const coste = toNum(c.coste) ?? 0
    const beneficio = r4(ingresos - coste)
    out.push({
      canal,
      uds: r4(uds),
      copas: toNum(c.copas) ?? null,
      ingresos_bruto: r4(ingresos),
      coste: r4(coste),
      beneficio,
    })
  }
  return out
}

/**
 * Misma normalización para salidas no-venta.
 * `coste` es el único importe relevante aquí (no hay facturado).
 */
export function listarSalidasNoVenta(porCanal = {}) {
  const out = []
  for (const canal of CANALES_SALIDA_SIN_VENTA) {
    const c = porCanal?.[canal]
    if (!c) continue
    const uds = toNum(c.uds) ?? toNum(c.botella_uds) ?? 0
    const coste = toNum(c.coste) ?? toNum(c.botella_coste) ?? toNum(c.valor) ?? 0
    const copas = toNum(c.copas) ?? toNum(c.copa_uds) ?? null
    out.push({
      canal,
      uds: r4(uds),
      copas,
      coste: r4(coste),
    })
  }
  return out
}

// ── Consumo derivado y conciliación teórico vs real ───────────────────

/**
 * Devuelve el "stock_final_teorico" según el método inventario:
 *
 *   teorico = stock_inicial + compras_netas − salidas_total
 *
 * donde `salidas_total` incluye TODO lo que descuenta stock:
 *   ventas_botella (uds enteros)
 *   copas en uds fraccionarias de botella
 *   salidas_no_venta (invitaciones + cocina + grupo + maridaje + rotura + cata)
 *
 * Null si cualquiera de los operandos inicial/compras falta.
 * Si `copas` viene sin `ml_copa`/`ml_botella`, se asume
 * (ML_BOTELLA_ESTANDAR, ML_COPA_ESTANDAR) → 6 copas por botella.
 */
export function calcularStockFinalTeorico({
  stock_inicial, compras_netas,
  ventas_botella_uds = 0,
  ventas_copa_copas  = 0,
  salidas_no_venta_uds = 0,
  ml_botella = ML_BOTELLA_ESTANDAR,
  ml_copa    = ML_COPA_ESTANDAR,
} = {}) {
  const ini = toNum(stock_inicial)
  const compras = toNum(compras_netas)
  if (ini == null || compras == null) return null
  const vb = toNum(ventas_botella_uds) ?? 0
  const copasUds = copasAUdsBotella(ventas_copa_copas, { ml_botella, ml_copa }) ?? 0
  const sin = toNum(salidas_no_venta_uds) ?? 0
  return r4(ini + compras - vb - copasUds - sin)
}

/**
 * Método inventario: consumo = inicial + compras − final_real.
 * Null si falta alguno de los tres operandos (NUNCA devuelve 0 para
 * "sin dato"; respeta la regla del repo: 0 es valor real).
 */
export function calcularConsumoDerivado({ stock_inicial, compras_netas, stock_final_real } = {}) {
  const ini = toNum(stock_inicial)
  const compras = toNum(compras_netas)
  const fin = toNum(stock_final_real)
  if (ini == null || compras == null || fin == null) return null
  return r4(ini + compras - fin)
}

/**
 * Conciliación teórico vs real. Devuelve:
 *   {
 *     teorico,                   // null si no se puede calcular
 *     real,                      // null si falta el conteo
 *     diferencia,                // real − teorico, null si falta alguno
 *     diferencia_pct,            // diferencia / teorico, null si teorico=0/null
 *     signo,                     // 'cuadra' | 'faltan' | 'sobran' | null
 *   }
 *
 * Tolerancia por defecto 0.5 uds para marcar "cuadra" (ajustable).
 */
export function conciliarTeoricoReal({
  stock_inicial, compras_netas,
  ventas_botella_uds, ventas_copa_copas, salidas_no_venta_uds,
  stock_final_real,
  ml_botella, ml_copa,
  tolerancia_uds = 0.5,
} = {}) {
  const teorico = calcularStockFinalTeorico({
    stock_inicial, compras_netas,
    ventas_botella_uds, ventas_copa_copas, salidas_no_venta_uds,
    ml_botella, ml_copa,
  })
  const real = toNum(stock_final_real)
  if (teorico == null || real == null) {
    return { teorico, real, diferencia: null, diferencia_pct: null, signo: null }
  }
  const dif = r4(real - teorico)
  const pct = teorico !== 0 ? r4(dif / teorico) : null
  let signo = 'cuadra'
  if (Math.abs(dif) > tolerancia_uds) signo = dif < 0 ? 'faltan' : 'sobran'
  return { teorico, real, diferencia: dif, diferencia_pct: pct, signo }
}
